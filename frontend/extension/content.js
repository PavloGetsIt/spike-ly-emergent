// ============================================================================
// LVT PATCH R12: Production-Ready DOM LVT with guaranteed message emission
// ============================================================================

(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
    window.__spikelyLVT = { watcherId: null }; // LVT PATCH R12: Single watcher registry
  } catch (_) {}

const platform = (window.location.hostname.includes('tiktok.com')) ? 'tiktok' : 'unknown';

// LVT PATCH R12: State variables  
let isTracking = false;
let viewerNode = null;
let viewerObserver = null;
let lastCount = 0;
let lastEmitTime = 0;
let detectionRetryCount = 0;
let scanInterval = null;
let navCheckInterval = null;
let lastPathname = window.location.pathname;

// LVT PATCH R12: Strict numeric normalization with exact parsing
function parseViewerCount(text) {
  if (!text || typeof text !== 'string') return null;
  
  // LVT PATCH R12: Extract numeric token after separator
  const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
  if (!match) return null;
  
  let num = parseFloat(match[1]);
  const input = match[1].toLowerCase();
  
  // LVT PATCH R12: Support K/M suffixes
  if (input.includes('k')) num *= 1000;
  if (input.includes('m')) num *= 1000000;
  
  const result = Math.round(num);
  
  // LVT PATCH R12: Reject values outside reasonable range
  if (result < 0 || result > 200000) {
    console.log(`[VIEWER:PAGE] WARN: Rejected out-of-range value: ${result}`);
    return null;
  }
  
  return result;
}

// LVT PATCH R12: Deterministic locator for authoritative TikTok viewer node
function findAuthoritativeViewerNode() {
  const allElements = Array.from(document.querySelectorAll('*'));
  
  // LVT PATCH R12: Primary - exact "Viewers · X" pattern in header region
  for (const element of allElements) {
    const text = element.textContent?.trim() || '';
    
    if (/^Viewers?\s*[·•]\s*\d+/i.test(text)) {
      // LVT PATCH R12: Extract the number and find its specific element
      const match = text.match(/^Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
      if (match) {
        const expectedNumber = match[1];
        
        // LVT PATCH R12: Find element containing just this number
        const container = element.closest('div, section, header');
        if (container) {
          const numberElements = container.querySelectorAll('span, div, strong');
          for (const numEl of numberElements) {
            const numText = numEl.textContent?.trim();
            if (numText === expectedNumber && numEl.offsetParent !== null) {
              console.log(`[VIEWER:PAGE:FOUND] selector="${numEl.tagName}", text="${numText}", value=${parseViewerCount(numText)}`);
              return numEl;
            }
          }
        }
      }
    }
  }
  
  // LVT PATCH R12: Secondary - ARIA/role-based header region  
  const headerRegions = document.querySelectorAll('[role="region"], [role="heading"], header, h1, h2, h3');
  for (const region of headerRegions) {
    if (region.textContent?.toLowerCase().includes('viewer')) {
      const numbers = region.querySelectorAll('span, div');
      for (const numEl of numbers) {
        const text = numEl.textContent?.trim();
        if (text && /^\d+(?:\.\d+)?[KkMm]?$/.test(text)) {
          const count = parseViewerCount(text);
          if (count && count > 0 && numEl.offsetParent !== null) {
            console.log(`[VIEWER:PAGE:FOUND] selector="header>${numEl.tagName}", text="${text}", value=${count}`);
            return numEl;
          }
        }
      }
    }
  }
  
  console.log('[VIEWER:PAGE] No authoritative viewer node found');
  return null;
}

// LVT PATCH R12: Emit update with guaranteed delivery
function emitViewerUpdate(newCount) {
  if (!newCount || newCount === lastCount) return;
  
  const now = Date.now();
  const delta = lastCount > 0 ? newCount - lastCount : 0;
  
  // LVT PATCH R12: Sanity check - block >5x spikes
  if (lastCount > 0 && newCount > lastCount * 5) {
    console.log(`[VIEWER:PAGE:SANITY_BLOCKED] Rejected ${newCount} (${Math.round(newCount/lastCount)}x spike)`);
    return;
  }
  
  // LVT PATCH R12: Jitter filter - min 250ms between emissions
  if (now - lastEmitTime < 250) return;
  
  lastCount = newCount;
  lastEmitTime = now;
  
  console.log(`[VIEWER:PAGE] value=${newCount}`);
  if (delta !== 0) {
    console.log(`[VIEWER:PAGE:UPDATE] value=${newCount} delta=${delta}`);
  }
  
  // LVT PATCH R12: Reliable message emission without awaiting response
  if (chrome?.runtime?.sendMessage) {
    try {
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        platform: 'tiktok',
        count: newCount,
        delta: delta,
        ts: now
      });
    } catch (error) {
      console.log('[VIEWER:PAGE] Send error:', error.message);
    }
  }
}

