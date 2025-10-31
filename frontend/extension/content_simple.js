// ULTRA SIMPLE CONTENT SCRIPT TEST - v1.0
console.log('🚀🚀🚀 SIMPLE CONTENT SCRIPT LOADING 🚀🚀🚀');
console.log('URL:', window.location.href);
console.log('Platform:', window.location.hostname.includes('tiktok') ? 'tiktok' : 'other');

// Set a simple flag
window.__SPIKELY_CONTENT_ACTIVE__ = true;
console.log('✅ Flag set successfully');

// Create simple test function
window.__SPIKELY_SIMPLE_TEST__ = function() {
  console.log('🧪 SIMPLE TEST EXECUTED!');
  console.log('Date:', new Date().toISOString());
  return 'SUCCESS';
};

console.log('🎉🎉🎉 SIMPLE CONTENT SCRIPT COMPLETE 🎉🎉🎉');