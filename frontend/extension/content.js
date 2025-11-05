(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      console.log('[Spikely] Content script already initialized - skipping reinjection');
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
  } catch (_) {}

// ============================================================================
// SPIKELY CONTENT SCRIPT - CLEAN MODULAR VIEWER DETECTION  
// ============================================================================

(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      console.log('[Spikely] Content script already initialized - skipping reinjection');
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
  } catch (_) {}

// Configuration
const CONFIG = {
  POLL_INTERVAL_MS: 800,
  HEARTBEAT_INTERVAL_MS: 5000, 
  MUTATION_DEBOUNCE_MS: 100,
  PORT_RETRY_MAX: 5,
  PORT_RETRY_DELAY_BASE: 1000,
  LOG_THROTTLE_MS: 15000,
  VIEWER_MIN_THRESHOLD: 100
};

// Platform detection
function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('tiktok.com')) return 'tiktok';
  if (hostname.includes('twitch.tv')) return 'twitch';
  if (hostname.includes('kick.com')) return 'kick';  
  if (hostname.includes('youtube.com')) return 'youtube';
  return 'unknown';
}

const platform = detectPlatform();

// Platform-specific selectors
const PLATFORM_SELECTORS = {
  tiktok: [
    '[data-e2e="live-room-viewers"]',
    '[data-testid="live-room-viewers"]',
    '[data-e2e*="live-audience"]', 
    '[data-e2e*="viewer-count"]',
    '[data-testid*="viewer"]',
    '[class*="LiveViewerCount"]',
    '[class*="AudienceCount"]',
    '.P4-Regular.text-UIText3',
    'div:has(> span.inline-flex.justify-center)',
    '[class*="viewer"]'
  ],
  twitch: [
    '[data-a-target="animated-channel-viewers-count"]',
    '.live-indicator-container span',
    'p[data-test-selector="viewer-count"]'
  ],
  kick: [
    '[class*="viewer-count"]',
    '[class*="ViewerCount"]',
    'div[class*="stats"] span:first-child'
  ],
  youtube: [
    'span.ytp-live-badge + span',
    '.ytp-live .ytp-time-current', 
    'ytd-video-primary-info-renderer #count'
  ]
};

// State variables
let currentViewerCount = 0;
let detectionInterval = null;
let isTracking = false;
let lastSentCount = 0;
let lastSentAt = 0;
let cachedViewerEl = null;
let cachedContainer = null;
let domObserver = null;
let lastNotFoundLog = 0;

// Port management
let viewerCountPort = null;
let portRetryAttempts = 0;
let portReconnectTimer = null;
let mutationRetryCount = 0;
let mutationRetryTimer = null;
let mutationDebounceTimer = null;

// Silence noisy unhandled rejections when extension reloads
try {
  window.addEventListener('unhandledrejection', (e) => {
    const reason = String(e.reason || '');
    if (
      reason.includes('Extension context invalidated') ||
      reason.includes('Could not establish connection') ||
      reason.includes('Receiving end does not exist')
    ) {
      e.preventDefault();
    }
  });
} catch (_) {}


console.log(`[Spikely] Detected platform: ${platform}`);

// Enhanced TikTok viewer detection with dynamic node re-querying
function queryViewerNode() {
  // Always re-query the node (do not store static reference for ephemeral DOM)
  cachedViewerEl = null;

  if (platform === 'tiktok') {
    
    // TIER 1: Enhanced 2025 TikTok selectors
    const tier1Selectors = [
      '[data-e2e="live-room-viewers"]',
      '[data-testid="live-room-viewers"]',
      '[data-e2e*="live-audience"]',
      '[data-e2e*="viewer-count"]',
      '[data-testid*="viewer"]',
      '[class*="LiveViewerCount"]',
      '[class*="AudienceCount"]'
    ];
    
    for (const selector of tier1Selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const parsed = normalizeAndParse(element);
        if (parsed !== null && parsed > 0) {
          console.log(`[VIEWER:PAGE] value=${parsed}`);
          cachedViewerEl = element;
          cachedContainer = element.closest('div[data-e2e*="live"], section, [class*="live"]') || element.parentElement;
          return element;
        }
      }
    }
    
    // TIER 2: Aria-label with enhanced regex
    const ariaElements = document.querySelectorAll('[aria-label*="view"], [aria-label*="watching"], [aria-label*="audience"]');
    for (const element of ariaElements) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        // Extract number with enhanced regex: [0-9,\.KM]+
        const match = ariaLabel.match(/([0-9,]+(?:\.[0-9]+)?[KkMm]?)/);
        if (match) {
          const countText = match[1].replace(/,/g, '');
          const parsed = normalizeAndParse(countText);
          if (parsed !== null && parsed > 0) {
            console.log(`[VIEWER:PAGE] value=${parsed}`);
            cachedViewerEl = element;
            cachedContainer = element.closest('div[data-e2e*="live"], section, [class*="live"]') || element.parentElement;
            return element;
          }
        }
      }
    }
    
    // TIER 3: Widget container traversal (find smallest container)
    const widgetContainers = document.querySelectorAll('div[data-e2e*="live"], section[class*="live"], [class*="viewer-info"]');
    for (const container of widgetContainers) {
      const numberSpans = container.querySelectorAll('span, div, strong');
      for (const span of numberSpans) {
        const text = span.textContent?.trim();
        if (text && /^[0-9,]+(?:\.[0-9]+)?[KkMm]?$/.test(text)) {
          const containerText = container.textContent.toLowerCase();
          if (containerText.includes('viewer') || containerText.includes('watching') || 
              containerText.includes('audience') || containerText.includes('live')) {
            const parsed = normalizeAndParse(text);
            if (parsed !== null && parsed > 100) {
              console.log(`[VIEWER:PAGE] value=${parsed}`);
              cachedViewerEl = span;
              cachedContainer = container; // Use widget container for observation
              return span;
            }
          }
        }
      }
    }
    
    // Throttled "not found" logging (max 1 per 15s)
    const now = Date.now();
    if (now - lastNotFoundLog > 15000) {
      console.log('[VIEWER:PAGE] node missing (throttled warning)');
      lastNotFoundLog = now;
    }
    
    return null;
  }

  return null;
}

