(function(){
  'use strict';
  
  // IMMEDIATE LOAD CHECK
  console.log('%c🚀🚀🚀 [SPIKELY] CONTENT SCRIPT v2.5.0 LOADING... 🚀🚀🚀', 'color: green; font-weight: bold; font-size: 16px');
  console.log('[SPIKELY] URL:', window.location.href);
  console.log('[SPIKELY] Timestamp:', new Date().toISOString());
  
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
      
      if (/viewers?\s*[•·:]\s*[\d,]+(\.\d+)?[kmb]?/i.test(text)) {
        const match = text.match(/viewers?\s*[•·:]\s*([\d,]+(?:\.\d+)?[kmb]?)/i);
        if (match) {
          const countText = match[1];
          const numericValue = parseViewerNumber(countText);
          if (numericValue > 0) {
            console.log('[SPIKELY] ✅ Found via "Viewers •":', countText, '→', numericValue);
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
    
    // Strategy 3: Context-based number search
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      
      if (/^[\d,]+(\.\d+)?[kmb]?$/i.test(text) && text.length <= 10) {
        const parentText = el.parentElement?.textContent?.toLowerCase() || '';
        
        if (parentText.includes('viewer') || parentText.includes('watching') || parentText.includes('live')) {
          const numericValue = parseViewerNumber(text);
          if (numericValue > 50) { // Filter out small numbers
            console.log('[SPIKELY] ✅ Found via context:', text, '→', numericValue);
            return { element: el, count: numericValue, text: text };
          }
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
    } else if (message.type === 'PING') {
      sendResponse({ type: 'PONG', platform: platform, isReady: true });
    }
  });
  
  console.log('[SPIKELY] 🎉 Content script initialization complete!');
  console.log('[SPIKELY] 🧪 Manual test: window.__SPIKELY_TEST__()');

})();