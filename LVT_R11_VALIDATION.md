# LVT PATCH R11 VALIDATION TEST

**Simple validation for R11 production DOM tracking:**

```javascript
// LVT R11: Production validation test
(function() {
  console.log('🧪 LVT R11 VALIDATION TEST');
  console.log('=========================');
  
  let results = { viewerDetection: false, messageEmission: false };
  
  // Test 1: Precise TikTok Viewer Detection  
  console.log('\n🔍 Test 1: Precise Viewer Detection');
  
  const allElements = Array.from(document.querySelectorAll('*'));
  let preciseViewerFound = false;
  let viewerCount = null;
  
  for (const el of allElements) {
    const text = el.textContent?.trim();
    // Look for exact "Viewers · X" pattern
    if (text && /viewers?[\s·•]\d+/i.test(text)) {
      const match = text.match(/viewers?[\s·•](\d+(?:\.\d+)?[KkMm]?)/i);
      if (match) {
        viewerCount = match[1];
        console.log('✅ Precise TikTok viewer pattern found:', text, '→ Count:', viewerCount);
        preciseViewerFound = true;
        results.viewerDetection = true;
        break;
      }
    }
  }
  
  if (!preciseViewerFound) {
    console.log('❌ No precise TikTok viewer pattern found');
  }
  
  // Test 2: Message Emission Detection
  console.log('\n📡 Test 2: Message Emission (5s window)');
  let messageDetected = false;
  
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'VIEWER_COUNT_UPDATE') {
        console.log('✅ VIEWER_COUNT_UPDATE detected:', {
          count: msg.count,
          delta: msg.delta,
          timestamp: msg.timestamp
        });
        messageDetected = true;
        results.messageEmission = true;
      }
    });
  }
  
  // Final report after 5 seconds
  setTimeout(() => {
    if (!messageDetected) {
      console.log('❌ No VIEWER_COUNT_UPDATE messages detected');
    }
    
    console.log('\n📋 FINAL RESULTS');
    console.log('================');
    
    Object.entries(results).forEach(([test, pass]) => {
      console.log(`${pass ? '✅' : '❌'} ${test}: ${pass ? 'PASS' : 'FAIL'}`);
    });
    
    const passCount = Object.values(results).filter(Boolean).length;
    console.log(`\n🏆 SCORE: ${passCount}/2 tests passed`);
    
    if (passCount === 2) {
      console.log('🎉 LVT R11 validation PASSED!');
      console.log(`💡 Expected viewer count: ${viewerCount || 'unknown'}`);
    } else {
      console.log('⚠️ LVT R11 validation FAILED');
      
      if (!results.viewerDetection) {
        console.log('💡 DETECTION FAIL: No "Viewers · X" pattern found on page');
      }
      if (!results.messageEmission) {
        console.log('💡 EMISSION FAIL: Extension not sending VIEWER_COUNT_UPDATE');
      }
    }
    
  }, 5000);
  
})();
```