// LVT PATCH R12: Single-source MutationObserver with debouncing
function attachSingleObserver(element) {
  if (!element) return;
  
  // LVT PATCH R12: Guard against duplicate observers
  if (window.__spikelyLVT.watcherId) {
    try { 
      if (viewerObserver) viewerObserver.disconnect();
    } catch (_) {}
  }
  
  try {
    viewerNode = element;
    window.__spikelyLVT.watcherId = Date.now();
    
    let debounceTimer = null;
    
    viewerObserver = new MutationObserver(() => {
      // LVT PATCH R12: Debounce mutations 150-250ms
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (viewerNode && viewerNode.isConnected) {
          const text = viewerNode.textContent?.trim();
          if (text) {
            const count = parseViewerCount(text);
            if (count) {
              emitViewerUpdate(count);
            }
          }
        } else {
          console.log('[VIEWER:PAGE:REATTACH] Node disconnected');
          viewerNode = null;
        }
      }, 200);
    });
    
    viewerObserver.observe(element, {
      childList: true,
      subtree: true,
      characterData: true
    });
    
    console.log('[VIEWER:PAGE] Single observer attached');
    
    // LVT PATCH R12: Emit initial value
    const initialText = element.textContent?.trim();
    if (initialText) {
      const initialCount = parseViewerCount(initialText);
      if (initialCount) {
        emitViewerUpdate(initialCount);
      }
    }
    
  } catch (error) {
    console.log('[VIEWER:PAGE] Observer error:', error.message);
  }
}

// LVT PATCH R12: SPA navigation detection
function setupSPADetection() {
  // LVT PATCH R12: History API listeners
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    handleNavigation();
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    handleNavigation();
  };
  
  // LVT PATCH R12: Periodic URL check for silent route changes
  navCheckInterval = setInterval(() => {
    if (window.location.pathname !== lastPathname) {
      handleNavigation();
    }
  }, 1000);
}

function handleNavigation() {
  const newPathname = window.location.pathname;
  if (newPathname !== lastPathname) {
    console.log(`[VIEWER:PAGE:NAV] from=${lastPathname} to=${newPathname}`);
    lastPathname = newPathname;
    
    // LVT PATCH R12: Tear down and restart
    if (viewerObserver) {
      try { viewerObserver.disconnect(); } catch (_) {}
    }
    viewerNode = null;
    window.__spikelyLVT.watcherId = null;
    
    // LVT PATCH R12: Restart detection after navigation
    setTimeout(() => {
      if (isTracking) {
        startDetectionLoop();
      }
    }, 500);
  }
}

// LVT PATCH R12: Detection loop with exponential backoff
function startDetectionLoop() {
  const node = findAuthoritativeViewerNode();
  if (node) {
    attachSingleObserver(node);
    detectionRetryCount = 0;
  } else {
    // LVT PATCH R12: Exponential backoff retry
    detectionRetryCount++;
    if (detectionRetryCount <= 10) {
      const delay = Math.min(1000 * Math.pow(1.5, detectionRetryCount), 10000);
      console.log(`[VIEWER:PAGE] Retry detection #${detectionRetryCount} in ${delay}ms`);
      setTimeout(startDetectionLoop, delay);
    }
  }
}

// LVT PATCH R12: Simplified tracking entry point
function startTracking() {
  if (isTracking) return;
  isTracking = true;
  
  console.log('[VIEWER:PAGE] tracking started - R12 production');
  
  if (platform === 'tiktok') {
    setupSPADetection();
    
    // LVT PATCH R12: Wait for DOM completion then start
    if (document.readyState === 'complete') {
      startDetectionLoop();
    } else {
      document.addEventListener('DOMContentLoaded', startDetectionLoop);
    }
    
    // LVT PATCH R12: Health check - restart if stale
    scanInterval = setInterval(() => {
      const now = Date.now();
      if (!viewerNode || (now - lastEmitTime > 10000)) {
        console.log('[VIEWER:PAGE:RESCAN] Health check - restarting detection');
        startDetectionLoop();
      }
    }, 5000);
  }
}

function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  
  console.log('[VIEWER:PAGE] tracking stopped');
  
  if (viewerObserver) {
    try { viewerObserver.disconnect(); } catch (_) {}
  }
  if (scanInterval) {
    clearInterval(scanInterval);
  }
  if (navCheckInterval) {
    clearInterval(navCheckInterval);
  }
  
  viewerNode = null;
  window.__spikelyLVT.watcherId = null;
}

// LVT PATCH R12: Message listeners
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

// LVT PATCH R12: Initialize
console.log(`[VIEWER:PAGE] R12 loaded (${platform})`);

window.addEventListener('beforeunload', stopTracking);

})();
