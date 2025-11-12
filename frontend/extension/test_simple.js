// ULTRA SIMPLE TEST - No IIFE, no complexity
console.log('🟢 SIMPLE SCRIPT LOADED');
console.log('URL:', window.location.href);

window.__SPIKELY_SIMPLE__ = function() {
  console.log('🧪 SIMPLE TEST EXECUTED');
  
  // Find viewer count the hard way
  const text = document.body.textContent || '';
  const match = text.match(/Viewers?\s*[•·:]\s*([\d,]+(?:\.\d+)?[KkMm]?)/i);
  
  if (match) {
    console.log('✅ Found viewer text:', match[1]);
    return match[1];
  } else {
    console.log('❌ No viewer text found');
    return null;
  }
};

console.log('✅ SIMPLE SCRIPT READY - Test with: window.__SPIKELY_SIMPLE__()');