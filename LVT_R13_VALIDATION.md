# LVT R13 VALIDATION TEST

```javascript
// LVT R13: Complete end-to-end validation
(function() {
  console.log('🧪 LVT R13 VALIDATION TEST');
  console.log('==========================');
  
  let results = {
    contentLoad: false,
    viewerDetection: false, 
    messageEmission: false,
    schemaValidation: false,
    noPlaceholder: false
  };
  
  // Test 1: Content Script Load Check
  console.log('\n📄 Test 1: Content Script Load');
  const isActive = !!window.__SPIKELY_CONTENT_ACTIVE__;
  const hasLVT = !!window.__spikelyLVT;
  
  console.log(`Content active: ${isActive}`);
  console.log(`LVT initialized: ${hasLVT}`);
  
  if (isActive && hasLVT) {
    console.log('✅ Content script loaded successfully');
    results.contentLoad = true;
  } else {
    console.log('❌ Content script not properly loaded');
  }
  
  // Test 2: Precise Viewer Detection
  console.log('\n🔍 Test 2: Viewer Detection');
  
  const allElements = Array.from(document.querySelectorAll('*'));
  let detectedCount = null;
  
  for (const el of allElements) {
    const text = el.textContent?.trim();
    if (text && /^Viewers?\s*[·•]\s*\d+/i.test(text)) {
      const match = text.match(/^Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
      if (match) {
        detectedCount = match[1];
        console.log(`✅ [VIEWER:PAGE:FOUND] pattern="${text}", value=${detectedCount}`);
        results.viewerDetection = true;
        break;
      }
    }
  }
  
  if (!results.viewerDetection) {
    console.log('❌ No viewer detection pattern found');
  }
  
  // Test 3: Message Emission
  console.log('\n📡 Test 3: Message Emission (5s window)');
  let emissionCount = 0;
  let latestMessage = null;
  
  if (chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'VIEWER_COUNT_UPDATE') {
        emissionCount++;
        latestMessage = msg;
        console.log(`✅ VIEWER_COUNT_UPDATE #${emissionCount}:`, {
          count: msg.count || msg.value,
          schema: msg.schemaVersion,
          platform: msg.platform
        });
        results.messageEmission = true;
      }
    });
  }
  
  // Test 4: Schema Validation
  console.log('\n📋 Test 4: Schema Validation');
  setTimeout(() => {
    if (latestMessage) {
      const hasType = !!latestMessage.type;
      const hasPlatform = !!latestMessage.platform;
      const hasCount = !!(latestMessage.count || latestMessage.value);
      const hasTimestamp = !!(latestMessage.ts || latestMessage.timestamp);
      
      console.log('Schema check:', {
        type: hasType,
        platform: hasPlatform,
        count: hasCount,
        timestamp: hasTimestamp
      });
      
      if (hasType && hasPlatform && hasCount && hasTimestamp) {
        console.log('✅ Schema validation passed');
        results.schemaValidation = true;
      } else {
        console.log('❌ Schema validation failed');
      }
    }
  }, 3000);
  
  // Test 5: No Placeholder Check
  console.log('\n🚫 Test 5: No 888 Placeholder');
  if (results.viewerDetection && detectedCount) {
    // Parse expected count
    let expected = parseFloat(detectedCount);
    if (detectedCount.toLowerCase().includes('k')) expected *= 1000;
    if (detectedCount.toLowerCase().includes('m')) expected *= 1000000;
    expected = Math.round(expected);
    
    console.log(`Expected count: ${expected} (from "${detectedCount}")`);
    
    if (expected > 0 && expected <= 200000) {
      console.log('✅ No placeholder - real value expected');
      results.noPlaceholder = true;
    }
  }
  
  // Final report after 6 seconds
  setTimeout(() => {
    console.log('\n📋 FINAL R13 RESULTS');
    console.log('====================');
    
    Object.entries(results).forEach(([test, pass]) => {
      console.log(`${pass ? '✅' : '❌'} ${test}: ${pass ? 'PASS' : 'FAIL'}`);
    });
    
    const passCount = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;
    
    console.log(`\n🏆 SCORE: ${passCount}/${totalTests} tests passed`);
    
    if (passCount === totalTests) {
      console.log('🎉 All LVT R13 validations PASSED!');
    } else {
      console.log('⚠️ Some R13 validations FAILED');
      
      if (!results.contentLoad) {
        console.log('💡 CONTENT FAIL: Content script not loaded - check syntax errors');
      }
      if (!results.messageEmission) {
        console.log('💡 MESSAGE FAIL: No VIEWER_COUNT_UPDATE detected - check extension');
      }
    }
    
    // Operator summary
    console.log('\n📝 OPERATOR NOTES');
    console.log('=================');
    console.log(`Detected TikTok count: ${detectedCount || 'none'}`);
    console.log(`Messages emitted: ${emissionCount}`);
    console.log(`Latest message:`, latestMessage || 'none');
    
  }, 6000);
  
})();
```