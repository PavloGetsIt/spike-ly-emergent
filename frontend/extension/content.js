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

// State variables
let isTracking = false;
let currentViewerCount = 0;
let pollTimer = null;
let heartbeatTimer = null;
let lastLogTime = 0;

// ============================================================================
// RECURSIVE SHADOW DOM TRAVERSAL
// ============================================================================
function deepQuerySelector(selectors, root = document) {
  // First try direct query
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (element && hasValidViewerCount(element)) {
      return element;
    }
  }
  
  // Recursive shadow DOM traversal
  const allElements = root.querySelectorAll('*');
  for (const element of allElements) {
    if (element.shadowRoot) {
      const shadowResult = deepQuerySelector(selectors, element.shadowRoot);
      if (shadowResult) return shadowResult;
    }
  }
  
  return null;
}

// ============================================================================
// ENHANCED TIKTOK VIEWER DETECTION
// ============================================================================
function detectViewerCount() {
  if (platform === 'tiktok') {
    
    // Modern TikTok selectors for shadow DOM
    const selectors = [
      '.viewer-count',
      'span[data-e2e="live-viewer-count"]',
      '[data-e2e="live-room-viewers"]',
      '[data-testid="live-room-viewers"]',
      '[data-e2e*="viewer"]',
      '[data-e2e*="audience"]',
      '[class*="ViewerCount"]',
      '[class*="LiveAudience"]'
    ];
    
    // Try shadow DOM traversal
    const element = deepQuerySelector(selectors);
    if (element) {
      const count = parseViewerCount(element);
      if (count > 0) {
        return count;
      }
    }
    
    // Fallback: Search for numeric text near Live badge
    const liveElements = document.querySelectorAll('*');
    for (const el of liveElements) {
      const text = el.textContent?.trim();
      if (text && (text.includes('LIVE') || text.includes('Live'))) {
        // Look for nearby numeric elements
        const parent = el.closest('div, section, span');
        if (parent) {
          const numbers = parent.querySelectorAll('span, div');
          for (const numEl of numbers) {
            const numText = numEl.textContent?.trim();
            if (numText && /^\d+(\.\d+)?[KkMm]?$/.test(numText)) {
              const count = parseViewerCount(numText);
              if (count >= CONFIG.VIEWER_MIN_THRESHOLD) {
                return count;
              }
            }
          }
        }
      }
    }
    
    return null;
  }
  
  // Non-TikTok platforms
  const platformSelectors = {
    twitch: ['[data-a-target="animated-channel-viewers-count"]', '.live-indicator-container span'],
    kick: ['[class*="viewer-count"]', '[class*="ViewerCount"]'],
    youtube: ['span.ytp-live-badge + span', '.ytp-live .ytp-time-current']
  };
  
  const selectors = platformSelectors[platform] || [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && hasValidViewerCount(element)) {
      return parseViewerCount(element);
    }
  }
  
  return null;
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
// TRACKING SYSTEM WITH 800MS POLLING
// ============================================================================
function startTracking() {
  if (isTracking) {
    console.log('[VIEWER:PAGE] already tracking');
    return;
  }
  
  isTracking = true;
  console.log('[VIEWER:PAGE] tracking started');
  
  // Poll every 800ms
  pollTimer = setInterval(() => {
    const count = detectViewerCount();
    
    if (count !== null && count >= CONFIG.VIEWER_MIN_THRESHOLD) {
      console.log(`[VIEWER:PAGE] value=${count}`);
      
      if (count !== currentViewerCount) {
        const delta = currentViewerCount > 0 ? count - currentViewerCount : 0;
        currentViewerCount = count;
        
        // Send viewer update
        safeSendMessage({
          type: 'VIEWER_COUNT_UPDATE',
          platform,
          count,
          delta,
          timestamp: Date.now(),
          source: 'polling'
        });
      }
    } else {
      // Throttled missing log
      const now = Date.now();
      if (now - lastLogTime > CONFIG.LOG_THROTTLE_MS) {
        console.log('[VIEWER:PAGE] missing node (throttled)');
        lastLogTime = now;
      }
    }
  }, CONFIG.POLL_INTERVAL_MS);
  
  // Heartbeat every 5s
  heartbeatTimer = setInterval(() => {
    if (isTracking && currentViewerCount > 0) {
      safeSendMessage({
        type: 'VIEWER_HEARTBEAT',
        platform,
        count: currentViewerCount,
        timestamp: Date.now()
      });
    }
  }, CONFIG.HEARTBEAT_INTERVAL_MS);
  
  // Try immediate detection
  const initialCount = detectViewerCount();
  if (initialCount > 0) {
    console.log(`[VIEWER:PAGE] value=${initialCount}`);
    currentViewerCount = initialCount;
    safeSendMessage({
      type: 'VIEWER_COUNT_UPDATE',
      platform,
      count: initialCount,
      delta: 0,
      timestamp: Date.now(),
      source: 'initial'
    });
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
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  
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
