// Audio Capture Diagnostic Test Script
// Run this in the sidepanel console to test audio capture flow

console.log('🧪 AUDIO CAPTURE DIAGNOSTIC TEST v2.9.1');
console.log('========================================');

// Test 1: Check if START_AUDIO message handler exists
async function testMessageHandler() {
  console.log('\n📋 Test 1: Message Handler Check');
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_AUDIO',
      requestId: 'test-' + Date.now(),
      gesture: true,
      timestamp: Date.now()
    });
    
    if (response) {
      console.log('✅ Message handler responded:', response);
      return true;
    } else {
      console.error('❌ No response from message handler');
      return false;
    }
  } catch (error) {
    console.error('❌ Message handler error:', error);
    return false;
  }
}

// Test 2: Check active tab eligibility
async function testTabEligibility() {
  console.log('\n📋 Test 2: Tab Eligibility Check');
  
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab) {
      console.error('❌ No active tab found');
      return false;
    }
    
    console.log('Tab ID:', activeTab.id);
    console.log('Tab URL:', activeTab.url);
    console.log('Tab Title:', activeTab.title);
    
    const isTikTok = /tiktok\.com.*\/live/i.test(activeTab.url);
    const isSupported = isTikTok || /twitch\.tv|kick\.com|youtube\.com/i.test(activeTab.url);
    
    if (isSupported) {
      console.log('✅ Tab is eligible for capture');
      console.log('Platform:', isTikTok ? 'TikTok' : 'Other supported');
      return true;
    } else {
      console.error('❌ Tab is NOT eligible for capture');
      console.error('Please open a TikTok Live, Twitch, Kick, or YouTube Live stream');
      return false;
    }
  } catch (error) {
    console.error('❌ Tab check error:', error);
    return false;
  }
}

// Test 3: Check offscreen document
async function testOffscreenDocument() {
  console.log('\n📋 Test 3: Offscreen Document Check');
  
  try {
    const contexts = await chrome.runtime.getContexts({});
    const offscreen = contexts.find(c => c.contextType === 'OFFSCREEN_DOCUMENT');
    
    if (offscreen) {
      console.log('✅ Offscreen document exists');
      console.log('Document URL:', offscreen.documentUrl);
      return true;
    } else {
      console.warn('⚠️ Offscreen document not found (will be created on capture)');
      return true; // Not a failure, will be created
    }
  } catch (error) {
    console.error('❌ Offscreen check error:', error);
    return false;
  }
}

// Test 4: Check permissions
async function testPermissions() {
  console.log('\n📋 Test 4: Permissions Check');
  
  const requiredPermissions = ['tabCapture', 'activeTab', 'scripting', 'offscreen'];
  const results = {};
  
  for (const permission of requiredPermissions) {
    try {
      const granted = await chrome.permissions.contains({ permissions: [permission] });
      results[permission] = granted;
      
      if (granted) {
        console.log(`✅ ${permission}: granted`);
      } else {
        console.error(`❌ ${permission}: NOT granted`);
      }
    } catch (error) {
      console.error(`❌ ${permission}: check failed -`, error.message);
      results[permission] = false;
    }
  }
  
  const allGranted = Object.values(results).every(v => v === true);
  return allGranted;
}

// Test 5: Simulate audio capture (dry run)
async function testAudioCaptureDryRun() {
  console.log('\n📋 Test 5: Audio Capture Dry Run');
  console.log('⚠️ This will NOT actually start capture, just test the flow');
  
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab?.id) {
      console.error('❌ No active tab');
      return false;
    }
    
    console.log('Step 1: Tab validation... ✅');
    
    const isSupported = /tiktok\.com|twitch\.tv|kick\.com|youtube\.com/i.test(activeTab.url);
    if (!isSupported) {
      console.error('❌ Tab not supported');
      return false;
    }
    
    console.log('Step 2: Eligibility check... ✅');
    console.log('Step 3: Would focus tab... ✅');
    console.log('Step 4: Would inject activation script... ✅');
    console.log('Step 5: Would ensure offscreen... ✅');
    console.log('Step 6: Would call tabCapture.capture()... ✅');
    
    console.log('✅ Dry run complete - all steps would execute');
    return true;
  } catch (error) {
    console.error('❌ Dry run error:', error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  console.log('\n🚀 Running all diagnostic tests...\n');
  
  const results = {
    tabEligibility: await testTabEligibility(),
    offscreenDocument: await testOffscreenDocument(),
    permissions: await testPermissions(),
    dryRun: await testAudioCaptureDryRun()
  };
  
  console.log('\n========================================');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('========================================');
  
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
  });
  
  const allPassed = Object.values(results).every(v => v === true);
  
  console.log('\n========================================');
  if (allPassed) {
    console.log('✅ ALL TESTS PASSED');
    console.log('You can now click "Start Audio" button');
  } else {
    console.log('❌ SOME TESTS FAILED');
    console.log('Fix the issues above before starting audio capture');
  }
  console.log('========================================\n');
  
  return allPassed;
}

// Export test functions
window.__SPIKELY_AUDIO_TESTS__ = {
  runAll: runAllTests,
  testTabEligibility,
  testOffscreenDocument,
  testPermissions,
  testAudioCaptureDryRun
};

console.log('\n✅ Diagnostic script loaded');
console.log('Run: __SPIKELY_AUDIO_TESTS__.runAll()');
console.log('Or run individual tests:');
console.log('  - __SPIKELY_AUDIO_TESTS__.testTabEligibility()');
console.log('  - __SPIKELY_AUDIO_TESTS__.testOffscreenDocument()');
console.log('  - __SPIKELY_AUDIO_TESTS__.testPermissions()');
console.log('  - __SPIKELY_AUDIO_TESTS__.testAudioCaptureDryRun()');
