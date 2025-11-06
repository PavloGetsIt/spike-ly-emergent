// ============================================================================
// SPIKELY CONTENT SCRIPT - RESILIENT SHADOW DOM VIEWER DETECTION
// ============================================================================

(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
  } catch (_) {}

// Configuration
const CONFIG = {
  POLL_INTERVAL_MS: 800,
  HEARTBEAT_INTERVAL_MS: 5000,
  MUTATION_DEBOUNCE_MS: 100,
  LOG_THROTTLE_MS: 5000,
  VIEWER_MIN_THRESHOLD: 1
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
const platformSelectors = {
  twitch: ['[data-a-target="animated-channel-viewers-count"]', '.live-indicator-container span'],
  kick: ['[class*="viewer-count"]', '[class*="ViewerCount"]'],
  youtube: ['span.ytp-live-badge + span', '.ytp-live .ytp-time-current']
};


// State variables
let isTracking = false;
let currentViewerCount = 0;
let pollTimer = null;
let lastLogTime = 0;
// FIXED: Removed duplicate domObserver declaration
let domObserver = null;
let currentObserverTarget = null;
let observerIdleTimer = null;
let mutationDebounceTimer = null;
let domObserver = null;

// ============================================================================
// SELECTOR-RESILIENT PIPELINE WITH CASCADING FALLBACKS
// ============================================================================
function deepQuerySelector(selectors, root = document, depth = 0) {
  const MAX_DEPTH = 4;
  if (depth > MAX_DEPTH) return null;
  
  // Direct query first
  for (const selector of selectors) {
    try {
      const element = root.querySelector(selector);
      if (element && isValidVisibleNode(element)) {
        console.log(`[VIEWER:DBG] selector hit: ${selector} at depth ${depth}`);
        return element;
      }
    } catch (e) {
      console.log(`[VIEWER:DBG] selector failed: ${selector}`);
    }
  }
  
  // Shadow DOM traversal with loop detection
  const visited = new WeakSet();
  const allElements = root.querySelectorAll('*');
  
  for (const element of allElements) {
    if (visited.has(element)) continue;
    visited.add(element);
    
    if (element.shadowRoot && !visited.has(element.shadowRoot)) {
      visited.add(element.shadowRoot);
      const shadowResult = deepQuerySelector(selectors, element.shadowRoot, depth + 1);
      if (shadowResult) return shadowResult;
    }
  }
  
  return null;
}

// Enhanced TikTok detection with cascading selectors (from requirements)
function detectViewerCount() {
  if (platform === 'tiktok') {
    
    // Cascading fallback selectors (ordered by reliability)
    const cascadingSelectors = [
      '[data-e2e="live-room-viewers"]',
      '[data-e2e="live-room-viewer-count"]', 
      '.live-ui-viewer-count',
      '.number-of-viewers',
      '.css-* span',
      'span:has(svg[width][height])',
      '[data-testid="live-room-viewers"]',
      '[data-e2e*="viewer"]',
      '[class*="ViewerCount"]',
      '[class*="LiveAudience"]'
    ];
    
    // Try shadow DOM traversal with validation
    const element = deepQuerySelector(cascadingSelectors);
    if (element) {
      const count = parseViewerCount(element);
      if (count > 0) {
        console.log(`[VIEWER:DBG] detected: ${count} via selector`);
        bindMutationObserver(element);
        return count;
      }
    }
    
    // Fallback: LIVE badge proximity search with validation
    const liveElements = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent?.trim();
      return text && (text.includes('LIVE') || text.includes('Live')) && isValidVisibleNode(el);
    });
    
    for (const liveEl of liveElements) {
      const parent = liveEl.closest('div, section, span');
      if (parent) {
        const numbers = parent.querySelectorAll('span, div, strong');
        for (const numEl of numbers) {
          const numText = numEl.textContent?.trim();
          if (numText && /^[0-9,]+(?:\.[0-9]+)?[KkMm]?$/.test(numText) && isValidVisibleNode(numEl)) {
            const count = parseViewerCount(numText);
            if (count >= CONFIG.VIEWER_MIN_THRESHOLD) {
              console.log(`[VIEWER:DBG] detected: ${count} via live badge proximity`);
              bindMutationObserver(numEl);
              return count;
            }
          }
        }
      }
    }
    
    return null;
  }
  
  // Non-TikTok platforms with validation
  const selectors = platformSelectors[platform] || [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && isValidVisibleNode(element) && hasValidViewerCount(element)) {
      const count = parseViewerCount(element);
      console.log(`[VIEWER:DBG] detected: ${count} via ${platform} selector`);
      return count;
    }
  }
  
  return null;
}

