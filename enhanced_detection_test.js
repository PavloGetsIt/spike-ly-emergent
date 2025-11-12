// ENHANCED VIEWER DETECTION VALIDATION TEST  
// Run this in TikTok Live console to test visibility validation and MutationObserver binding

(function() {
  console.log('🎯 ENHANCED VIEWER DETECTION TEST');
  console.log('=====================================');
  
  // Test visibility validation function
  function testIsValidVisibleNode(element) {
    if (!element) return { valid: false, reason: 'null element' };
    
    if (!element.isConnected) return { valid: false, reason: 'not connected' };
    if (element.getAttribute('aria-hidden') === 'true') return { valid: false, reason: 'aria-hidden' };
    
    if (element.offsetParent === null) {
      const style = window.getComputedStyle(element);
      if (style.position !== 'fixed' && style.display === 'none') {
        return { valid: false, reason: 'display none' };
      }
    }
    
    const style = window.getComputedStyle(element);
    if (parseFloat(style.opacity) === 0) return { valid: false, reason: 'opacity 0' };
    
    return { valid: true, reason: 'visible' };
  }
  
  console.log('\n🔍 Step 1: Find all potential viewer elements...');
  
  // Get all elements that might contain viewer counts
  const potentialElements = [];
  document.querySelectorAll('span, div, strong').forEach(el => {
    const text = el.textContent?.trim();
    if (text && /^[0-9,]+(?:\.[0-9]+)?[KkMm]?$/.test(text)) {
      const validation = testIsValidVisibleNode(el);
      potentialElements.push({
        text,
        element: el,
        validation,
        rect: el.getBoundingClientRect()
      });
    }
  });
  
  console.log(`Found ${potentialElements.length} numeric elements total`);
  
  // Filter for valid visible nodes
  const visibleElements = potentialElements.filter(item => item.validation.valid);
  console.log(`${visibleElements.length} are valid and visible:`);
  
  visibleElements.forEach((item, i) => {
    console.log(`   ${i+1}. "${item.text}" (${item.validation.reason}) - Rect: ${Math.round(item.rect.width)}x${Math.round(item.rect.height)}`);
  });
  
  console.log('\n👁️ Step 2: Test TikTok viewer detection with validation...');
  
  // Look for "Viewers · X" pattern specifically
  let tiktokViewerCount = null;
  document.querySelectorAll('*').forEach(el => {
    const text = el.textContent?.trim();
    if (text && /viewers?\s*[·•]\s*\d+/i.test(text)) {
      console.log(`🎯 Found "Viewers" pattern: "${text}"`);
      
      // Extract the number
      const match = text.match(/viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
      if (match) {
        const countText = match[1];
        console.log(`   Extracted: "${countText}"`);
        
        // Validate this element
        const validation = testIsValidVisibleNode(el);
        console.log(`   Validation: ${validation.valid} (${validation.reason})`);
        
        if (validation.valid) {
          tiktokViewerCount = countText;
        }
      }
    }
  });
  
  console.log('\n🧪 Step 3: Test MutationObserver binding...');
  
  if (visibleElements.length > 0) {
    const testElement = visibleElements[0].element;
    console.log(`Testing MutationObserver on: "${testElement.textContent}"`);
    
    try {
      let changeCount = 0;
      const testObserver = new MutationObserver((mutations) => {
        changeCount++;
        console.log(`   Mutation #${changeCount}: ${mutations.length} changes detected`);
        
        // Test the validation again on mutation
        const currentValidation = testIsValidVisibleNode(testElement);
        console.log(`   Current validation: ${currentValidation.valid} (${currentValidation.reason})`);
      });
      
      testObserver.observe(testElement, {
        childList: true,
        characterData: true,
        subtree: false
      });
      
      console.log('✅ MutationObserver successfully bound');
      
      // Test for 3 seconds then disconnect
      setTimeout(() => {
        testObserver.disconnect();
        console.log(`✅ Test complete: ${changeCount} mutations observed in 3 seconds`);
      }, 3000);
      
    } catch (e) {
      console.log('❌ MutationObserver binding failed:', e.message);
    }
  }
  
  console.log('\n📊 Step 4: Final Results...');
  console.log('=====================================');
  
  if (tiktokViewerCount) {
    console.log(`✅ TikTok viewer count detected: ${tiktokViewerCount}`);
  } else {
    console.log('❌ TikTok viewer count not detected');
  }
  
  console.log(`✅ Valid visible elements: ${visibleElements.length}`);
  console.log(`✅ Total numeric elements: ${potentialElements.length}`);
  
  if (visibleElements.length > 0) {
    const largest = visibleElements.reduce((max, item) => {
      const num = parseFloat(item.text.replace(/[KkMm]/i, ''));
      const maxNum = parseFloat(max.text.replace(/[KkMm]/i, ''));
      return num > maxNum ? item : max;
    });
    console.log(`🏆 Largest valid number: "${largest.text}" (likely the viewer count)`);
  }
  
  console.log('\n💡 Recommendations:');
  console.log('1. Monitor for "[VIEWER:PAGE] value=X" logs after detection');
  console.log('2. Check if detected values match TikTok display');
  console.log('3. Verify MutationObserver binds successfully');
  console.log('4. Test during viewer count changes (people joining/leaving)');
  
})();