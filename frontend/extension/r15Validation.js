// ============================================================================
// LVT R15 VALIDATION SCRIPT
// Minimal 2-check validation: content loaded + message detected
// ============================================================================

(function() {
  'use strict';
  
  console.log('🧪 LVT R15 VALIDATION TEST');
  console.log('==========================');
  
  let results = {
    contentLoaded: false,
    messageDetected: false
  };
  
  let detectedValue = null;
  let messageCount = 0;
  
  // Test 1: Content Script Load Check
  console.log('\n📄 Test 1: Content Script Load');
  const isLoaded = window.__spikelyLVT_R15 === true;
  
  if (isLoaded) {
    console.log('✅ Content loaded: true');
    console.log('   Marker: window.__spikelyLVT_R15 =', window.__spikelyLVT_R15);
    results.contentLoaded = true;
  } else {
    console.log('❌ Content loaded: false');
    console.log('   Marker: window.__spikelyLVT_R15 =', window.__spikelyLVT_R15);
    console.log('   💡 Content script may not be running. Check:');
    console.log('      - DevTools → Sources → Content scripts → lvtContent.js');
    console.log('      - Extension reloaded?');
    console.log('      - URL matches manifest patterns?');
  }
  
  // Test 2: Message Detection (5 second window)
  console.log('\n📡 Test 2: Message Detection (5s window)');
  
  if (chrome?.runtime?.onMessage) {
    const messageListener = (msg) => {
      if (msg.type === 'VIEWER_COUNT_UPDATE') {
        messageCount++;
        detectedValue = msg.value;
        console.log(`✅ Message detected #${messageCount}: value=${detectedValue}`);
        results.messageDetected = true;
      }
    };
    
    chrome.runtime.onMessage.addListener(messageListener);
    
    // Cleanup listener after test
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(messageListener);
    }, 5500);
  } else {
    console.log('⚠️ chrome.runtime.onMessage not available');
  }
  
  // Final report after 5 seconds
  setTimeout(() => {
    console.log('\n📋 FINAL R15 RESULTS');
    console.log('====================');
    console.log(`${results.contentLoaded ? '✅' : '❌'} Content loaded: ${results.contentLoaded}`);
    console.log(`${results.messageDetected ? '✅' : '❌'} Message detected: ${detectedValue !== null ? detectedValue : 'none'}`);
    
    const passCount = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`\n🏆 SCORE: ${passCount}/${totalTests} - ${passCount === totalTests ? 'PASSED' : 'FAILED'}`);
    
    if (passCount === totalTests) {
      console.log('🎉 All LVT R15 validations PASSED!');
    } else {
      console.log('⚠️ Some R15 validations FAILED');
      
      if (!results.contentLoaded) {
        console.log('\n💡 CONTENT FAIL: Content script not loaded');
        console.log('   → Check DevTools → Sources → Content scripts');
        console.log('   → Verify manifest.json URL patterns match current URL');
        console.log('   → Reload extension and refresh TikTok Live page');
      }
      
      if (!results.messageDetected) {
        console.log('\n💡 MESSAGE FAIL: No VIEWER_COUNT_UPDATE detected');
        console.log('   → Check TikTok console for [LVT:R15] logs');
        console.log('   → Verify viewer count is visible on TikTok Live page');
        console.log('   → Check background console for [BG:R15] logs');
      }
    }
    
    console.log('\n📝 OPERATOR NOTES');
    console.log('=================');
    console.log(`Content script loaded: ${results.contentLoaded}`);
    console.log(`Messages received: ${messageCount}`);
    console.log(`Latest value: ${detectedValue !== null ? detectedValue : 'none'}`);
    
  }, 5000);
  
})();

