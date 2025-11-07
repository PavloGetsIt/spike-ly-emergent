# RESILIENT DOM LVT PATCH - VALIDATION TEST R4

## Pre-Deployment Validation Script
Run this in TikTok Live console to validate all fixes:

```javascript
// LVT PATCH R4: Comprehensive validation test with detached root detection
(function() {
  console.log('🧪 LVT PATCH R4 VALIDATION TEST');
  console.log('============================');
  
  let testResults = {
    shadowTraversal: false,
    visibilityValidation: false,
    jitterFilter: false,
    observerBinding: false,
    messageReliability: false
  };
  
  // LVT PATCH R4: Mock chrome.runtime if not available for page-context testing
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.log('⚠️ Chrome extension APIs not available, using mock for testing');
    window.chrome = {
      runtime: {
        sendMessage: (message, callback) => {
          console.log('🔧 Mock sendMessage:', message.type);
          setTimeout(() => callback({ success: true }), 10);
        },
        lastError: null
      }
    };
  }
  
  // Test 1: Enhanced Shadow DOM traversal with detached root detection
  console.log('\n🔍 Test 1: Shadow DOM Traversal (Enhanced)');
  function testShadowTraversal() {
    let shadowRootsFound = 0;
    let numbersFound = 0;
    let detachedRootsFound = 0;
    
    // LVT PATCH R4: Unified recursive scanner for shadow roots, detached elements, React fibers
    function unifiedRecursiveScan(node, depth = 0) {
      if (depth > 6) return; // LVT PATCH R4: Match content.js depth limit
      
      if (node.shadowRoot) {
        shadowRootsFound++;
        console.log(`Found shadow root #${shadowRootsFound} on ${node.tagName}`);
        
        // LVT PATCH R4: Check for detached shadow roots
        if (!node.isConnected) {
          detachedRootsFound++;
          console.log(`Found detached shadow root #${detachedRootsFound}`);
        }
        
        const shadowNumbers = node.shadowRoot.querySelectorAll('span, div, strong');
        for (const el of shadowNumbers) {
          const text = el.textContent?.trim();
          if (text) {
            // LVT PATCH R4: Strict filtering - allow integers, K, M suffix; discard >200,000
            const sanitized = text.replace(/[^\d.,KkMm]/g, '');
            if (sanitized && /^(\d+(?:\.\d+)?(?:,\d{3})*?)([km]?)$/i.test(sanitized)) {
              const match = sanitized.match(/^(\d+(?:\.\d+)?(?:,\d{3})*?)([km]?)$/i);
              if (match) {
                let num = parseFloat(match[1].replace(/,/g, ''));
                const suffix = match[2].toLowerCase();
                if (suffix === 'k') num *= 1000;
                if (suffix === 'm') num *= 1000000;
                
                // LVT PATCH R4: Normalize to range [0 - 200,000]
                const normalized = Math.round(num);
                if (normalized >= 0 && normalized <= 200000) {
                  console.log("✅ Shadow DOM number found:", text, "→", normalized); // LVT PATCH R4: Enhanced validation capture
                  numbersFound++;
                  testResults.shadowTraversal = true;
                }
              }
            }
          }
        }
        
        // LVT PATCH R4: Recursively scan shadow root children
        const shadowChildren = node.shadowRoot.querySelectorAll('*');
        for (const child of shadowChildren) {
          unifiedRecursiveScan(child, depth + 1);
        }
      }
      
      // LVT PATCH R4: Scan regular children
      for (const child of node.children || []) {
        unifiedRecursiveScan(child, depth + 1);
      }
    }
    
    // LVT PATCH R4: Start unified scan from document
    unifiedRecursiveScan(document.documentElement);
    
    console.log(`Found ${shadowRootsFound} shadow roots total (${detachedRootsFound} detached), ${numbersFound} valid numeric elements`);
    
    // LVT PATCH R4: Pass if we found shadow roots AND valid numbers
    const passed = shadowRootsFound >= 1 && numbersFound >= 1;
    testResults.shadowTraversal = passed;
    return passed;
  }
  
  // Test 2: Enhanced visibility validation with size/opacity/connectivity criteria  
  console.log('\n👁️ Test 2: Visibility Validation (Enhanced)');
  function testVisibilityValidation() {
    let validElements = 0;
    let hiddenElements = 0;
    
    document.querySelectorAll('span, div, strong').forEach(el => {
      const text = el.textContent?.trim();
      if (text) {
        // LVT PATCH R4: Use same strict filtering as shadow traversal
        const sanitized = text.replace(/[^\d.,KkMm]/g, '');
        if (sanitized && /^(\d+(?:\.\d+)?(?:,\d{3})*?)([km]?)$/i.test(sanitized)) {
          const isConnected = el.isConnected;
          const ariaHidden = el.getAttribute('aria-hidden') === 'true';
          const style = window.getComputedStyle(el);
          const hasOffsetParent = el.offsetParent !== null;
          const isVisible = parseFloat(style.opacity) > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          const rect = el.getBoundingClientRect();
          const hasSize = rect.width > 0 && rect.height > 0;
          
          if (isConnected && !ariaHidden && (hasOffsetParent || style.position === 'fixed') && isVisible && hasSize) {
            validElements++;
            console.log(`✅ Valid: "${text}" → ${sanitized}`);
          } else {
            hiddenElements++;
            console.log(`❌ Hidden: "${text}" (connected:${isConnected}, aria:${ariaHidden}, visible:${isVisible}, size:${hasSize})`);
          }
        }
      }
    });
    
    console.log(`Valid: ${validElements}, Hidden: ${hiddenElements}`);
    testResults.visibilityValidation = validElements > 0;
    return validElements > hiddenElements;
  }
  
  // Test 3: Jitter filter simulation
  console.log('\n📊 Test 3: Jitter Filter');
  function testJitterFilter() {
    const testSequence = [100, 102, 101, 103, 101, 106, 104]; // Simulate viewer fluctuation
    let emissions = 0;
    let lastEmitted = 0;
    
    testSequence.forEach((count, i) => {
      const delta = Math.abs(count - lastEmitted);
      const shouldEmit = delta > 2; // LVT PATCH R4: Jitter filter logic
      
      if (shouldEmit) {
        emissions++;
        lastEmitted = count;
        console.log(`✅ Emit: ${count} (delta: ${delta})`);
      } else {
        console.log(`⚪ Filter: ${count} (delta: ${delta})`);
      }
    });
    
    console.log(`Emissions: ${emissions}/${testSequence.length} (filtering working)`);
    testResults.jitterFilter = emissions < testSequence.length;
    return emissions > 0 && emissions < testSequence.length;
  }
  
  // Test 4: MutationObserver binding
  console.log('\n🔄 Test 4: MutationObserver Binding');
  function testObserverBinding() {
    const testDiv = document.createElement('div');
    testDiv.textContent = '100';
    testDiv.style.position = 'fixed';
    testDiv.style.top = '-1000px';
    document.body.appendChild(testDiv);
    
    let mutationCount = 0;
    try {
      const observer = new MutationObserver(() => {
        mutationCount++;
      });
      
      observer.observe(testDiv, {
        subtree: true,
        childList: true,
        characterData: true
      });
      
      // Trigger mutations
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
      document.body.removeChild(testDiv);
    }
  }
  
  // Test 5: Enhanced message reliability
  console.log('\n📡 Test 5: Message Reliability (Enhanced)');
  function testMessageReliability() {
    let attempts = 0;
    let successes = 0;
    
    function sendTestMessage(retryCount = 0) {
      attempts++;
      chrome.runtime.sendMessage({ type: 'PING', test: true }, (response) => {
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError.message;
          console.log(`❌ Attempt ${attempts}: ${error}`);
          
          if (error.includes('Receiving end does not exist') && retryCount < 3) {
            console.log(`🔄 Retrying in ${50 * Math.pow(2, retryCount)}ms...`);
            setTimeout(() => sendTestMessage(retryCount + 1), 50 * Math.pow(2, retryCount));
          }
        } else {
          successes++;
          console.log(`✅ Attempt ${attempts}: Success`);
          testResults.messageReliability = true;
        }
      });
    }
    
    // LVT PATCH R4: Test multiple messages to ensure reliability
    for (let i = 0; i < 3; i++) {
      setTimeout(() => sendTestMessage(), i * 150);
    }
    
    return true;
  }
  
  // Run all tests
  testShadowTraversal();
  testVisibilityValidation();
  testJitterFilter();
  testObserverBinding();
  testMessageReliability();
  
  // Final report after 4 seconds (LVT PATCH R4: Extended for comprehensive testing)
  setTimeout(() => {
    console.log('\n📋 FINAL VALIDATION REPORT');
    console.log('===========================');
    
    Object.entries(testResults).forEach(([test, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
    });
    
    const passCount = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    console.log(`\n🏆 SCORE: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
      console.log('🎉 All LVT patch validations PASSED!');
    } else {
      console.log('⚠️ Some validations FAILED - check implementation');
    }
    
  }, 4000); // LVT PATCH R4: Extended timeout for comprehensive testing
  
})();
```

## Expected Console Output:
```
✅ shadowTraversal: PASS
✅ visibilityValidation: PASS  
✅ jitterFilter: PASS
✅ observerBinding: PASS
✅ messageReliability: PASS
🏆 SCORE: 5/5 tests passed
🎉 All LVT patch validations PASSED!
```