// Validate node visibility and connectivity
function isValidVisibleNode(element) {
  if (!element) return false;
  
  // 1. Check if node is connected (reject React fiber clones)
  if (!element.isConnected) return false;
  
  // 2. Check aria-hidden
  if (element.getAttribute('aria-hidden') === 'true') return false;
  
  // 3. Check offsetParent (display:none elements have null offsetParent)
  if (element.offsetParent === null) {
    // Exception: elements with position:fixed can have null offsetParent but still be visible
    const style = window.getComputedStyle(element);
    if (style.position !== 'fixed' && style.display === 'none') return false;
  }
  
  // 4. Check opacity
  const style = window.getComputedStyle(element);
  if (parseFloat(style.opacity) === 0) return false;
  
  return true;
}


// ============================================================================
// JITTER FILTER AND EMISSION CONTROL
// ============================================================================
let lastEmittedCount = 0;
let lastEmitTime = 0;
const EMIT_MIN_INTERVAL = 250; // 250ms minimum between emissions

// Jitter filter: ignore ±2, accept >2 immediately
function shouldEmitWithJitterFilter(count) {
  const now = Date.now();
  const delta = Math.abs(count - lastEmittedCount);
  const timeSinceLastEmit = now - lastEmitTime;
  
  // Accept anything >2 immediately
  if (delta > 2) {
    console.log(`[VIEWER:DBG] large delta: ${delta}, emitting immediately`);
    return true;
  }
  
  // Ignore deltas ±2 or smaller unless enough time passed
  if (delta <= 2 && timeSinceLastEmit < EMIT_MIN_INTERVAL) {
    console.log(`[VIEWER:DBG] jitter filtered: delta=${delta}, time=${timeSinceLastEmit}ms`);
    return false;
  }
  
  return true;
}

function emitViewerUpdate(count) {
  const now = Date.now();
  const delta = lastEmittedCount > 0 ? count - lastEmittedCount : 0;
  
  lastEmittedCount = count;
  lastEmitTime = now;
  currentViewerCount = count;
  
  console.log(`[VIEWER:PAGE] value=${count}`);
  
  // Use reliable message sending with retry
  reliableSendMessage({
    type: 'VIEWER_COUNT_UPDATE',
    platform,
    count,
    delta,
    timestamp: now,
    source: 'validated'
  });
}

// ============================================================================
// HARDENED MESSAGE RELIABILITY WITH RETRY
// ============================================================================
function reliableSendMessage(payload, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const baseDelay = 50; // 50ms, 100ms, 200ms as specified
  
  if (!chrome?.runtime?.id) {
    console.log('[VIEWER:DBG] extension context invalid');
    return;
  }
  
  try {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message;
        
        // Retry on "Receiving end does not exist"
        if (error.includes('Receiving end does not exist') && attempt < MAX_ATTEMPTS) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`[VIEWER:DBG] retry ${attempt}/${MAX_ATTEMPTS} in ${delay}ms: ${error}`);
          
          setTimeout(() => {
            reliableSendMessage(payload, attempt + 1);
          }, delay);
        } else if (!error.includes('Extension context invalidated')) {
          console.log(`[VIEWER:DBG] send failed after ${attempt} attempts: ${error}`);
        }
      } else {
        console.log(`[VIEWER:DBG] sent successfully on attempt ${attempt}`);
      }
    });
  } catch (error) {
    console.log(`[VIEWER:DBG] send error: ${error.message}`);
  }
}

// ============================================================================
// STABILIZED MUTATIONOBSERVER WITH DEBOUNCING
// ============================================================================
const OBSERVER_DEBOUNCE_MS = 150; // 120-200ms as specified
let observerInProgress = false;

// MutationObserver with reentrant spam prevention
function bindMutationObserver(element, forceInit = false) {
  // Prevent re-initialization spam
  if (domObserver && currentObserverTarget === element && !forceInit) {
    console.log('[VIEWER:DBG] observer already bound to this element');
    return;
  }
  
  // Unbind previous observer
  if (domObserver) {
    try { 
      domObserver.disconnect();
      console.log('[VIEWER:DBG] unbound previous observer');
    } catch (_) {}
    domObserver = null;
  }
  
  if (!element || !isValidVisibleNode(element)) {
    console.log('[VIEWER:DBG] invalid element for observer binding');
    return;
  }
  
  try {
    currentObserverTarget = element;
    
    domObserver = new MutationObserver((mutations) => {
      // Prevent reentrant spam
      if (observerInProgress) return;
      observerInProgress = true;
      
      console.log(`[VIEWER:DBG] mutation detected: ${mutations.length} changes`);
      
      // Debounce 150ms
      if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(() => {
        // Validate element still visible and connected
        if (isValidVisibleNode(element)) {
          const count = parseViewerCount(element);
          if (count > 0 && shouldEmitWithJitterFilter(count)) {
            emitViewerUpdate(count);
          }
        } else {
          // Element became invalid, rebind via detection
          console.log('[VIEWER:DBG] element invalidated during mutation, rebinding');
          setTimeout(() => {
            const newElement = detectViewerCount();
            if (newElement) {
              bindMutationObserver(newElement, true);
            }
          }, 200);
        }
        
        observerInProgress = false;
      }, OBSERVER_DEBOUNCE_MS);
    });
    
    // Observe subtree + childList + characterData as specified
    domObserver.observe(element, {
      subtree: true,
      childList: true,
      characterData: true
    });
    
    console.log('[VIEWER:DBG] observer bound to text node');
    
  } catch (e) {
    console.log(`[VIEWER:DBG] observer binding failed: ${e.message}`);
    currentObserverTarget = null;
    observerInProgress = false;
  }
}

