// SPIKELY LVT PIPELINE TEST SCRIPT
// Run this in browser console on TikTok Live page to verify end-to-end functionality

(function() {
  console.log('🚀 SPIKELY LVT PIPELINE TEST');
  console.log('========================================');
  
  let testResults = {
    domDetection: false,
    portConnection: false,
    messageFlow: false,
    sidePanelReceive: false
  };
  
  // Test 1: DOM Detection
  console.log('\n🔍 TEST 1: TikTok DOM Detection');
  console.log('--------------------------------');
  
  // Simulate the multi-tier detection logic
  function testDOMDetection() {
    // Tier 1: Modern selectors
    const tier1Selectors = [
      '[data-e2e="live-room-viewers"]',
      '[data-testid="live-viewers-count"]',
      '[data-e2e*="live-audience"]',
      '[data-e2e*="viewer-count"]'
    ];
    
    let found = false;
    tier1Selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        console.log(`✅ Found ${elements.length} elements with: ${selector}`);
        found = true;
      }
    });
    
    // Tier 2: Aria-label search
    const ariaElements = document.querySelectorAll('[aria-label*="viewer"], [aria-label*="watching"]');
    ariaElements.forEach(el => {
      const label = el.getAttribute('aria-label');
      const match = label.match(/([\d,]+(?:\.[\d]+)?[KkMm]?)\s*(?:viewer|watching)/i);
      if (match) {
        console.log(`✅ Aria-label match: "${label}" → ${match[1]}`);
        found = true;
      }
    });
    
    // Tier 3: Container traversal
    const containers = document.querySelectorAll('div[data-e2e*="live"], section[class*="live"]');
    console.log(`🔍 Found ${containers.length} live containers to scan`);
    
    let bestCandidate = null;
    let bestScore = 0;
    
    containers.forEach(container => {
      const numberSpans = container.querySelectorAll('span, div, strong');
      numberSpans.forEach(span => {
        const text = span.textContent?.trim();
        if (text && /^\d+(\.\d+)?[KkMm]?$/.test(text)) {
          const containerText = container.textContent.toLowerCase();
          const contextScore = 
            (containerText.includes('viewer') ? 3 : 0) +
            (containerText.includes('watching') ? 3 : 0) +
            (containerText.includes('live') ? 1 : 0) +
            (containerText.includes('audience') ? 2 : 0);
            
          const num = parseFloat(text.replace(/[KkMm]/i, '')) * 
                     (/[Kk]/.test(text) ? 1000 : (/[Mm]/.test(text) ? 1000000 : 1));
          
          if (contextScore > 0 && num > 100 && contextScore > bestScore) {
            bestCandidate = { text, num, contextScore, element: span };
            bestScore = contextScore;
            found = true;
          }
        }
      });
    });
    
    if (bestCandidate) {
      console.log(`✅ Best candidate: "${bestCandidate.text}" → ${bestCandidate.num} (score: ${bestCandidate.contextScore})`);
      console.log('   Element:', bestCandidate.element);
    }
    
    testResults.domDetection = found;
    return found;
  }
  
  const domFound = testDOMDetection();
  console.log(`DOM Detection: ${domFound ? '✅ PASS' : '❌ FAIL'}`);
  
  // Test 2: Extension Communication
  console.log('\n📡 TEST 2: Extension Communication');
  console.log('----------------------------------');
  
  function testExtensionComms() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.log('❌ Chrome runtime not available');
      return false;
    }
    
    return new Promise((resolve) => {
      // Test basic ping
      chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('❌ Extension ping failed:', chrome.runtime.lastError.message);
          resolve(false);
        } else {
          console.log('✅ Extension ping successful:', response);
          
          // Test port connection
          try {
            const testPort = chrome.runtime.connect({ name: 'test-port' });
            testPort.onDisconnect.addListener(() => {
              console.log('✅ Port connection test successful');
              testResults.portConnection = true;
              resolve(true);
            });
            testPort.disconnect();
          } catch (e) {
            console.log('❌ Port connection failed:', e.message);
            resolve(false);
          }
        }
      });
    });
  }
  
  // Test 3: Message Flow Simulation
  function testMessageFlow() {
    console.log('\n🔄 TEST 3: Message Flow Simulation');
    console.log('----------------------------------');
    
    if (!testResults.portConnection) {
      console.log('❌ Skipping message flow test (no port connection)');
      return false;
    }
    
    try {
      // Simulate viewer count update
      const testCount = Math.floor(Math.random() * 5000) + 500;
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        platform: 'tiktok',
        count: testCount,
        delta: Math.floor(Math.random() * 21) - 10,
        timestamp: Date.now(),
        source: 'test_simulation'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('❌ Message flow test failed:', chrome.runtime.lastError.message);
        } else {
          console.log(`✅ Message flow test successful: sent count=${testCount}`);
          testResults.messageFlow = true;
        }
      });
      return true;
    } catch (e) {
      console.log('❌ Message flow test error:', e.message);
      return false;
    }
  }
  
  // Run tests sequentially
  async function runTests() {
    await testExtensionComms();
    
    if (testResults.portConnection) {
      testMessageFlow();
    }
    
    // Final report
    setTimeout(() => {
      console.log('\n📊 FINAL TEST REPORT');
      console.log('====================');
      console.log(`DOM Detection: ${testResults.domDetection ? '✅' : '❌'}`);
      console.log(`Port Connection: ${testResults.portConnection ? '✅' : '❌'}`);
      console.log(`Message Flow: ${testResults.messageFlow ? '✅' : '❌'}`);
      
      const passCount = Object.values(testResults).filter(Boolean).length;
      const totalTests = Object.keys(testResults).length;
      
      console.log(`\n🏆 OVERALL: ${passCount}/${totalTests} tests passed`);
      
      if (passCount === totalTests) {
        console.log('🎉 All systems operational!');
      } else {
        console.log('⚠️ Some issues detected - check logs above');
      }
      
      console.log('\n📝 NEXT STEPS:');
      console.log('1. Load Spikely extension in chrome://extensions/');
      console.log('2. Open side panel and click "Start Audio"');
      console.log('3. Check console logs in all 3 contexts:');
      console.log('   - Content: Look for [VIEWER:PAGE] logs');
      console.log('   - Background: Look for [VIEWER:BG] logs');
      console.log('   - Side Panel: Look for [VIEWER:SP] logs');
    }, 2000);
  }
  
  runTests();
})();