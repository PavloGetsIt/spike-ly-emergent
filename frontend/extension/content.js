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
  function detectPlatform() {
    const hostname = window.location.hostname || '';
    if (hostname.includes('tiktok.com')) return 'tiktok';
    if (hostname.includes('twitch.tv')) return 'twitch';
    if (hostname.includes('kick.com')) return 'kick';
    if (hostname.includes('youtube.com')) return 'youtube';
    return 'unknown';
  }

  const platform = detectPlatform();

  const PLATFORM_SELECTORS = {
    twitch: [
      '[data-a-target="animated-channel-viewers-count"]',
      '[data-test-selector="viewer-count"]',
      '.live-indicator-container span',
      '[data-a-target="stream-summary-stats"] span'
    ],
    kick: [
      '[class*="viewer-count"]',
      '[class*="ViewerCount"]',
      'div[class*="stats"] span',
      '[data-testid*="viewer-count"]'
    ],
    youtube: [
      '#info-strings yt-formatted-string',
      '.ytp-live-badge + span',
      'span.ytp-time-current',
      'yt-formatted-string[aria-label*="watching"]'
    ]
  };
  
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
    const normalized = text.replace(/,/g, '');
    const match = normalized.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
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
  function findViewerNode() {
    if (platform === 'tiktok') {
      const allElements = Array.from(document.querySelectorAll('*'));

      // LVT PATCH R13: Primary - exact "Viewers · X" pattern in header
      for (const element of allElements) {
        const text = element.textContent?.trim() || '';

        if (/^Viewers?\s*[·•]\s*\d+/i.test(text)) {
          const match = text.match(/^Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
          if (match) {
            const expectedNumber = match[1];

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

    const selectors = PLATFORM_SELECTORS[platform] || [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const rawText = element.textContent?.trim() || '';
        const count = parseViewerCount(rawText);
        if (count !== null && element.offsetParent !== null && element.isConnected) {
          console.log(`[VIEWER:PAGE:FOUND:${platform}] selector="${selector}", text="${rawText}", value=${count}`);
          return element;
        }
      }
    }

    if (platform === 'youtube') {
      const ariaCandidates = document.querySelectorAll('[aria-label]');
      for (const candidate of ariaCandidates) {
        const label = candidate.getAttribute('aria-label');
        if (label && /watching/i.test(label)) {
          const count = parseViewerCount(label);
          if (count !== null) {
            console.log(`[VIEWER:PAGE:FOUND:${platform}] aria-label value=${count}`);
            return candidate;
          }
        }
      }
    }

    if (platform === 'twitch' || platform === 'kick') {
      const fallbackNodes = document.querySelectorAll('span, div, p, strong');
      for (const node of fallbackNodes) {
        const text = node.textContent?.trim() || '';
        if (!text) continue;
        if (/viewers/i.test(text) || /watching/i.test(text)) {
          const count = parseViewerCount(text);
          if (count !== null && node.offsetParent !== null) {
            console.log(`[VIEWER:PAGE:FOUND:${platform}] fallback text value=${count}`);
            return node;
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
    
    console.log(`[VIEWER:PAGE] value=${newCount} platform=${platform}`);
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
          platform,
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
    const node = findViewerNode();
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

    if (platform === 'unknown') {
      console.log('[VIEWER:PAGE] Unsupported platform');
      return;
    }

    isTracking = true;
    console.log(`[VIEWER:PAGE] R13 tracking started (${platform})`);

    if (platform === 'tiktok') {
      setupSPADetection();
    }

    const beginDetection = () => {
      startDetectionLoop();

      if (scanInterval) clearInterval(scanInterval);
      // LVT PATCH R13: Health monitoring for all supported platforms
      scanInterval = setInterval(() => {
        const now = Date.now();
        if (!viewerNode || (now - lastEmitTime > 10000 && lastEmitTime > 0)) {
          console.log('[VIEWER:PAGE:RESCAN] Health check triggered');
          startDetectionLoop();
        }
      }, 5000);
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(beginDetection, 100);
    } else {
      const onReady = () => {
        document.removeEventListener('DOMContentLoaded', onReady);
        setTimeout(beginDetection, 100);
      };
      document.addEventListener('DOMContentLoaded', onReady);
    }
  }

  function stopTracking() {
    if (!isTracking) return;
    isTracking = false;
    
    console.log('[VIEWER:PAGE] Tracking stopped');
    
    try {
      if (viewerObserver) {
        viewerObserver.disconnect();
        viewerObserver = null;
      }
      if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
      }
      if (navCheckInterval) {
        clearInterval(navCheckInterval);
        navCheckInterval = null;
      }
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
