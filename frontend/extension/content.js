// ============================================================================
// LVT PATCH R13: Production-Safe DOM LVT with Complete Message Chain
// ============================================================================

(function(){
  'use strict';
  
  // LVT PATCH R13: Guard against double injection
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      console.log('[VIEWER:PAGE] Already active, skipping re-injection');
      return;
    }
  } catch (initError) {
    console.log('[VIEWER:PAGE:ERROR] Init guard failed:', initError.message);
    return;
  }

  // LVT PATCH R13: Platform detection
  const platform = window.location.hostname.includes('tiktok.com') ? 'tiktok' : 'unknown';
  
  // LVT PATCH R13: State variables
  let isTracking = false;
  let viewerNode = null;
  let viewerObserver = null;
  let lastCount = 0;
  let lastEmittedCount = 0;
  let lastEmitTime = 0;
  let scanInterval = null;
  let navCheckInterval = null;
  let lastPathname = window.location.pathname;
  let detectionAttempts = 0;
  const MAX_DETECTION_ATTEMPTS = 10;
  
  // LVT PATCH R13: Mark as active after successful init
  window.__SPIKELY_CONTENT_ACTIVE__ = true;
  window.__spikelyLVT = { watcherId: null, initialized: Date.now() };

  // LVT PATCH R13: Robust viewer count parser with K/M scaling
  function parseViewerCount(text) {
    if (!text || typeof text !== 'string') return null;
    
    // LVT PATCH R13: Extract numeric token  
    const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
    if (!match) return null;
    
    let num = parseFloat(match[1]);
    const token = match[1].toLowerCase();
    
    // LVT PATCH R13: Apply K/M scaling
    if (token.includes('k')) num *= 1000;
    if (token.includes('m')) num *= 1000000;
    
    const result = Math.round(num);
    
    // LVT PATCH R13: Sanity constraints
    if (result < 0 || result > 200000) {
      console.log(`[VIEWER:PAGE:SANITY_BLOCKED] previous=${lastCount} candidate=${result}`);
      return null;
    }
    
    return result;
  }

  // LVT PATCH R13: Find TikTok authoritative viewer node 
  function findAuthoritativeViewerNode() {
    const allElements = Array.from(document.querySelectorAll('*'));
    
    // LVT PATCH R13: Primary - exact "Viewers · X" pattern in header
    for (const element of allElements) {
      const text = element.textContent?.trim() || '';
      
      // LVT PATCH R13: Look for TikTok viewer header pattern
      if (/^Viewers?\s*[·•]\s*\d+/i.test(text)) {
        const match = text.match(/^Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
        if (match) {
          const expectedNumber = match[1];
          
          // LVT PATCH R13: Find element containing just this number
          const container = element.closest('div, section, header');
          if (container) {
            const numberElements = container.querySelectorAll('span, div, strong');
            for (const numEl of numberElements) {
              const numText = numEl.textContent?.trim();
              if (numText === expectedNumber && numEl.offsetParent !== null && numEl.isConnected) {
                const count = parseViewerCount(numText);
                if (count !== null) {
                  console.log(`[VIEWER:PAGE:FOUND] selector="${numEl.tagName}", text="${numText}", value=${count}`);
                  return numEl;
                }
              }
            }
          }
        }
      }
    }
    
    // LVT PATCH R13: Secondary - ARIA/role header search
    const headerRegions = document.querySelectorAll('[role="region"], [role="heading"], header');
    for (const region of headerRegions) {
      const regionText = region.textContent?.toLowerCase();
      if (regionText && regionText.includes('viewer')) {
        const numbers = region.querySelectorAll('span, div');
        for (const numEl of numbers) {
          const numText = numEl.textContent?.trim();
          if (numText && /^\d+(?:\.\d+)?[KkMm]?$/.test(numText)) {
            const count = parseViewerCount(numText);
            if (count !== null && numEl.offsetParent !== null) {
              console.log(`[VIEWER:PAGE:FOUND] selector="header>${numEl.tagName}", text="${numText}", value=${count}`);
              return numEl;
            }
          }
        }
      }
    }
    
    return null;
  }

  // LVT PATCH R13: Emit update with schema v2
  function emitViewerUpdate(newCount) {
    const now = Date.now();
    const delta = lastEmittedCount > 0 ? newCount - lastEmittedCount : 0;
    
    // LVT PATCH R13: Skip if no change or too recent
    if (newCount === lastEmittedCount || (now - lastEmitTime < 250)) {
      return;
    }
    
    lastEmittedCount = newCount;
    lastEmitTime = now;
    
    console.log(`[VIEWER:PAGE] value=${newCount}`);
    if (delta !== 0) {
      console.log(`[VIEWER:PAGE:UPDATE] value=${newCount} delta=${delta}`);
    }
    
    // LVT PATCH R13: Content → Background messaging with schema v2
    if (chrome?.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'VIEWER_COUNT_UPDATE',
          schemaVersion: 2,
          source: 'dom',
          platform: 'tiktok',
          value: newCount,
          ts: now,
          tabIdHint: null
        });
      } catch (error) {
        console.log('[VIEWER:PAGE] Send error:', error.message);
      }
    }
  }

  // LVT PATCH R13: Attach single MutationObserver with debouncing
  function attachSingleObserver(element) {
    if (!element || !element.isConnected) return;
    
    // LVT PATCH R13: Prevent duplicate observers
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
        // LVT PATCH R13: Debounce 150-250ms  
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (viewerNode && viewerNode.isConnected) {
            const text = viewerNode.textContent?.trim();
            if (text) {
              const count = parseViewerCount(text);
              if (count !== null) {
                emitViewerUpdate(count);
              }
            }
          } else {
            console.log('[VIEWER:PAGE:REATTACH] Node disconnected');
            viewerNode = null;
            window.__spikelyLVT.watcherId = null;
          }
        }, 200);
      });
      
      viewerObserver.observe(element, {
        childList: true,
        subtree: true,
        characterData: true
      });
      
      console.log('[VIEWER:PAGE] Observer attached');
      
      // LVT PATCH R13: Emit initial value
      const initialText = element.textContent?.trim();
      if (initialText) {
        const initialCount = parseViewerCount(initialText);
        if (initialCount !== null) {
          emitViewerUpdate(initialCount);
        }
      }
      
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] Observer failed:', error.message);
    }
  }

  // LVT PATCH R13: SPA navigation detection with history API hooks
  function setupSPADetection() {
    try {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      function handleNavigation() {
        const newPathname = window.location.pathname;
        if (newPathname !== lastPathname) {
          console.log(`[VIEWER:PAGE:NAV] from=${lastPathname} to=${newPathname}`);
          lastPathname = newPathname;
          
          // LVT PATCH R13: Clean teardown and restart
          if (viewerObserver) {
            try { viewerObserver.disconnect(); } catch (_) {}
          }
          viewerNode = null;
          window.__spikelyLVT.watcherId = null;
          
          // LVT PATCH R13: Restart after SPA settle
          setTimeout(() => {
            if (isTracking && newPathname.includes('live')) {
              startDetectionLoop();
            }
          }, 500);
        }
      }
      
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        handleNavigation();
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        handleNavigation();
      };
      
      window.addEventListener('popstate', handleNavigation);
      
      // LVT PATCH R13: Periodic URL check for silent changes
      navCheckInterval = setInterval(() => {
        if (window.location.pathname !== lastPathname) {
          handleNavigation();
        }
      }, 1000);
      
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] SPA setup failed:', error.message);
    }
  }

  // LVT PATCH R13: Detection loop with exponential backoff
  function startDetectionLoop() {
    const node = findAuthoritativeViewerNode();
    if (node) {
      attachSingleObserver(node);
      detectionAttempts = 0;
    } else {
      detectionAttempts++;
      if (detectionAttempts <= MAX_DETECTION_ATTEMPTS) {
        const delay = Math.min(500 * Math.pow(1.5, detectionAttempts), 5000);
        console.log(`[VIEWER:PAGE] Detection attempt #${detectionAttempts}/${MAX_DETECTION_ATTEMPTS}, retry in ${delay}ms`);
        setTimeout(startDetectionLoop, delay);
      } else {
        console.log('[VIEWER:PAGE:WARN] Max detection attempts reached');
      }
    }
  }

  // LVT PATCH R13: Main tracking function
  function startTracking() {
    if (isTracking) {
      console.log('[VIEWER:PAGE] Already tracking');
      return;
    }
    
    isTracking = true;
    console.log('[VIEWER:PAGE] R13 tracking started');
    
    if (platform === 'tiktok') {
      setupSPADetection();
      
      // LVT PATCH R13: Wait for DOM completion then start detection
      if (document.readyState === 'complete') {
        setTimeout(startDetectionLoop, 100);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(startDetectionLoop, 100);
        });
      }
      
      // LVT PATCH R13: Health monitoring
      scanInterval = setInterval(() => {
        const now = Date.now();
        if (!viewerNode || (now - lastEmitTime > 10000 && lastEmitTime > 0)) {
          console.log('[VIEWER:PAGE:RESCAN] Health check triggered');
          startDetectionLoop();
        }
      }, 5000);
    }
  }

  function stopTracking() {
    if (!isTracking) return;
    isTracking = false;
    
    console.log('[VIEWER:PAGE] Tracking stopped');
    
    try {
      if (viewerObserver) viewerObserver.disconnect();
      if (scanInterval) clearInterval(scanInterval);
      if (navCheckInterval) clearInterval(navCheckInterval);
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] Stop cleanup failed:', error.message);
    }
    
    viewerNode = null;
    if (window.__spikelyLVT) window.__spikelyLVT.watcherId = null;
  }

  // LVT PATCH R13: Message listeners
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.type === 'START_TRACKING') {
        startTracking();
        sendResponse({ success: true, platform });
      } else if (message.type === 'STOP_TRACKING') {
        stopTracking();
        sendResponse({ success: true });
      } else if (message.type === 'PING') {
        sendResponse({ type: 'PONG', platform, isReady: true });
      }
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] Message handler failed:', error.message);
      sendResponse({ success: false, error: error.message });
    }
  });

  // LVT PATCH R13: Initialize with error handling
  try {
    console.log(`[VIEWER:PAGE] R13 loaded (${platform})`);
    
    // LVT PATCH R13: Cleanup on page unload
    window.addEventListener('beforeunload', stopTracking);
    window.addEventListener('pagehide', stopTracking);
    
  } catch (error) {
    console.log('[VIEWER:PAGE:ERROR] R13 initialization failed:', error.message);
  }

})();