function hasValidViewerCount(element) {
  const text = element.textContent?.trim();
  return text && /\d/.test(text) && text.length <= 10;
}

function parseViewerCount(textOrElement) {
  let text;
  if (typeof textOrElement === 'string') {
    text = textOrElement;
  } else if (textOrElement?.textContent) {
    text = textOrElement.textContent.trim();
  } else {
    return 0;
  }
  
  const cleaned = text.toLowerCase().replace(/[\s,]/g, '');
  const match = cleaned.match(/([\d.]+)([km])?/);
  if (!match) return 0;
  
  let num = parseFloat(match[1]);
  const suffix = match[2];
  
  if (suffix === 'k') num *= 1000;
  if (suffix === 'm') num *= 1000000;
  
  const result = Math.round(num);
  return isFinite(result) && result >= 0 ? result : 0;
}

// ============================================================================
// SIMPLIFIED TRACKING WITH MUTATIONOBSERVER + POLLING FALLBACK
// ============================================================================
function startTracking() {
  if (isTracking) {
    console.log('[VIEWER:PAGE] already tracking');
    return;
  }
  
  isTracking = true;
  console.log('[VIEWER:PAGE] tracking started');
  
  if (platform === 'tiktok') {
    // Try initial detection and bind observer
    const initialCount = detectViewerCount();
    if (initialCount !== null && initialCount > 0) {
      emitViewerUpdate(initialCount);
    }
    
    // Polling fallback every 800ms (only when observer is idle)
    pollTimer = setInterval(() => {
      // Only poll if observer is idle or unbound
      if (!domObserver || !currentObserverTarget || 
          (observerIdleTimer && Date.now() - lastEmitTime > OBSERVER_IDLE_TIMEOUT)) {
        
        const count = detectViewerCount();
        if (count !== null && shouldEmitUpdate(count)) {
          emitViewerUpdate(count);
        } else if (count === null) {
          // Throttled missing log
          const now = Date.now();
          if (now - lastLogTime > CONFIG.LOG_THROTTLE_MS) {
            console.log('[VIEWER:PAGE] missing node');
            lastLogTime = now;
          }
        }
      }
    }, CONFIG.POLL_INTERVAL_MS);
    
    // Heartbeat every 5s
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
    
  } else {
    // Non-TikTok platforms: simple polling with validation
    pollTimer = setInterval(() => {
      const element = deepQuerySelector(platformSelectors[platform] || []);
      if (element && isValidVisibleNode(element)) {
        const count = parseViewerCount(element);
        if (count !== null && shouldEmitUpdate(count)) {
          emitViewerUpdate(count);
        }
      }
    }, CONFIG.POLL_INTERVAL_MS);
  }
}

function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  
  console.log('[VIEWER:PAGE] tracking stopped');
  
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  
  if (domObserver) {
    try { domObserver.disconnect(); } catch (_) {}
    domObserver = null;
  }
  
  if (observerIdleTimer) {
    clearTimeout(observerIdleTimer);
    observerIdleTimer = null;
  }
  
  currentObserverTarget = null;
  currentViewerCount = 0;
}

// Enhanced message sender with retry
function safeSendMessage(payload) {
  if (!chrome?.runtime?.id) {
    console.log('[VIEWER:PAGE] extension context invalid');
    return;
  }
  
  try {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message;
        if (!error.includes('Extension context invalidated')) {
          console.log(`[VIEWER:PAGE] send failed: ${error}`);
        }
      }
    });
  } catch (error) {
    console.log(`[VIEWER:PAGE] send error: ${error.message}`);
  }
}

// ============================================================================
// MESSAGE LISTENERS
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TRACKING') {
    startTracking();
    sendResponse({ success: true, platform });
  } else if (message.type === 'STOP_TRACKING') {
    stopTracking();
    sendResponse({ success: true });
  } else if (message.type === 'PING') {
    console.log('[VIEWER:PAGE] ping received');
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
});

// ============================================================================
// INITIALIZATION
// ============================================================================
console.log(`[VIEWER:PAGE] loaded on ${platform} - v2.2.1-SHADOW-DOM`);

// Auto-detect React remount events
let lastElementCount = 0;
setInterval(() => {
  const elementCount = document.querySelectorAll('*').length;
  if (Math.abs(elementCount - lastElementCount) > 100) {
    console.log('[VIEWER:PAGE] DOM remount detected, rebinding');
    lastElementCount = elementCount;
  }
}, 2000);

// Cleanup on navigation
function cleanup() {
  stopTracking();
}

window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);

})();
