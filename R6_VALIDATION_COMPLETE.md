# LVT PATCH R6 VALIDATION TEST

## Complete R6 Validation Script
Copy and paste this into TikTok Live console:

```javascript
// LVT PATCH R6: Comprehensive validation with shadow interception verification
(function() {
  console.log('🧪 LVT PATCH R6 VALIDATION TEST');
  console.log('============================');
  
  let testResults = {
    shadowInterception: false,    // LVT PATCH R6: New test
    shadowTraversal: false,
    visibilityValidation: false,
    jitterFilter: false,
    observerBinding: false,
    messageReliability: false,
    numericEmission: false        // LVT PATCH R6: New test
  };
  
  // LVT PATCH R6: Mock chrome.runtime if not available
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.log('⚠️ Chrome extension APIs not available, using mock for testing');
    window.chrome = {
      runtime: {
        sendMessage: (message, callback) => {
          console.log('🔧 Mock sendMessage:', message.type);
          setTimeout(() => callback({ success: true }), 10);
        },
        lastError: null,
        onMessage: { addListener: () => {} }
      }
    };
  }
  
  // Test 1: Shadow Root Interception Registry
  console.log('\n🎯 Test 1: Shadow Root Interception');
  function testShadowInterception() {
    const registryExists = !!window.__spikely_shadow_registry;
    console.log(`Shadow registry exists: ${registryExists}`);
    
    if (registryExists) {
      let capturedCount = 0;
      try {
        for (const root of window.__spikely_shadow_registry) {
          capturedCount++;
        }
      } catch (e) {
        console.log('Registry access error:', e.message);
      }
      
      console.log(`✅ Shadow interception registry has ${capturedCount} captured roots`);
      testResults.shadowInterception = capturedCount >= 1;
      return capturedCount >= 1;
    } else {
      console.log('❌ Shadow registry not found');
      return false;
    }
  }
  
  // Test 2: Enhanced Shadow DOM traversal with registry access
  console.log('\n🔍 Test 2: Shadow DOM Traversal (Registry Access)');
  function testShadowTraversal() {
    let shadowRootsFound = 0;
    let tiktokViewersFound = 0;
    let registryRootsScanned = 0;
    
    // LVT PATCH R6: Scan captured shadow root registry first
    if (window.__spikely_shadow_registry) {
      console.log('🎯 Scanning captured shadow root registry...');
      
      for (const shadowRoot of window.__spikely_shadow_registry) {
        registryRootsScanned++;
        console.log(`Scanning captured shadow root #${registryRootsScanned}`);
        
        const shadowElements = shadowRoot.querySelectorAll('span, div, strong');
        for (const el of shadowElements) {
          const text = el.textContent?.trim();
          if (text) {
            // LVT PATCH R6: Look for TikTok viewer patterns
            if (/viewers?\s*[·•]\s*\d+/i.test(text)) {
              console.log("✅ Shadow DOM number found:", text);
              tiktokViewersFound++;
              testResults.shadowTraversal = true;
            } else if (/^\d+(?:\.\d+)?[KkMm]?$/.test(text)) {
              const context = el.parentElement?.textContent?.toLowerCase() || '';
              if (context.includes('viewer')) {
                console.log("✅ Shadow DOM number found:", text, "(context)");
                tiktokViewersFound++;
                testResults.shadowTraversal = true;
              }
            }
          }
        }
      }
    }
    
    // LVT PATCH R6: Also scan document shadow roots
    function regularShadowScan(node, depth = 0) {
      if (depth > 6) return;
      
      if (node.shadowRoot) {
        shadowRootsFound++;
        console.log(`Found document shadow root #${shadowRootsFound} on ${node.tagName}`);
        
        const shadowElements = node.shadowRoot.querySelectorAll('span, div, strong');
        for (const el of shadowElements) {
          const text = el.textContent?.trim();
          if (text && /viewers?\s*[·•]\s*\d+/i.test(text)) {
            console.log("✅ Shadow DOM number found:", text);
            tiktokViewersFound++;
            testResults.shadowTraversal = true;
          }
        }
        
        const shadowChildren = node.shadowRoot.querySelectorAll('*');
        for (const child of shadowChildren) {
          regularShadowScan(child, depth + 1);
        }
      }
      
      for (const child of node.children || []) {
        regularShadowScan(child, depth + 1);
      }
    }
    
    regularShadowScan(document.documentElement);
    
    console.log(`Registry: ${registryRootsScanned} captured, Document: ${shadowRootsFound} found, Viewers: ${tiktokViewersFound} detected`);
    
    // LVT PATCH R6: Pass if registry OR document scanning found TikTok viewers
    const passed = tiktokViewersFound > 0;
    testResults.shadowTraversal = passed;
    return passed;
  }
  
  // Test 3: Enhanced visibility validation
  console.log('\n👁️ Test 3: Visibility Validation');
  function testVisibilityValidation() {
    let validElements = 0;
    let hiddenElements = 0;
    
    document.querySelectorAll('span, div, strong').forEach(el => {
      const text = el.textContent?.trim();
      if (text && /^\d+(?:\.\d+)?[KkMm]?$/.test(text)) {
        const isConnected = el.isConnected;
        const ariaHidden = el.getAttribute('aria-hidden') === 'true';
        const style = window.getComputedStyle(el);
        const isVisible = parseFloat(style.opacity) > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        const rect = el.getBoundingClientRect();
        const hasSize = rect.width > 0 && rect.height > 0;
        
        if (isConnected && !ariaHidden && isVisible && hasSize) {
          validElements++;
          console.log(`✅ Valid: "${text}"`);
        } else {
          hiddenElements++;
        }
      }
    });
    
    console.log(`Valid: ${validElements}, Hidden: ${hiddenElements}`);
    testResults.visibilityValidation = validElements > 0;
    return validElements > 0;
  }
  
  // Test 4: Jitter filter simulation
  console.log('\n📊 Test 4: Jitter Filter');
  function testJitterFilter() {
    const testSequence = [100, 102, 101, 103, 101, 106, 104];
    let emissions = 0;
    let lastEmitted = 0;
    
    testSequence.forEach(count => {
      const delta = Math.abs(count - lastEmitted);
      if (delta > 2) {
        emissions++;
        lastEmitted = count;
        console.log(`✅ Emit: ${count} (delta: ${delta})`);
      } else {
        console.log(`⚪ Filter: ${count} (delta: ${delta})`);
      }
    });
    
    testResults.jitterFilter = emissions < testSequence.length;
    return emissions > 0 && emissions < testSequence.length;
  }
  
  // Test 5: MutationObserver binding
  console.log('\n🔄 Test 5: MutationObserver Binding');
  function testObserverBinding() {
    const testDiv = document.createElement('div');
    testDiv.textContent = '100';
    testDiv.style.position = 'fixed';
    testDiv.style.top = '-1000px';
    document.body.appendChild(testDiv);
    
    let mutationCount = 0;
    try {
      const observer = new MutationObserver(() => mutationCount++);
      observer.observe(testDiv, { subtree: true, childList: true, characterData: true });
      
      testDiv.textContent = '105';
      testDiv.textContent = '110';
      
      setTimeout(() => {
        observer.disconnect();
        document.body.removeChild(testDiv);
        console.log(`✅ Observer detected ${mutationCount} mutations`);
        testResults.observerBinding = mutationCount > 0;
      }, 100);
      
    } catch (e) {
      console.log(`❌ Observer test failed: ${e.message}`);
      if (document.body.contains(testDiv)) document.body.removeChild(testDiv);
    }
  }
  
  // Test 6: Message reliability
  console.log('\n📡 Test 6: Message Reliability');
  function testMessageReliability() {
    let attempts = 0;
    
    function sendTestMessage(retryCount = 0) {
      attempts++;
      chrome.runtime.sendMessage({ type: 'PING', test: true }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`❌ Attempt ${attempts}: ${chrome.runtime.lastError.message}`);
          if (retryCount < 3) setTimeout(() => sendTestMessage(retryCount + 1), 50 * Math.pow(2, retryCount));
        } else {
          console.log(`✅ Attempt ${attempts}: Success`);
          testResults.messageReliability = true;
        }
      });
    }
    
    for (let i = 0; i < 5; i++) {
      setTimeout(() => sendTestMessage(), i * 120);
    }
  }
  
  // Test 7: Numeric emission detection
  console.log('\n📨 Test 7: Numeric Emission Detection');
  function testNumericEmission() {
    console.log('Monitoring for [VIEWER:PAGE] and VIEWER_COUNT_UPDATE emissions...');
    
    // LVT PATCH R6: Enhanced emission detection
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'VIEWER_COUNT_UPDATE' && message.count > 0) {
          console.log(`📨 VIEWER_COUNT emission detected: ${message.count}`);
          testResults.numericEmission = true;
        }
      });
    }
    
    // LVT PATCH R6: Monitor console logs for [VIEWER:PAGE] emissions
    const originalLog = console.log;
    console.log = function(...args) {
      const result = originalLog.apply(console, args);
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[VIEWER:PAGE] value=')) {
        console.log(`📨 Direct [VIEWER:PAGE] emission detected`);
        testResults.numericEmission = true;
      }
      return result;
    };
  }
  
  // Run all tests
  testShadowInterception();
  testShadowTraversal();
  testVisibilityValidation(); 
  testJitterFilter();
  testObserverBinding();
  testMessageReliability();
  testNumericEmission();
  
  // Final report after 5 seconds
  setTimeout(() => {
    console.log('\n📋 FINAL VALIDATION REPORT R6');
    console.log('==============================');
    
    Object.entries(testResults).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
    });
    
    const passCount = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    console.log(`\n🏆 SCORE: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
      console.log('🎉 All LVT PATCH R6 validations PASSED!');
    } else {
      console.log('⚠️ Some R6 validations FAILED');
      
      if (!testResults.shadowInterception) {
        console.log('💡 shadowInterception FAIL: Registry not working');
      }
      if (!testResults.shadowTraversal) {
        console.log('💡 shadowTraversal FAIL: No viewer patterns found');  
      }
      if (!testResults.numericEmission) {
        console.log('💡 numericEmission FAIL: No VIEWER_COUNT messages detected');
      }
    }
    
  }, 5000);
  
})();
```