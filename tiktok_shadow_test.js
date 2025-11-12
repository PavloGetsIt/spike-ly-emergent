// SHADOW DOM VIEWER DETECTION TEST
// Run this in TikTok Live console to test the new detection logic

(function() {
  console.log('🔍 SHADOW DOM VIEWER DETECTION TEST');
  console.log('====================================');
  
  // Test 1: Recursive shadow DOM traversal
  function deepQuerySelector(selectors, root = document) {
    console.log(`Testing ${selectors.length} selectors on:`, root.constructor.name);
    
    // Direct query first
    for (const selector of selectors) {
      try {
        const element = root.querySelector(selector);
        if (element) {
          console.log(`✅ Direct hit: ${selector}`, element.textContent?.trim());
          return element;
        }
      } catch (e) {
        console.log(`❌ Selector failed: ${selector}`, e.message);
      }
    }
    
    // Shadow DOM traversal
    const allElements = root.querySelectorAll('*');
    console.log(`Scanning ${allElements.length} elements for shadow roots...`);
    
    let shadowRootsFound = 0;
    for (const element of allElements) {
      if (element.shadowRoot) {
        shadowRootsFound++;
        const shadowResult = deepQuerySelector(selectors, element.shadowRoot);
        if (shadowResult) {
          console.log(`✅ Shadow DOM hit in root #${shadowRootsFound}`);
          return shadowResult;
        }
      }
    }
    
    console.log(`Found ${shadowRootsFound} shadow roots total`);
    return null;
  }
  
  // Test selectors
  const tiktokSelectors = [
    '.viewer-count',
    'span[data-e2e="live-viewer-count"]',
    '[data-e2e="live-room-viewers"]',
    '[data-testid="live-room-viewers"]',
    '[data-e2e*="viewer"]',
    '[class*="ViewerCount"]',
    '[class*="LiveAudience"]'
  ];
  
  console.log('\n🎯 Testing TikTok selectors...');
  const foundElement = deepQuerySelector(tiktokSelectors);
  
  if (foundElement) {
    console.log('✅ FOUND VIEWER ELEMENT:', foundElement);
    console.log('   Text content:', foundElement.textContent?.trim());
    console.log('   Parent context:', foundElement.parentElement?.textContent?.substring(0, 100));
  } else {
    console.log('❌ No viewer element found with selectors');
  }
  
  // Test 2: Search near LIVE badge
  console.log('\n🔴 Testing LIVE badge proximity...');
  const liveElements = Array.from(document.querySelectorAll('*')).filter(el => {
    const text = el.textContent?.trim();
    return text && (text.includes('LIVE') || text.includes('Live'));
  });
  
  console.log(`Found ${liveElements.length} LIVE elements`);
  
  liveElements.forEach((liveEl, i) => {
    const parent = liveEl.closest('div, section, span');
    if (parent) {
      const numbers = parent.querySelectorAll('span, div');
      numbers.forEach(numEl => {
        const text = numEl.textContent?.trim();
        if (text && /^\d+(\.\d+)?[KkMm]?$/.test(text)) {
          console.log(`📊 Live element #${i+1} nearby number: "${text}"`);
        }
      });
    }
  });
  
  // Test 3: Brute force number search
  console.log('\n🔢 Testing brute force number search...');
  const allNumbers = [];
  
  document.querySelectorAll('span, div, strong').forEach(el => {
    const text = el.textContent?.trim();
    if (text && /^\d+(\.\d+)?[KkMm]?$/.test(text) && text.length <= 8) {
      const num = parseFloat(text.replace(/[KkMm]/i, ''));
      const multiplier = /[Kk]/.test(text) ? 1000 : (/[Mm]/.test(text) ? 1000000 : 1);
      const parsed = num * multiplier;
      
      if (parsed > 1) {
        allNumbers.push({ text, parsed, element: el });
      }
    }
  });
  
  // Sort by value
  allNumbers.sort((a, b) => b.parsed - a.parsed);
  
  console.log(`Found ${allNumbers.length} numeric elements:`);
  allNumbers.slice(0, 10).forEach((item, i) => {
    console.log(`   ${i+1}. "${item.text}" → ${item.parsed}`);
  });
  
  // Test 4: Check current running detection
  console.log('\n📡 Testing extension communication...');
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('❌ Extension communication failed:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ Extension communication working:', response);
        
        // Trigger tracking test
        chrome.runtime.sendMessage({ type: 'START_TRACKING' }, (resp) => {
          if (chrome.runtime.lastError) {
            console.log('❌ START_TRACKING failed:', chrome.runtime.lastError.message);
          } else {
            console.log('✅ START_TRACKING sent:', resp);
          }
        });
      }
    });
  }
  
  console.log('\n====================================');
  console.log('🏁 SHADOW DOM TEST COMPLETE');
  console.log('Now watch for [VIEWER:PAGE] logs...');
  
})();