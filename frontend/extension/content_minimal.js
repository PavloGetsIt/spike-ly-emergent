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
    
    if (event.data.type === 'capture_click_acknowledged') {
      console.log('[SPIKELY] 🔴 Click acknowledgement received, forwarding to background...');
      
      chrome.runtime.sendMessage({
        type: 'CAPTURE_CLICK_ACKNOWLEDGED',
        timestamp: event.data.timestamp
      });
      
    } else if (event.data.type === 'BEGIN_CAPTURE') {
      console.log('[SPIKELY] 🔴 BEGIN_CAPTURE - Forwarding to background with gesture timing...');
      
      chrome.runtime.sendMessage({
        type: 'BEGIN_AUDIO_CAPTURE',
        gestureTimestamp: event.data.gestureTimestamp,
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
  
  // Enhanced viewer detection with TikTok selector cascade
  function findViewerCount() {
    if (platform !== 'tiktok') return null;
    
    console.log('[SPIKELY] 🔍 Enhanced viewer search with TikTok cascade...');
    
    // TikTok selector cascade  
    const tiktokSelectors = [
      '[data-e2e="live-viewer-count"]',
      '[class*="viewer"]',
      '[class*="Count"]',
      'div[class*="viewer"] span',
      'span[class*="count"]'
    ];
    
    // Strategy 1: Priority selectors
    for (const selector of tiktokSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent?.trim() || '';
          const parsed = parseViewerNumber(text);
          if (parsed > 0) {
            console.log('[SPIKELY] 👀 Viewer Count:', parsed, '(selector:', selector + ')');
            return { element: el, count: parsed, text: text };
          }
        }
      } catch (e) {
        // Skip invalid selectors
      }
    }
    
    const allElements = Array.from(document.querySelectorAll('*'));
    console.log('[SPIKELY] Scanning', allElements.length, 'elements for viewer patterns...');
    
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      
      // Strategy 2: Exact "Viewers • 127" TikTok 2025 format
      if (/viewers?\s*[•·:]\s*[\d,]+(\.\d+)?[kmb]?/i.test(text)) {
        const exactMatch = text.match(/viewers?\s*•\s*([\d,]+(?:\.\d+)?[kmb]?)/i);
        if (exactMatch) {
          const numericValue = parseViewerNumber(exactMatch[1]);
          if (numericValue > 0) {
            console.log('[SPIKELY] 👀 Viewer Count:', numericValue, '(exact pattern)');
            return { element: el, count: numericValue, text: exactMatch[1] };
          }
        }
        
        // Strategy 3: Flexible pattern matching
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
    
    // Strategy 4: Ancestor lineage scanning with regex fallback
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      
      // Regex fallback for standalone numbers
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
    
    console.log('[SPIKELY] ❌ No viewer count found after cascade search');
    return null;
  }
  
  // Parse viewer number with comma and K/M/B handling
  function parseViewerNumber(text) {
    if (!text) return 0;
    
    // Strip commas and whitespace
    const cleaned = text.toLowerCase().replace(/[,\s]/g, '');
    const match = cleaned.match(/^([\d.]+)([kmb])?$/);
    if (!match) return 0;
    
    let num = parseFloat(match[1]);
    const suffix = match[2];
    
    // Handle K/M/B formatting
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