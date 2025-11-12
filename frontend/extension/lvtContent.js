// ============================================================================
// LVT PATCH R15: Authoritative TikTok DOM LVT Content Script
// ============================================================================

(function() {
  'use strict';
  
  // LVT PATCH R15: Boot guard
  if (window.__spikelyLVT_R15) {
    return;
  }

  window.__spikelyLVT_R15 = true;
  console.log('[LVT:R15] booted');

  // State
  let viewerNode = null;
  let observer = null;
  let lastValue = 0;
  let retryCount = 0;

  // LVT PATCH R15: Parser with K/M suffix support
  function parseViewerCount(text) {
    if (!text) return null;
    
    const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
    if (!match) return null;
    
    let num = parseFloat(match[1]);
    const token = match[1].toLowerCase();
    
    if (token.includes('k')) num *= 1000;
    if (token.includes('m')) num *= 1000000;
    
    const result = Math.round(num);
    
    // LVT PATCH R15: Sanity bounds
    if (result <= 0 || result > 5000000) {
      console.log(`[LVT:R15] SANITY_BLOCKED candidate=${result}`);
      return null;
    }
    
    return result;
  }

  // LVT PATCH R15: Find authoritative viewer node
  function findViewerNode() {
    const allElements = Array.from(document.querySelectorAll('*'));
    
    for (const element of allElements) {
      const text = element.textContent?.trim();
      
      // LVT PATCH R15: Primary - header text matching "Viewers · {X}"
      if (text && /Viewers?\s*[·•]\s*\d+/i.test(text)) {
        const match = text.match(/Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
        if (match) {
          const expectedNumber = match[1];
          
          // Find the specific element containing this number
          const container = element.closest('div, section, header');
          if (container) {
            const numberElements = container.querySelectorAll('span, div, strong');
            for (const numEl of numberElements) {
              if (numEl.textContent?.trim() === expectedNumber && 
                  numEl.offsetParent !== null && 
                  numEl.isConnected) {
                return numEl;
              }
            }
          }
        }
      }
    }
    
    return null;
  }

  // LVT PATCH R15: Emit viewer count update
  function emitUpdate(value) {
    if (value === lastValue) return;
    
    lastValue = value;
    console.log(`[LVT:R15] emit value=${value}`);
    
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        value: value
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`[LVT:R15] send error: ${chrome.runtime.lastError.message}`);
        }
      });
    }
  }

  // LVT PATCH R15: Attach watcher
  function attachWatcher(node) {
    if (!node) return;
    
    viewerNode = node;
    console.log('[LVT:R15] viewer node detected');
    
    // Disconnect existing observer
    if (observer) {
      observer.disconnect();
    }
    
    // Emit initial value
    const initialText = node.textContent?.trim();
    if (initialText) {
      const initialValue = parseViewerCount(initialText);
      if (initialValue !== null) {
        emitUpdate(initialValue);
      }
    }
    
    // LVT PATCH R15: MutationObserver with debounce
    let debounceTimer = null;
    
    observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (viewerNode && viewerNode.isConnected) {
          const text = viewerNode.textContent?.trim();
          if (text) {
            const value = parseViewerCount(text);
            if (value !== null) {
              emitUpdate(value);
            }
          }
        } else {
          // Node disconnected, rebind
          console.log('[LVT:R15] rebinding...');
          viewerNode = null;
          startDetection();
        }
      }, 250);
    });
    
    observer.observe(node, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  // LVT PATCH R15: Detection with retry
  function startDetection() {
    const node = findViewerNode();
    
    if (node) {
      attachWatcher(node);
      retryCount = 0;
    } else {
      retryCount++;
      if (retryCount <= 15) {
        setTimeout(startDetection, 1000);
      }
    }
  }

  // LVT PATCH R15: SPA navigation handling
  function handleNavigation() {
    console.log('[LVT:R15] rebinding...');
    
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    viewerNode = null;
    retryCount = 0;
    
    setTimeout(startDetection, 1000);
  }

  // LVT PATCH R15: Hook SPA navigation
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
  
  window.addEventListener('popstate', handleNavigation);

  // LVT PATCH R15: Start detection
  if (document.readyState === 'complete') {
    setTimeout(startDetection, 100);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(startDetection, 100);
    });
  }

  // LVT PATCH R15: Cleanup
  window.addEventListener('beforeunload', () => {
    if (observer) observer.disconnect();
  });

})();