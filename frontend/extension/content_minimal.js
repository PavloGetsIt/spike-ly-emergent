(function(){
  'use strict';
  
  // IMMEDIATE LOAD CHECK
  console.log('%c🚀🚀🚀 [SPIKELY] CONTENT SCRIPT v2.5.0 LOADING... 🚀🚀🚀', 'color: green; font-weight: bold; font-size: 16px');
  console.log('[SPIKELY] URL:', window.location.href);
  console.log('[SPIKELY] Timestamp:', new Date().toISOString());
  
  // ==================== POSTMESSAGE BRIDGE (BEFORE EARLY RETURN) ====================
  console.log('[SPIKELY] 🌉 Initializing postMessage bridge...');
  
  window.addEventListener('message', function(event) {
    if (event.source !== window || event.data?.source !== 'spikely-page-script') {
      return;
    }
    
    console.log('[SPIKELY] 📨 Bridge received postMessage:', event.data.type);
    
    if (event.data.type === 'SPIKELY_USER_CLICKED_RED_BUTTON') {
      console.log('[SPIKELY] 🔴 Forwarding user click to background...');
      
      chrome.runtime.sendMessage({
        type: 'BEGIN_AUDIO_CAPTURE',
        timestamp: event.data.timestamp,
        url: event.data.url
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[SPIKELY] ⚠️ Bridge forward failed:', chrome.runtime.lastError.message);
        } else {
          console.log('[SPIKELY] ✅ Audio request forwarded to background');
        }
      });
    }
  });
  
  console.log('[SPIKELY] ✅ postMessage bridge active');
  // ==========================================================================
  
  // Prevent double initialization
  if (window.__SPIKELY_CONTENT_ACTIVE__) {
    console.warn('[Spikely] ⚠️ Content script already active - skipping');
    return;
  }
  
  window.__SPIKELY_CONTENT_ACTIVE__ = true;
  
  // Platform detection
  const hostname = window.location.hostname;
  const platform = hostname.includes('tiktok.com') ? 'tiktok' 
                 : hostname.includes('twitch.tv') ? 'twitch'
                 : hostname.includes('kick.com') ? 'kick'
                 : hostname.includes('youtube.com') ? 'youtube'
                 : 'unknown';
  
  console.log('[SPIKELY] Platform detected:', platform);
  
  // Variables
  let isTracking = false;
  let trackingInterval = null;
  let lastViewerCount = 0;
  
  // ==================== WINDOW.POSTMESSAGE BRIDGE ====================
  // Bridge page_script.js → content_minimal.js → background.js
  
  console.log('[SPIKELY] 🌉 Setting up postMessage bridge...');
  
  // Listen for postMessage from page_script.js
  window.addEventListener('message', function(event) {
    // Validate source and message type
    if (event.source !== window || !event.data?.source === 'spikely-page-script') {
      return;
    }
    
    console.log('[SPIKELY] 📨 Received postMessage:', event.data.type);
    
    if (event.data.type === 'SPIKELY_USER_CLICKED_RED_BUTTON') {
      console.log('[SPIKELY] 🔴 Bridging user click to background script...');
      
      // Forward to background via chrome.runtime.sendMessage
      chrome.runtime.sendMessage({
        type: 'BEGIN_AUDIO_CAPTURE',
        timestamp: event.data.timestamp,
        url: event.data.url
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[SPIKELY] ⚠️ Background message failed:', chrome.runtime.lastError.message);
          
          // Send error back to page
          window.postMessage({
            type: 'SPIKELY_BRIDGE_ERROR',
            error: chrome.runtime.lastError.message,
            source: 'spikely-content-script'
          }, '*');
        } else {
          console.log('[SPIKELY] ✅ Audio capture request bridged to background');
          
          // Send acknowledgment back to page
          window.postMessage({
            type: 'SPIKELY_BRIDGE_SUCCESS',
            response: response,
            source: 'spikely-content-script'
          }, '*');
        }
      });
    }
  });
  
  console.log('[SPIKELY] ✅ postMessage bridge active');
  
  // Send handshake immediately
  try {
    console.log('[SPIKELY] 📡 Sending handshake...');
    chrome.runtime.sendMessage({
      type: 'CONTENT_SCRIPT_READY',
      platform: platform,
      url: window.location.href,
      timestamp: Date.now()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[SPIKELY] ⚠️ Handshake failed:', chrome.runtime.lastError.message);
      } else {
        console.log('[SPIKELY] ✅ Handshake confirmed');
      }
    });
  } catch (e) {
    console.error('[SPIKELY] ❌ Handshake error:', e);
  }
  
  // Enhanced viewer detection with shadow DOM support
  function findViewerCount() {
    if (platform !== 'tiktok') return null;
    
    console.log('[SPIKELY] 🔍 Enhanced viewer search (including shadow DOM)...');
    
    // Get ALL elements including shadow DOM
    function getAllElementsWithShadow(root = document) {
      const elements = Array.from(root.querySelectorAll('*'));
      const allElements = [...elements];
      
      // Check for shadow roots
      for (const el of elements) {
        if (el.shadowRoot) {
          allElements.push(...getAllElementsWithShadow(el.shadowRoot));
        }
      }
      return allElements;
    }
    
    const allElements = getAllElementsWithShadow();
    console.log('[SPIKELY] Scanning', allElements.length, 'elements (including shadow DOM)');
    
    // Strategy 1: "Viewers • X" pattern
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      
      // Match "Viewers • X" or similar 
      if (/viewers?\s*[•·:]\s*[\d,]+(\.\d+)?[kmb]?/i.test(text)) {
        // Strategy 1: Exact "Viewers • 127" TikTok 2025 format
        const exactMatch = text.match(/viewers?\s*•\s*([\d,]+(?:\.\d+)?[kmb]?)/i);
        if (exactMatch) {
          const numericValue = parseViewerNumber(exactMatch[1]);
          if (numericValue > 0) {
            console.log('[SPIKELY] 👀 Viewer Count:', numericValue, '(exact pattern)');
            return { element: el, count: numericValue, text: exactMatch[1] };
          }
        }
        
        // Strategy 2: Flexible pattern matching
        const match = text.match(/viewers?\s*[•·:]\s*([\d,]+(?:\.\d+)?[kmb]?)/i);
        if (match) {
          const countText = match[1];
          const numericValue = parseViewerNumber(countText);
          if (numericValue > 0) {
            console.log('[SPIKELY] 👀 Viewer Count:', numericValue, '(flexible pattern)');
            return { element: el, count: numericValue, text: countText };
          }
        }
      }
    }
    
    // Strategy 2: TikTok 2025 specific selectors
    const tiktokSelectors = [
      '[data-e2e="live-viewer-count"]',
      '[data-e2e*="viewer"]',
      '[data-testid*="viewer"]',
      'div[class*="viewer"] span',
      'div[class*="live"] span[class*="count"]',
      'span[class*="viewer-count"]',
      'div:has(> span:contains("Viewers"))'
    ];
    
    for (const selector of tiktokSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent?.trim() || '';
          const numericValue = parseViewerNumber(text);
          if (numericValue > 0) {
            console.log('[SPIKELY] ✅ Found via selector:', selector, '→', numericValue);
            return { element: el, count: numericValue, text: text };
          }
        }
      } catch (e) {
        // Skip invalid selectors
      }
    }
    
    // Strategy 3: Ancestor lineage scanning for live viewer context
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      
      if (/^[\d,]+(\.\d+)?[kmb]?$/i.test(text) && text.length <= 10) {
        let ancestor = el.parentElement;
        let depth = 0;
        
        while (ancestor && depth < 3) {
          const ancestorText = ancestor.textContent?.toLowerCase() || '';
          if (/viewer|watching|live.*count/i.test(ancestorText)) {
            const parsed = parseViewerNumber(text);
            if (parsed > 50) {
              console.log('[SPIKELY] 👀 Viewer Count:', parsed, '(ancestor scan)');
              return { element: el, count: parsed, text: text };
            }
          }
          ancestor = ancestor.parentElement;
          depth++;
        }
      }
    }
    
    console.log('[SPIKELY] ❌ No viewer count found after enhanced search');
    return null;
  }
  
  // Parse viewer number (handles K, M, B suffixes)
  function parseViewerNumber(text) {
    const cleaned = text.toLowerCase().replace(/[,\s]/g, '');
    const match = cleaned.match(/^([\d.]+)([kmb])?$/);
    if (!match) return 0;
    
    let num = parseFloat(match[1]);
    const suffix = match[2];
    
    if (suffix === 'k') num *= 1000;
    else if (suffix === 'm') num *= 1000000;
    else if (suffix === 'b') num *= 1000000000;
    
    return Math.round(num);
  }
  
  // Start tracking function
  function startTracking() {
    if (isTracking) {
      console.log('[SPIKELY] Already tracking, ignoring duplicate start');
      return;
    }
    
    console.log('[SPIKELY] 🎯 Starting viewer tracking...');
    isTracking = true;
    
    // Find initial count
    const initial = findViewerCount();
    if (initial) {
      console.log('[SPIKELY] 📊 Initial viewer count:', initial.count);
      sendViewerUpdate(initial.count, 0);
      lastViewerCount = initial.count;
    }
    
    // Start continuous monitoring
    trackingInterval = setInterval(() => {
      const result = findViewerCount();
      if (result) {
        const delta = result.count - lastViewerCount;
        
        if (result.count !== lastViewerCount || Date.now() % 10000 < 2000) {
          console.log('[SPIKELY] 📊 Viewer update:', result.count, 'Δ:', delta);
          sendViewerUpdate(result.count, delta);
          lastViewerCount = result.count;
        }
      }
    }, 2000); // Every 2 seconds
    
    console.log('[SPIKELY] ✅ Tracking started');
  }
  
  // Send viewer update to background
  function sendViewerUpdate(count, delta) {
    try {
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        platform: platform,
        count: count,
        delta: delta,
        timestamp: Date.now()
      });
    } catch (e) {
      console.warn('[SPIKELY] ⚠️ Failed to send viewer update:', e);
    }
  }
  
  // Stop tracking
  function stopTracking() {
    console.log('[SPIKELY] ⏹️ Stopping tracking');
    isTracking = false;
    if (trackingInterval) {
      clearInterval(trackingInterval);
      trackingInterval = null;
    }
  }
  
  // Manual test function
  window.__SPIKELY_TEST__ = function() {
    console.log('🧪 MANUAL TEST STARTING...');
    const result = findViewerCount();
    if (result) {
      console.log('✅ SUCCESS - Found:', result.count, 'viewers');
      sendViewerUpdate(result.count, 0);
      return result;
    } else {
      console.log('❌ FAILED - No viewer count found');
      console.log('💡 Make sure you\'re on a TikTok Live page');
      return null;
    }
  };
  
  // Message listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[SPIKELY] 📨 Received:', message.type);
    
    if (message.type === 'START_TRACKING') {
      startTracking();
      sendResponse({ success: true, platform: platform });
    } else if (message.type === 'STOP_TRACKING') {
      stopTracking();
      sendResponse({ success: true });
    } else if (message.type === 'UPDATE_BUTTON_STATE') {
      console.log('[SPIKELY] 🔘 Updating button state via postMessage:', message.state);
      
      // Forward button update to page script via postMessage
      window.postMessage({
        type: 'SPIKELY_UPDATE_BUTTON',
        state: message.state,
        message: message.message,
        source: 'spikely-content-script'
      }, '*');
      
      sendResponse({ success: true });
      
    } else if (message.type === 'PING') {
      sendResponse({ type: 'PONG', platform: platform, isReady: true });
    }
  });
  
  console.log('[SPIKELY] 🎉 Content script initialization complete!');
  console.log('[SPIKELY] 🧪 Manual test: window.__SPIKELY_TEST__()');

})();