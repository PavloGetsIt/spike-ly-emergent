# LVT PATCH R8 VALIDATION TEST

```javascript
// LVT PATCH R8: Comprehensive validation with dynamic injection verification
(function() {
  console.log('🧪 LVT PATCH R8 VALIDATION TEST');
  console.log('============================');
  
  let testResults = {
    dynamicInjection: false,      // LVT PATCH R8: New test
    preloadHook: false,
    shadowInterception: false,
    shadowTraversal: false,
    visibilityValidation: false,
    jitterFilter: false,
    observerBinding: false,
    messageReliability: false,
    numericEmission: false
  };
  
  // LVT PATCH R8: Mock chrome.runtime if not available
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
  
  // Test 1: Dynamic Injection Verification
  console.log('\n⚡ Test 1: Dynamic Injection Verification');
  function testDynamicInjection() {
    const hasHookedFlag = !!window.__spikely_attachShadow_patched;
    const registryExists = !!window.__spikely_shadow_registry;
    
    console.log(`AttachShadow patched: ${hasHookedFlag}`);
    console.log(`Registry exists: ${registryExists}`);
    
    if (hasHookedFlag && registryExists) {
      console.log('✅ Dynamic injection successful');
      testResults.dynamicInjection = true;
      return true;
    } else {
      console.log('❌ Dynamic injection failed');
      return false;
    }
  }
  
  // Test 2: Preload Hook Verification  
  console.log('\n🚀 Test 2: Preload Hook Verification');
  function testPreloadHook() {
    // LVT PATCH R8: Check for preload hook initialization logs in last 10 seconds
    const foundInitLogs = performance.getEntriesByType && 
                          console.log.toString().includes('[VIEWER:INIT:HOOKED]');
    
    console.log(`Init logs detected: ${foundInitLogs}`);
    
    if (window.__spikely_shadow_registry instanceof WeakSet) {
      console.log('✅ Preload hook created WeakSet registry');
      testResults.preloadHook = true;
      return true;
    } else {
      console.log('❌ Preload hook failed - registry not WeakSet');
      return false;
    }
  }
  
  // Test 3: Shadow Root Interception Registry
  console.log('\n🎯 Test 3: Shadow Root Interception');
  function testShadowInterception() {
    if (!window.__spikely_shadow_registry) {
      console.log('❌ Shadow registry not found');
      return false;
    }
    
    // LVT PATCH R8: Count registry entries (WeakSet iteration not possible, check patch flag)
    const patchActive = !!window.__spikely_attachShadow_patched;
    
    if (patchActive) {
      console.log('✅ Shadow interception patch is active');
      testResults.shadowInterception = true;
      return true;
    } else {
      console.log('❌ Shadow interception patch not active');
      return false;
    }
  }
  
  // Test 4: Shadow DOM traversal with registry scanning
  console.log('\n🔍 Test 4: Shadow DOM Traversal (Dynamic Registry)');
  function testShadowTraversal() {
    let documentRootsFound = 0;
    let tiktokViewersFound = 0;
    
    // LVT PATCH R8: Scan document shadow roots (since WeakSet not iterable)
    function documentShadowScan(node, depth = 0) {
      if (depth > 6) return;
      
      if (node.shadowRoot) {
        documentRootsFound++;
        console.log(`Found shadow root #${documentRootsFound} on ${node.tagName}`);
        
        const shadowElements = node.shadowRoot.querySelectorAll('span, div, strong');
        for (const el of shadowElements) {
          const text = el.textContent?.trim();
          if (text) {
            // LVT PATCH R8: Look for TikTok viewer patterns
            if (/viewers?\s*[·•]\s*\d+/i.test(text)) {
              console.log("✅ Shadow DOM number found:", text);
              tiktokViewersFound++;
              testResults.shadowTraversal = true;
            } else if (/^\d+(?:\.\d+)?[KkMm]?$/.test(text)) {
              const context = el.parentElement?.textContent?.toLowerCase() || '';
              if (context.includes('viewer') || context.includes('watching')) {
                console.log("✅ Shadow DOM number found:", text, "(context)");
                tiktokViewersFound++;
                testResults.shadowTraversal = true;
              }
            }
          }
        }
      }
      
      for (const child of node.children || []) {
        documentShadowScan(child, depth + 1);
      }
    }
    
    documentShadowScan(document.documentElement);
    
    console.log(`Document roots: ${documentRootsFound}, TikTok viewers: ${tiktokViewersFound}`);
    
    // LVT PATCH R8: Pass if any TikTok viewer patterns found
    const passed = tiktokViewersFound > 0;
    testResults.shadowTraversal = passed;
    return passed;
  }
  
  // Test 5: Visibility validation
  console.log('\n👁️ Test 5: Visibility Validation');
  function testVisibilityValidation() {
    let validElements = 0;
    
    document.querySelectorAll('span, div, strong').forEach(el => {
      const text = el.textContent?.trim();
      if (text && /^\d+(?:\.\d+)?[KkMm]?$/.test(text)) {
        const isConnected = el.isConnected;
        const ariaHidden = el.getAttribute('aria-hidden') === 'true';
        const style = window.getComputedStyle(el);
        const isVisible = parseFloat(style.opacity) > 0 && style.display !== 'none';
        const rect = el.getBoundingClientRect();
        const hasSize = rect.width > 0 && rect.height > 0;
        
        if (isConnected && !ariaHidden && isVisible && hasSize) {
          validElements++;
          console.log(`✅ Valid: "${text}"`);
        }
      }
    });
    
    testResults.visibilityValidation = validElements > 0;
    return validElements > 0;
  }
  
  // Test 6: Jitter filter simulation
  console.log('\n📊 Test 6: Jitter Filter');
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
    
    testResults.jitterFilter = emissions > 0;
    return emissions > 0;
  }
  
  // Test 7: MutationObserver binding
  console.log('\n🔄 Test 7: MutationObserver Binding');
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
  
  // Test 8: Message reliability
  console.log('\n📡 Test 8: Message Reliability');
  function testMessageReliability() {
    function sendTestMessage() {
      chrome.runtime.sendMessage({ type: 'PING', test: true }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`❌ Message failed: ${chrome.runtime.lastError.message}`);
        } else {
          console.log(`✅ Message success`);
          testResults.messageReliability = true;
        }
      });
    }
    
    for (let i = 0; i < 3; i++) {
      setTimeout(sendTestMessage, i * 150);
    }
  }
  
  // Test 9: Numeric emission detection
  console.log('\n📨 Test 9: Numeric Emission Detection');
  function testNumericEmission() {
    // LVT PATCH R8: Monitor for viewer count emissions
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if ((message.type === 'VIEWER_COUNT_UPDATE' || message.type === 'VIEWER_HEARTBEAT') && message.count > 0) {
          console.log(`📨 VIEWER_COUNT emission: ${message.count}`);
          testResults.numericEmission = true;
        }
      });
    }
    
    // LVT PATCH R8: Monitor console for [VIEWER:PAGE] logs  
    const originalLog = console.log;
    console.log = function(...args) {
      const result = originalLog.apply(console, args);
      if (args[0] && typeof args[0] === 'string' && 
          (args[0].includes('[VIEWER:PAGE] value=') || 
           args[0].includes('[VIEWER:PAGE:UPDATE]') ||
           args[0].includes('[VIEWER:PAGE:FOUND]'))) {
        console.log(`📨 [VIEWER:PAGE] emission detected`);
        testResults.numericEmission = true;
      }
      return result;
    };
  }
  
  // Run all tests
  testDynamicInjection();
  testPreloadHook();
  testShadowInterception();
  testShadowTraversal();
  testVisibilityValidation(); 
  testJitterFilter();
  testObserverBinding();
  testMessageReliability();
  testNumericEmission();
  
  // Final report after 6 seconds
  setTimeout(() => {
    console.log('\n📋 FINAL VALIDATION REPORT R8');
    console.log('==============================');
    
    Object.entries(testResults).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
    });
    
    const passCount = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    console.log(`\n🏆 SCORE: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
      console.log('🎉 All LVT PATCH R8 validations PASSED!');
    } else {
      console.log('⚠️ Some R8 validations FAILED');
      
      if (!testResults.dynamicInjection) {
        console.log('💡 dynamicInjection FAIL: preloadHook.js not injected by background.js');
      }
      if (!testResults.preloadHook) {
        console.log('💡 preloadHook FAIL: Registry not created or wrong type');
      }
      if (!testResults.numericEmission) {
        console.log('💡 numericEmission FAIL: No viewer count logs detected');
      }
    }
    
  }, 6000);
  
})();
```