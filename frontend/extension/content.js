// ============================================================================
// LVT PATCH R11: Simplified DOM Live Viewer Tracking (production-ready)
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

// LVT PATCH R11: State variables for simplified tracking
let isTracking = false;
let currentViewerCount = 0;
let scanInterval = null;
let viewerObserver = null;
let viewerNode = null;
let lastCount = 0;
let lastEmitTime = 0;
let lastHealthCheck = 0;

// LVT PATCH R11: Refactored count parser with safe K/M scaling
const parseCount = (text) => {
  if (!text || typeof text !== 'string') return 0;
  
  const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/);
  if (!match) return 0;
  
  let num = parseFloat(match[1]);
  const input = match[1].toLowerCase();
  
  if (input.includes('k')) num *= 1000;
  if (input.includes('m')) num *= 1000000;
  
  const result = Math.round(num);
  return (result >= 0 && result <= 500000) ? result : 0;
};

// LVT PATCH R11: Find singular target viewer node via pattern recognition
function findViewerNode() {
  const allElements = Array.from(document.querySelectorAll('*'));
  
  for (const element of allElements) {
    const text = element.textContent?.trim() || '';
    
    // LVT PATCH R11: Look for "Viewers · X" or "Viewers X" pattern
    if (/viewers?[\s·•]\d+/i.test(text)) {
      // LVT PATCH R11: Extract just the number part
      const match = text.match(/viewers?[\s·•](\d+(?:\.\d+)?[KkMm]?)/i);
      if (match) {
        // LVT PATCH R11: Find the specific element containing just the number
        const container = element.closest('div, section, header');
        if (container) {
          const numberElements = container.querySelectorAll('span, div, strong');
          for (const numEl of numberElements) {
            const numText = numEl.textContent?.trim();
            // LVT PATCH R11: Match exact number from pattern
            if (numText === match[1] && numEl.offsetParent !== null && numEl.isConnected) {
              console.log(`[VIEWER:PAGE:FOUND] Target node: ${numEl.tagName} = "${numText}"`);
              return numEl;
            }
          }
        }
      }
    }
  }
  
  return null;
}

// LVT PATCH R11: Emit with validation and delta checking
function emitUpdate(newCount) {
  const now = Date.now();
  
  // LVT PATCH R11: Validate delta before emission
  if (lastCount > 0) {
    const delta = Math.abs(newCount - lastCount);
    const ratio = newCount / lastCount;
    
    // LVT PATCH R11: Block unrealistic spikes (sanity check)
    if (ratio > 5) {
      console.log(`[VIEWER:PAGE:SANITY_BLOCKED] Rejected ${newCount} (${ratio}x spike from ${lastCount})`);
      return;
    }
    
    // LVT PATCH R11: Skip if change too small or too recent
    if (delta < 1 || (now - lastEmitTime) < 250) {
      return;
    }
  }
  
  lastCount = newCount;
  lastEmitTime = now;
  currentViewerCount = newCount;
  
  console.log(`[VIEWER:PAGE] value=${newCount}`);
  
  if (lastCount !== newCount) {
    const delta = newCount - lastCount;
    console.log(`[VIEWER:PAGE:UPDATE] value=${newCount} delta=${delta}`);
  }
  
  // LVT PATCH R11: Send message with exact schema
  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({
      type: 'VIEWER_COUNT_UPDATE',
      platform: 'tiktok',
      count: newCount,
      delta: newCount - (lastCount || 0),
      timestamp: now
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('[VIEWER:PAGE] Message send failed:', chrome.runtime.lastError.message);
      }
    });
  }
}

// LVT PATCH R11: Attach observer with self-healing
function attachObserver(element) {
  if (viewerObserver) {
    try { viewerObserver.disconnect(); } catch (_) {}
  }
  
  if (!element || !element.isConnected) return;
  
  try {
    viewerNode = element;
    
    viewerObserver = new MutationObserver(() => {
      // LVT PATCH R11: Check if node still valid
      if (!viewerNode || !viewerNode.isConnected) {
        console.log('[VIEWER:PAGE:REATTACH] Node invalid, will rescan');
        viewerNode = null;
        return;
      }
      
      const text = viewerNode.textContent?.trim();
      if (text) {
        const count = parseCount(text);
        if (count > 0) {
          emitUpdate(count);
        }
      }
      
      lastHealthCheck = Date.now();
    });
    
    viewerObserver.observe(element, {
      childList: true,
      subtree: true, 
      characterData: true
    });
    
    console.log('[VIEWER:PAGE] Observer attached');
    
    // LVT PATCH R11: Emit initial value
    const initialCount = parseCount(element.textContent?.trim());
    if (initialCount > 0) {
      emitUpdate(initialCount);
    }
    
  } catch (error) {
    console.log('[VIEWER:PAGE] Observer failed:', error.message);
  }
}

// LVT PATCH R11: Continuous scanning with self-healing
function startContinuousScanning() {
  console.log('[VIEWER:PAGE] Starting continuous scanning...');
  
  // LVT PATCH R11: Wait for complete DOM readyState
  function waitForDOM() {
    if (document.readyState === 'complete') {
      beginScanning();
    } else {
      setTimeout(waitForDOM, 100);
    }
  }
  
  function beginScanning() {
    // Initial scan
    const node = findViewerNode();
    if (node) {
      attachObserver(node);
    }
    
    // LVT PATCH R11: Self-healing scanning loop
    scanInterval = setInterval(() => {
      const now = Date.now();
      
      // LVT PATCH R11: Re-scan if no node or no updates for 10s
      if (!viewerNode || !viewerNode.isConnected || (now - lastHealthCheck) > 10000) {
        console.log('[VIEWER:PAGE:RESCAN] Rescanning for viewer node...');
        const newNode = findViewerNode();
        if (newNode) {
          attachObserver(newNode);
        }
      }
    }, 500); // LVT PATCH R11: 500ms scan interval
  }
  
  waitForDOM();
}

// LVT PATCH R11: Simplified tracking
function startTracking() {
  if (isTracking) {
    console.log('[VIEWER:PAGE] already tracking');
    return;
  }
  
  isTracking = true;
  console.log('[VIEWER:PAGE] tracking started - R11 production');
  
  if (platform === 'tiktok') {
    startContinuousScanning();
  } else {
    // Non-TikTok: simple selector polling
    const selectors = {
      twitch: '[data-a-target="animated-channel-viewers-count"]',
      kick: '[class*="viewer-count"]', 
      youtube: 'span.ytp-live-badge + span'
    };
    
    const selector = selectors[platform];
    if (selector) {
      scanInterval = setInterval(() => {
        const element = document.querySelector(selector);
        if (element) {
          const count = parseCount(element.textContent?.trim());
          if (count > 0) {
            emitUpdate(count);
          }
        }
      }, 1000);
    }
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

// LVT PATCH R11: Message listeners
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TRACKING') {
    startTracking();
    sendResponse({ success: true, platform });
  } else if (message.type === 'STOP_TRACKING') {
    stopTracking();
    sendResponse({ success: true });
  } else if (message.type === 'PING') {
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
});

// LVT PATCH R11: Initialization
console.log(`[VIEWER:PAGE] loaded - R11 simplified (${platform})`);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  try { stopTracking(); } catch (_) {}
});

})();

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
