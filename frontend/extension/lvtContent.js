// ============================================================================
// LVT PATCH R15: Minimal TikTok DOM LVT Content Script 
// ============================================================================

(function() {
  'use strict';
  
  // LVT PATCH R15: Guard against double injection
  if (window.__spikelyLVT_R15) {
    return;
  }

  console.log('[LVT:R15] booted');

  // LVT PATCH R15: Permissive TikTok host check with DOM probe
  const isTikTok = window.location.hostname.includes('tiktok.com');
  if (!isTikTok) {
    return;
  }

  window.__spikelyLVT_R15 = {
    initialized: Date.now(),
    viewerNode: null,
    observer: null,
    lastValue: 0,
    retryCount: 0
  };

  // LVT PATCH R15: Parser with case-insensitive K/M support
  function parseViewerCount(text) {
    if (!text) return null;
    
    const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
    if (!match) return null;
    
    let num = parseFloat(match[1]);
    const token = match[1].toLowerCase();
    
    if (token.includes('k')) num *= 1000;
    if (token.includes('m')) num *= 1000000;
    
    const result = Math.round(num);
    
    // LVT PATCH R15: Sanity gate
    if (result <= 0 || result > 200000) return null;
    
    return result;
  }

  // LVT PATCH R15: Find viewer node with pattern detection
  function findViewerNode() {
    const allElements = Array.from(document.querySelectorAll('*'));
    
    for (const element of allElements) {
      const text = element.textContent?.trim();
      if (text && /Viewers?\s*[·•]\s*\d+/i.test(text)) {
        const match = text.match(/Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
        if (match) {
          const expectedNumber = match[1];
          
          // Find the specific number element  
          const container = element.closest('div, section, header');
          if (container) {
            const numberElements = container.querySelectorAll('span, div, strong');
            for (const numEl of numberElements) {
              if (numEl.textContent?.trim() === expectedNumber && 
                  numEl.offsetParent !== null && numEl.isConnected) {
                return numEl;
              }
            }
          }
        }
      }
    }
    
    return null;
  }

  // LVT PATCH R15: Emit with schema v1
  function emitUpdate(value) {
    if (value === window.__spikelyLVT_R15.lastValue) return;
    
    window.__spikelyLVT_R15.lastValue = value;
    
    console.log(`[LVT:R15] emit value=${value}`);
    
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        value: value,
        schema: 'v1'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`[LVT:R15] send failed: ${chrome.runtime.lastError.message}`);
        }
      });
    }
  }

  // LVT PATCH R15: Attach observer and emit initial
  function attachObserver(node) {
    if (!node) return;
    
    window.__spikelyLVT_R15.viewerNode = node;
    
    // Disconnect existing observer
    if (window.__spikelyLVT_R15.observer) {
      window.__spikelyLVT_R15.observer.disconnect();
    }
    
    // Emit initial value
    const initialText = node.textContent?.trim();
    if (initialText) {
      const initialValue = parseViewerCount(initialText);
      if (initialValue !== null) {
        emitUpdate(initialValue);
      }
    }
    
    // Set up new observer
    window.__spikelyLVT_R15.observer = new MutationObserver(() => {
      const text = node.textContent?.trim();
      if (text) {
        const value = parseViewerCount(text);
        if (value !== null && value !== window.__spikelyLVT_R15.lastValue) {
          emitUpdate(value);
        }
      }
    });
    
    window.__spikelyLVT_R15.observer.observe(node, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  // LVT PATCH R15: Detection loop with retry and SPA handling
  function startDetection() {
    const node = findViewerNode();
    
    if (node) {
      console.log(`[LVT:R15] viewer node detected`);
      attachObserver(node);
      window.__spikelyLVT_R15.retryCount = 0;
    } else {
      window.__spikelyLVT_R15.retryCount++;
      if (window.__spikelyLVT_R15.retryCount <= 15) {
        setTimeout(startDetection, 1000);
      }
    }
  }

  // LVT PATCH R15: SPA navigation handling
  function handleSPANavigation() {
    console.log(`[LVT:R15] rebinding...`);
    
    if (window.__spikelyLVT_R15.observer) {
      window.__spikelyLVT_R15.observer.disconnect();
    }
    
    window.__spikelyLVT_R15.viewerNode = null;
    window.__spikelyLVT_R15.retryCount = 0;
    
    setTimeout(startDetection, 500);
  }

  // LVT PATCH R15: Setup SPA listeners
  window.addEventListener('popstate', handleSPANavigation);
  
  // Lightweight header mutation observer for SPA detection
  const headerObserver = new MutationObserver(() => {
    if (!window.__spikelyLVT_R15.viewerNode || !window.__spikelyLVT_R15.viewerNode.isConnected) {
      handleSPANavigation();
    }
  });
  
  // Observe document for major changes
  if (document.body) {
    headerObserver.observe(document.body, { childList: true, subtree: false });
  }

  // LVT PATCH R15: Start detection after DOM ready
  if (document.readyState === 'complete') {
    setTimeout(startDetection, 100);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(startDetection, 100);
    });
  }

  // LVT PATCH R15: Cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (window.__spikelyLVT_R15?.observer) {
      window.__spikelyLVT_R15.observer.disconnect();
    }
    if (headerObserver) {
      headerObserver.disconnect();
    }
  });

})();