// Add throttling for "not found" logs
let lastNotFoundLog = 0;
        }
      }
    }

    // Tier 2: Priority selector sweep
    const selectors = PLATFORM_SELECTORS[platform] || [];
    console.log('[VC:DEBUG] 🎯 Trying', selectors.length, 'priority selectors...');
    
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const element = document.querySelector(selector);
      
      if (element && element.textContent?.trim()) {
        const text = element.textContent.trim();
        const parsed = normalizeAndParse(element);
        console.log(`[VC:DEBUG] Selector ${i + 1}: "${selector}" → "${text}" → ${parsed}`);
        
        if (parsed !== null && parsed > 0) {
          console.log('[VC:DEBUG] ✅ TIER 2 SUCCESS: Found via selector', i + 1, 'count =', parsed);
          cachedViewerEl = element;
          return element;
        }
      } else {
        console.log(`[VC:DEBUG] Selector ${i + 1}: "${selector}" → NOT FOUND`);
      }
    }

    console.log('[VC:DEBUG] ❌ All methods failed - no viewer count found');
    return null;
  }

  // Non-TikTok platforms: simple selector sweep
  const selectors = PLATFORM_SELECTORS[platform] || [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent?.trim()) {
      cachedViewerEl = element;
      return element;
    }
  }
  
  // Non-TikTok platforms: simple selector sweep
  const platformSelectors = PLATFORM_SELECTORS[platform] || [];
  for (const selector of platformSelectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent?.trim()) {
      cachedViewerEl = element;
      return element;
    }
  }

  return null;
}

// ============================================================================
// ROBUST TEXT NORMALIZATION & PARSING
// ============================================================================
function normalizeAndParse(textOrElement) {
  if (!textOrElement) return null;
  
  let text;
  if (typeof textOrElement === 'string') {
    text = textOrElement;
  } else if (textOrElement.textContent) {
    text = textOrElement.textContent.trim();
  } else {
    return null;
  }
  
  const cleaned = text.toLowerCase().replace(/[\s,]/g, '');
  const match = cleaned.match(/([\d.]+)([km])?/);
  if (!match) return null;
  
  let num = parseFloat(match[1]);
  const suffix = match[2];
  
  if (suffix === 'k') num *= 1000;
  if (suffix === 'm') num *= 1000000;
  
  const result = Math.round(num);
  return isFinite(result) && result >= 0 ? result : null;
}

// Initialize persistent port connection with enhanced lifecycle management
function initializeViewerCountPort() {
  try {
    if (viewerCountPort) {
      try {
        viewerCountPort.disconnect();
      } catch (e) {
        // Port already disconnected
      }
    }
    
    viewerCountPort = chrome.runtime.connect({ name: 'viewer-count-port' });
    portRetryAttempts = 0;
    
    // All ports must register port.onDisconnect with auto-reconnect
    viewerCountPort.onDisconnect.addListener(() => {
      console.log('[VIEWER:PAGE] port disconnected, reconnecting...');
      viewerCountPort = null;
      
      // Auto-reconnect with exponential backoff (max 5 attempts)
      if (portRetryAttempts < MAX_PORT_RETRIES) {
        portRetryAttempts++;
        const delay = Math.min(1000 * Math.pow(2, portRetryAttempts - 1), 8000);
        
        if (portReconnectTimer) clearTimeout(portReconnectTimer);
        portReconnectTimer = setTimeout(() => {
          initializeViewerCountPort();
        }, delay);
      } else {
        console.log('[VIEWER:PAGE] port max retries reached, fallback mode');
        portRetryAttempts = 0; // Reset for future attempts
      }
    });
    
    console.log('[VIEWER:PAGE] port connected');
  } catch (error) {
    // Never throw raw errors on disconnect
    console.log('[VIEWER:PAGE] port connection failed:', error.message);
    viewerCountPort = null;
  }
}

