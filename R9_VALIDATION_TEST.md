# LVT PATCH R9 VALIDATION TEST

**Minimal validation script for manual DevTools testing only (NOT shipped in production bundle):**

```javascript
// LVT PATCH R9: Minimal validation test (DevTools only - not in production)
(function() {
  console.log('🧪 LVT R9 VALIDATION TEST');
  console.log('=========================');
  
  let results = {
    preloadHook: false,
    shadowRegistry: false,
    viewerDetection: false,
    messageEmission: false
  };
  
  // Test 1: Preload Hook Check
  console.log('\n🚀 Test 1: Preload Hook');
  const hookExists = !!window.__spikely_attachShadow_patched;
  const registryExists = !!window.__spikely_shadow_registry;
  
  console.log(`AttachShadow patched: ${hookExists}`);
  console.log(`Registry exists: ${registryExists}`);
  
  if (hookExists && registryExists) {
    console.log('✅ preloadHook: PASS');
    results.preloadHook = true;
  } else {
    console.log('❌ preloadHook: FAIL');
  }
  
  // Test 2: Shadow Registry Population
  console.log('\n🎯 Test 2: Shadow Registry');
  const allElements = document.querySelectorAll('*');
  let shadowHosts = 0;
  
  for (const el of allElements) {
    if (el.shadowRoot) {
      shadowHosts++;
    }
  }
  
  console.log(`Shadow hosts found: ${shadowHosts}`);
  
  if (shadowHosts >= 1) {
    console.log('✅ shadowRegistry: PASS');
    results.shadowRegistry = true;
  } else {
    console.log('❌ shadowRegistry: FAIL');
  }
  
  // Test 3: Viewer Detection
  console.log('\n🔍 Test 3: Viewer Detection');
  let viewersFound = false;
  
  // Look for "Viewers" text on page
  for (const el of allElements) {
    const text = el.textContent?.trim();
    if (text && /viewers?\s*[·•]\s*\d+/i.test(text)) {
      console.log('✅ TikTok viewer pattern found:', text);
      viewersFound = true;
      break;
    }
  }
  
  if (viewersFound) {
    console.log('✅ viewerDetection: PASS');
    results.viewerDetection = true;
  } else {
    console.log('❌ viewerDetection: FAIL');
  }
  
  // Test 4: Listen for Messages (5 second window)
  console.log('\n📡 Test 4: Message Emission (listening for 5s...)');
  let messageDetected = false;
  
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'VIEWER_COUNT_UPDATE' && msg.count > 0) {
        console.log('✅ VIEWER_COUNT_UPDATE detected:', msg.count);
        messageDetected = true;
        results.messageEmission = true;
      }
    });
  }
  
  // Final report after 5 seconds
  setTimeout(() => {
    if (!messageDetected) {
      console.log('❌ messageEmission: FAIL');
    } else {
      console.log('✅ messageEmission: PASS');
    }
    
    console.log('\n📋 FINAL RESULTS');
    console.log('================');
    
    Object.entries(results).forEach(([test, pass]) => {
      console.log(`${pass ? '✅' : '❌'} ${test}: ${pass ? 'PASS' : 'FAIL'}`);
    });
    
    const passCount = Object.values(results).filter(Boolean).length;
    console.log(`\n🏆 SCORE: ${passCount}/4 tests passed`);
    
    if (passCount === 4) {
      console.log('🎉 All R9 validations PASSED!');
    } else {
      console.log('⚠️ Some R9 validations FAILED');
    }
    
  }, 5000);
  
})();
```