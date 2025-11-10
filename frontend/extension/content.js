// ============================================================================
// LVT PATCH R10: Simplified DOM Live Viewer Tracking (production-ready)
// ============================================================================

(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
  } catch (_) {}

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

// LVT PATCH R10: State variables for simplified tracking
let isTracking = false;
let currentViewerCount = 0;
let scanInterval = null;
let viewerObserver = null;
let viewerNode = null;
let lastEmittedCount = 0;
let lastEmitTime = 0;

// LVT PATCH R10: Parse viewer count with K/M scaling  
function parseCount(text) {
  if (!text) return 0;
  
  const cleaned = text.toLowerCase().replace(/[^\d.,km]/g, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!match) return 0;
  
  let num = parseFloat(match[1]);
  const suffix = match[2];
  
  if (suffix === 'k') num *= 1000;
  if (suffix === 'm') num *= 1000000;
  
  const result = Math.round(num);
  return (result >= 0 && result <= 500000) ? result : 0;
}

// LVT PATCH R10: Find TikTok viewer node via pattern recognition
function findTikTokViewerNode() {
  const allElements = Array.from(document.querySelectorAll('*'));
  
  for (const element of allElements) {
    const text = element.textContent?.trim() || '';
    
    // LVT PATCH R10: Look for "Viewers · X" pattern
    if (/viewers?\s*[·•]\s*\d+/i.test(text)) {
      const match = text.match(/viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
      if (match) {
        // LVT PATCH R10: Find the actual number element within this container
        const container = element.closest('div, section, header');
        if (container) {
          const numberElements = container.querySelectorAll('span, div, strong');
          for (const numEl of numberElements) {
            const numText = numEl.textContent?.trim();
            if (numText && /^\d+(?:\.\d+)?[KkMm]?$/.test(numText)) {
              if (numEl.offsetParent !== null && numEl.isConnected) {
                const count = parseCount(numText);
                if (count > 0) {
                  console.log(`[VIEWER:PAGE:FOUND] TikTok viewer node: ${element.tagName} → ${numEl.tagName} = "${numText}" (${count})`);
                  return numEl;
                }
              }
            }
          }
        }
      }
    }
  }
  
  return null;
}

// LVT PATCH R10: Emit viewer count with exact schema
function emitViewerCount(count) {
  const now = Date.now();
  const delta = lastEmittedCount > 0 ? count - lastEmittedCount : 0;
  
  // LVT PATCH R10: Debounce + jitter filter
  if (count === lastEmittedCount || (Math.abs(delta) < 1) || (now - lastEmitTime) < 250) {
    return; // Skip emission
  }
  
  lastEmittedCount = count;
  lastEmitTime = now;
  currentViewerCount = count;
  
  console.log(`[VIEWER:PAGE] value=${count}`);
  if (delta !== 0) {
    console.log(`[VIEWER:PAGE:UPDATE] value=${count} delta=${delta}`);
  }
  
  // LVT PATCH R10: Send message with exact schema
  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'VIEWER_COUNT_UPDATE',
      platform: 'tiktok',
      count: count,
      delta: delta,
      timestamp: now
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('[VIEWER:PAGE] Message failed:', chrome.runtime.lastError.message);
      }
    });
  }
}

// LVT PATCH R10: Attach observer to viewer node
function attachViewerObserver(element) {
  if (viewerObserver) {
    try { viewerObserver.disconnect(); } catch (_) {}
  }
  
  if (!element || !element.isConnected) return;
  
  try {
    viewerNode = element;
    
    viewerObserver = new MutationObserver(() => {
      if (!viewerNode || !viewerNode.isConnected) {
        console.log('[VIEWER:PAGE:REATTACH] Viewer node disconnected, rescanning...');
        viewerNode = null;
        return;
      }
      
      const text = viewerNode.textContent?.trim();
      if (text) {
        const count = parseCount(text);
        if (count > 0) {
          emitViewerCount(count);
        }
      }
    });
    
    // LVT PATCH R10: Observe node changes
    viewerObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    console.log('[VIEWER:PAGE] Observer attached to viewer node');
    
    // LVT PATCH R10: Emit initial value
    const initialCount = parseCount(element.textContent?.trim());
    if (initialCount > 0) {
      emitViewerCount(initialCount);
    }
    
  } catch (error) {
    console.log('[VIEWER:PAGE] Observer attachment failed:', error.message);
  }
}

// LVT PATCH R10: Continuous scanning with self-healing
function startViewerScanning() {
  console.log('[VIEWER:PAGE] Starting continuous viewer scanning...');
  
  // LVT PATCH R10: Wait for complete DOM, then start scanning
  function waitForCompleteDOM() {
    if (document.readyState === 'complete') {
      beginScanning();
    } else {
      setTimeout(waitForCompleteDOM, 100);
    }
  }
  
  function beginScanning() {
    // LVT PATCH R10: Initial detection attempt
    const node = findTikTokViewerNode();
    if (node) {
      attachViewerObserver(node);
    }
    
    // LVT PATCH R10: Continuous scanning loop for recovery
    scanInterval = setInterval(() => {
      if (!viewerNode || !viewerNode.isConnected) {
        console.log('[VIEWER:PAGE:RESCAN] Rescanning for viewer node...');
        const newNode = findTikTokViewerNode();
        if (newNode) {
          attachViewerObserver(newNode);
        }
      }
    }, 500); // LVT PATCH R10: 500ms scanning interval
  }
  
  waitForCompleteDOM();
}

// LVT PATCH R10: Simplified tracking system
function startTracking() {
  if (isTracking) {
    console.log('[VIEWER:PAGE] already tracking');
    return;
  }
  
  isTracking = true;
  console.log('[VIEWER:PAGE] tracking started - DOM LVT R10');
  
  if (platform === 'tiktok') {
    startViewerScanning();
  } else {
    // Non-TikTok platforms: simple polling
    const selectors = {
      twitch: ['[data-a-target="animated-channel-viewers-count"]'],
      kick: ['[class*="viewer-count"]'],
      youtube: ['span.ytp-live-badge + span']
    };
    
    const platformSelectors = selectors[platform] || [];
    scanInterval = setInterval(() => {
      for (const selector of platformSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          const count = parseCount(element.textContent.trim());
          if (count > 0) {
            emitViewerCount(count);
            break;
          }
        }
      }
    }, 1000);
  }
}

function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  
  console.log('[VIEWER:PAGE] tracking stopped');
  
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  
  if (viewerObserver) {
    try { viewerObserver.disconnect(); } catch (_) {}
    viewerObserver = null;
  }
  
  viewerNode = null;
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
console.log(`[VIEWER:PAGE] loaded on ${platform} - DOM LVT R10`);

// Cleanup on navigation
function cleanup() {
  stopTracking();
}

window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);

})();