// Enhanced safe message sender - never throws raw errors
function safeSendMessage(payload) {
  try {
    // Try persistent port first
    if (viewerCountPort) {
      try {
        viewerCountPort.postMessage(payload);
        return;
      } catch (error) {
        // Don't log expected disconnection errors
        if (!error.message.includes('disconnected') && !error.message.includes('closed')) {
          console.log('[VIEWER:PAGE] port send failed:', error.message);
        }
        viewerCountPort = null;
      }
    }
    
    // Fallback to runtime sendMessage
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          // Only log unexpected errors
          if (!errorMsg.includes('Extension context invalidated') && 
              !errorMsg.includes('Could not establish connection') &&
              !errorMsg.includes('disconnected')) {
            console.log('[VIEWER:PAGE] runtime message error:', errorMsg);
          }
        }
      });
    }
  } catch (error) {
    // Silent fail for context invalidation
  }
}

// ============================================================================
// SIMPLIFIED VIEWER COUNT EMISSION (removed complex warmup logic)
// ============================================================================
function emitViewerCount(count, delta) {
  const now = Date.now();
  currentViewerCount = count;
  lastSentCount = count;
  lastSentAt = now;
  
  const payload = {
    type: 'VIEWER_COUNT_UPDATE',
    platform,
    count,
    delta,
    timestamp: now,
    confidence: 1.0
  };
  
  safeSendMessage(payload);
  console.log(`[VIEWER:PAGE] value=${count}`);
}

// ============================================================================
// Enhanced MutationObserver that rebinds on node disappearance
// ============================================================================
let mutationDebounceTimer = null;
let mutationRetryCount = 0;
let mutationRetryTimer = null;

function setupMutationObserver() {
  if (domObserver) {
    try { domObserver.disconnect(); } catch (_) {}
  }
  
  if (!cachedContainer) {
    // Retry with reduced attempts to avoid infinite loops
    if (mutationRetryCount < 5) {
      mutationRetryCount++;
      if (mutationRetryTimer) clearTimeout(mutationRetryTimer);
      mutationRetryTimer = setTimeout(() => {
        const node = queryViewerNode();
        if (node && cachedContainer) {
          mutationRetryCount = 0;
          setupMutationObserver();
        }
      }, 1000);
    }
    return;
  }
  
  try {
    domObserver = new MutationObserver((mutations) => {
      // Check if cached node still exists, rebind if disappeared
      if (cachedViewerEl && !document.contains(cachedViewerEl)) {
        console.log('[VIEWER:PAGE] node disappeared, rebinding observer');
        const node = queryViewerNode();
        if (node && cachedContainer) {
          setupMutationObserver(); // Rebind to new container
        }
        return;
      }
      
      // Detect numeric changes via text OR aria-label regex
      let shouldUpdate = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          shouldUpdate = true;
          break;
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label') {
          const newAriaLabel = mutation.target.getAttribute('aria-label');
          if (newAriaLabel && /[0-9,\.KM]+/.test(newAriaLabel)) {
            shouldUpdate = true;
            break;
          }
        }
      }
      
      if (shouldUpdate) {
        if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = setTimeout(() => {
          handleMutation();
        }, TT_CONFIG.MUTATION_DEBOUNCE_MS);
      }
    });
    
    // Observe only the widget container (not document.body)
    domObserver.observe(cachedContainer, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label']
    });
    
    console.log('[VIEWER:PAGE] observer bound to widget container');
    mutationRetryCount = 0;
  } catch (e) {
    console.log('[VIEWER:PAGE] observer setup failed:', e.message);
  }
}

function handleMutation() {
  // Always re-query the node on mutation (dynamic DOM changes)
  const node = queryViewerNode();
  if (node) {
    const parsed = normalizeAndParse(node);
    if (parsed !== null) {
      processValidatedSample(parsed);
    }
  }
}

