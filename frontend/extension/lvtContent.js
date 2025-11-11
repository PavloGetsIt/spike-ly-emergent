// ============================================================================
// LVT PATCH R14: Dedicated DOM LVT Content Script for TikTok Live
// ============================================================================

(function() {
  'use strict';
  
  // LVT PATCH R14: Guard against double injection
  if (window.__spikelyLVT) {
    console.log('[LVT:R14] Already initialized');
    return;
  }

  // LVT PATCH R14: Initialize only on TikTok Live pages
  const isTikTokLive = window.location.hostname.includes('tiktok.com') && 
                      (window.location.pathname.includes('live') || 
                       document.querySelector('[data-e2e*="live"]'));
  
  if (!isTikTokLive) {
    return; // Not a TikTok Live page
  }

  // LVT PATCH R14: Set global marker
  window.__spikelyLVT = {
    initialized: Date.now(),
    viewerNode: null,
    observer: null,
    lastCount: 0
  };

  console.log('[LVT:R14] content script loaded on TikTok LIVE');

  // LVT PATCH R14: Robust viewer count parser
  function parseViewerCount(text) {
    if (!text) return null;
    
    const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
    if (!match) return null;
    
    let num = parseFloat(match[1]);
    const token = match[1].toLowerCase();
    
    if (token.includes('k')) num *= 1000;
    if (token.includes('m')) num *= 1000000;
    
    const result = Math.round(num);
    return (result >= 0 && result <= 500000) ? result : null;
  }

  // LVT PATCH R14: Find TikTok viewer node using working validation logic
  function findViewerNode() {
    const allElements = Array.from(document.querySelectorAll('*'));
    
    for (const element of allElements) {
      const text = element.textContent?.trim();
      
      // LVT PATCH R14: Look for exact "Viewers · X" pattern
      if (text && /^Viewers?\s*[·•]\s*\d+/i.test(text)) {
        const match = text.match(/^Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
        if (match) {
          const expectedNumber = match[1];
          
          // Find the specific number element
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

  // LVT PATCH R14: Emit viewer count update
  function emitViewerUpdate(count) {
    if (count === window.__spikelyLVT.lastCount) return;
    
    window.__spikelyLVT.lastCount = count;
    
    console.log(`[LVT:R14] VIEWER_COUNT_UPDATE value=${count}`);
    
    // LVT PATCH R14: Send message with schema v2
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        value: count,
        schemaVersion: 2,
        source: 'dom-lvt',
        platform: 'tiktok',
        ts: Date.now()
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[LVT:R14] Send failed:', chrome.runtime.lastError.message);
        }
      });
    }
  }

  // LVT PATCH R14: Start DOM detection and observation
  function startLVTDetection() {
    const viewerNode = findViewerNode();
    
    if (viewerNode) {
      console.log('[LVT:R14] Viewer node found:', viewerNode.textContent?.trim());
      window.__spikelyLVT.viewerNode = viewerNode;
      
      // LVT PATCH R14: Emit initial value
      const initialCount = parseViewerCount(viewerNode.textContent?.trim());
      if (initialCount !== null) {
        emitViewerUpdate(initialCount);
      }
      
      // LVT PATCH R14: Attach MutationObserver
      if (window.__spikelyLVT.observer) {
        window.__spikelyLVT.observer.disconnect();
      }
      
      window.__spikelyLVT.observer = new MutationObserver(() => {
        const text = viewerNode.textContent?.trim();
        if (text) {
          const count = parseViewerCount(text);
          if (count !== null && count !== window.__spikelyLVT.lastCount) {
            // LVT PATCH R14: Sanity check
            if (window.__spikelyLVT.lastCount > 0 && count > window.__spikelyLVT.lastCount * 10) {
              console.log(`[LVT:R14] sanity rejected value=${count}`);
              return;
            }
            emitViewerUpdate(count);
          }
        }
      });
      
      window.__spikelyLVT.observer.observe(viewerNode, {
        childList: true,
        characterData: true,
        subtree: true
      });
      
    } else {
      console.log('[LVT:R14] No viewer node found, retrying...');
      // LVT PATCH R14: Retry detection
      setTimeout(startLVTDetection, 1000);
    }
  }

  // LVT PATCH R14: Wait for DOM ready then start
  if (document.readyState === 'complete') {
    setTimeout(startLVTDetection, 100);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(startLVTDetection, 100);
    });
  }

  // LVT PATCH R14: Message listener for START_TRACKING
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_TRACKING') {
      console.log('[LVT:R14] START_TRACKING received');
      startLVTDetection();
      sendResponse({ success: true, platform: 'tiktok' });
    } else if (message.type === 'PING') {
      sendResponse({ type: 'PONG', platform: 'tiktok' });
    }
  });

  // LVT PATCH R14: Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (window.__spikelyLVT?.observer) {
      window.__spikelyLVT.observer.disconnect();
    }
  });

})();