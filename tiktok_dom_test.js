// DOM VERIFICATION TEST SCRIPT
// Paste this into the TikTok Live page console to test viewer detection

(function() {
  console.log('🔍 SPIKELY DOM DETECTION TEST');
  console.log('=====================================');
  
  // Test 1: Check if we're on TikTok Live
  const isTikTokLive = window.location.hostname.includes('tiktok.com') && 
                      (window.location.pathname.includes('/live') || 
                       document.querySelector('[data-e2e*="live"]'));
  
  console.log('📍 Platform check:', isTikTokLive ? 'TikTok Live ✅' : 'Not TikTok Live ❌');
  
  if (!isTikTokLive) {
    console.log('⚠️ This test should be run on a TikTok Live page');
    return;
  }
  
  // Test 2: Modern selectors
  console.log('\n🎯 Testing modern selectors:');
  const modernSelectors = [
    '[data-e2e="live-audience-count"]',
    '[data-e2e*="viewer"]', 
    '[data-e2e*="audience"]',
    '[class*="LiveAudience"]',
    '[class*="AudienceCount"]',
    '[class*="ViewerCount"]',
    '[class*="live-audience"]'
  ];
  
  modernSelectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`   ${selector}: ${elements.length} elements found`);
    if (elements.length > 0) {
      Array.from(elements).slice(0, 3).forEach(el => {
        console.log(`      → "${el.textContent?.trim()?.substring(0, 50)}"`);
      });
    }
  });
  
  // Test 3: Text pattern search
  console.log('\n🔤 Testing text patterns:');
  const textElements = Array.from(document.querySelectorAll('span, div, p, strong, label'));
  let viewerPatterns = [];
  
  textElements.forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.length < 100) {
      // Pattern 1: "Viewers • X"
      if (/viewers?\s*[•·]\s*[\d\.,]+[KkMm]?/i.test(text)) {
        viewerPatterns.push({ type: 'viewers_bullet', text, element: el });
      }
      // Pattern 2: "X watching"
      if (/^\d+[\.,\d]*[KkMm]?\s+(watching|viewers?)$/i.test(text)) {
        viewerPatterns.push({ type: 'x_watching', text, element: el });
      }
    }
  });
  
  console.log(`   Found ${viewerPatterns.length} text patterns:`);
  viewerPatterns.forEach(p => {
    console.log(`      ${p.type}: "${p.text}"`);
  });
  
  // Test 4: Contextual numbers
  console.log('\n🔢 Testing contextual numbers:');
  const numberElements = Array.from(document.querySelectorAll('span, div')).filter(el => {
    const text = el.textContent?.trim() || '';
    return /^\d+[\.,\d]*[KkMm]?$/.test(text) && text.length <= 8;
  });
  
  let contextualNumbers = [];
  numberElements.forEach(el => {
    const text = el.textContent.trim().replace(/,/g, '');
    const num = parseFloat(text.replace(/[KkMm]/i, ''));
    const multiplier = /[Kk]/.test(text) ? 1000 : (/[Mm]/.test(text) ? 1000000 : 1);
    const parsed = num * multiplier;
    
    if (parsed > 100) {
      const context = [
        el.parentElement?.textContent?.toLowerCase() || '',
        el.previousElementSibling?.textContent?.toLowerCase() || '',
        el.nextElementSibling?.textContent?.toLowerCase() || ''
      ].join(' ');
      
      const hasViewerContext = /\b(viewer|watching|live|audience|online|count)\b/.test(context);
      
      if (hasViewerContext) {
        contextualNumbers.push({ text, parsed, context: context.substring(0, 50) });
      }
    }
  });
  
  console.log(`   Found ${contextualNumbers.length} contextual numbers:`);
  contextualNumbers.forEach(n => {
    console.log(`      "${n.text}" → ${n.parsed} | Context: "${n.context}"`);
  });
  
  // Test 5: Best candidate
  console.log('\n🏆 Best candidate:');
  let bestCandidate = null;
  
  if (viewerPatterns.length > 0) {
    bestCandidate = viewerPatterns[0];
    console.log(`   Text pattern: "${bestCandidate.text}"`);
  } else if (contextualNumbers.length > 0) {
    bestCandidate = contextualNumbers[0];
    console.log(`   Contextual number: "${bestCandidate.text}" → ${bestCandidate.parsed}`);
  } else {
    console.log('   ❌ No viable candidates found');
  }
  
  // Test 6: Extension communication check
  console.log('\n📡 Testing extension communication:');
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    console.log('   Chrome runtime: ✅');
    try {
      chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('   Extension ping: ❌', chrome.runtime.lastError.message);
        } else {
          console.log('   Extension ping: ✅', response);
        }
      });
    } catch (e) {
      console.log('   Extension ping: ❌', e.message);
    }
  } else {
    console.log('   Chrome runtime: ❌ Not available');
  }
  
  console.log('\n=====================================');
  console.log('🏁 DOM DETECTION TEST COMPLETE');
})();