// ============================================================================
// SPA Navigation Detection & Recovery
// ============================================================================
function detectNavigation() {
  const currentPathname = window.location.pathname;
  if (currentPathname !== lastPathname) {
    console.debug(`[TT:NAV] Route change detected: ${lastPathname} → ${currentPathname}`);
    lastPathname = currentPathname;
    
    // Tear down observer
    if (domObserver) {
      try { domObserver.disconnect(); } catch (_) {}
      domObserver = null;
    }
    
    // Clear cached nodes
    cachedViewerEl = null;
    cachedContainer = null;
    
    // Restart warm-up after brief delay
    setTimeout(() => {
      if (isTracking) {
        startWarmup();
        const node = queryViewerNode();
        if (node) setupMutationObserver();
      }
    }, 500);
  }
}


// ============================================================================
// Start Tracking (Initialize Warm-Up + Observer)
// ============================================================================
// ============================================================================
// SIMPLIFIED TRACKING SYSTEM (removed complex warm-up logic)
// ============================================================================
function startTracking() {
  if (isTracking) {
    console.log('[VIEWER:PAGE] already tracking');
    return;
  }
  
  isTracking = true;
  console.log('[VIEWER:PAGE] tracking started');
  
  // Initialize port connection
  initializeViewerCountPort();
  
  if (platform === 'tiktok') {
    // Start direct polling for TikTok (800ms cycle)
    detectionInterval = setInterval(() => {
      const count = detectViewerCount();
      if (count !== null && count !== currentViewerCount) {
        const delta = currentViewerCount > 0 ? count - currentViewerCount : 0;
        emitViewerCount(count, delta);
        setupMutationObserver(); // Rebind observer to current node
      }
    }, CONFIG.POLL_INTERVAL_MS);
    
    // Heartbeat every 5s even if unchanged
    setInterval(() => {
      if (isTracking && currentViewerCount > 0) {
        safeSendMessage({
          type: 'VIEWER_HEARTBEAT',
          platform,
          count: currentViewerCount,
          timestamp: Date.now()
        });
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
    
    // Try initial detection
    const initialCount = detectViewerCount();
    if (initialCount !== null && initialCount > 0) {
      emitViewerCount(initialCount, 0);
      setupMutationObserver();
    }
  } else {
    // Non-TikTok platforms: simplified polling
    detectionInterval = setInterval(() => {
      const element = queryViewerNode();
      if (element) {
        const count = normalizeAndParse(element);
        if (count !== null && count !== currentViewerCount) {
          const delta = currentViewerCount > 0 ? count - currentViewerCount : 0;
          emitViewerCount(count, delta);
        }
      }
    }, CONFIG.POLL_INTERVAL_MS);
  }
}

function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  
  console.log('[VIEWER:PAGE] tracking stopped');
  
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  
  if (domObserver) {
    try { domObserver.disconnect(); } catch (_) {}
    domObserver = null;
  }
  
  if (viewerCountPort) {
    try { viewerCountPort.disconnect(); } catch (_) {}
    viewerCountPort = null;
  }
}

// Simplified detection function
function detectViewerCount() {
  const node = queryViewerNode();
  if (node) {
    return normalizeAndParse(node);
  }
  
  // Throttled missing log
  const now = Date.now();
  if (now - lastNotFoundLog > CONFIG.LOG_THROTTLE_MS) {
    console.log('[VIEWER:PAGE] node missing');
    lastNotFoundLog = now;
  }
  
  return null;
}

// Listen for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TRACKING') {
    if (message?.reset) {
      resetTracking();
    } else {
      startTracking();
    }
    console.log('[VIEWER:PAGE] ✅ START_TRACKING received', { platform, isTracking: true });
    sendResponse({ type: 'ACK_START', platform, isTracking: true });
  } else if (message.type === 'STOP_TRACKING') {
    stopTracking();
    sendResponse({ success: true });
  } else if (message.type === 'RESET_TRACKING') {
    resetTracking();
    sendResponse({ success: true, platform });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ isTracking, platform, currentCount: currentViewerCount });
  } else if (message.type === 'PING') {
    console.log('[VIEWER:PAGE] PING received', { platform });
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
  // All responses above are synchronous; no need to return true.
});

// Content script loaded - initialize port and wait for START_TRACKING
console.log('[VIEWER:PAGE] Content script loaded - Version 2.1.1-LVT-HARDENED');

// Run parser validation tests
validateParserFix();

// Initialize port connection (but don't start tracking yet)
initializeViewerCountPort();

// Enhanced cleanup on navigation to prevent port leaks
function cleanup() {
  try {
    stopTracking();
    if (viewerCountPort) {
      viewerCountPort.disconnect();
      viewerCountPort = null;
    }
    if (portReconnectTimer) {
      clearTimeout(portReconnectTimer);
      portReconnectTimer = null;
    }
    if (mutationRetryTimer) {
      clearTimeout(mutationRetryTimer);
      mutationRetryTimer = null;
    }
  } catch (_) {}
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);
})();
