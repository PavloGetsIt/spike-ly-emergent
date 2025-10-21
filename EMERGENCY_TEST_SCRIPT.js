// Emergency Simplified Test Script
// Add this to the TOP of sidepanel.html, right after <body> tag
// This will help diagnose if ANY JavaScript is running

console.log('=== EMERGENCY TEST SCRIPT LOADED ===');
console.log('Timestamp:', new Date().toISOString());

// Test 1: Immediate alert (very obvious)
alert('SIDEPANEL SCRIPT IS LOADING - If you see this, JavaScript works!');

// Test 2: Check DOM
console.log('Document ready state:', document.readyState);
console.log('Scripts in document:', document.scripts.length);

// Test 3: Try to find elements
setTimeout(() => {
  console.log('=== 1 SECOND LATER ===');
  const audioBtn = document.getElementById('startAudioBtn');
  console.log('Audio button found:', !!audioBtn);
  
  if (audioBtn) {
    console.log('Button text:', audioBtn.querySelector('.btn-text')?.textContent);
    
    // Force set correct state
    const btnText = audioBtn.querySelector('.btn-text');
    const btnIcon = audioBtn.querySelector('.btn-icon');
    const statusLabel = document.getElementById('audioStatusLabel');
    const statusDot = document.getElementById('audioStatusDot');
    
    if (btnText) btnText.textContent = 'Start Audio';
    if (btnIcon) btnIcon.textContent = '🎤';
    if (statusLabel) statusLabel.textContent = 'Audio: Stopped';
    if (statusDot) statusDot.style.background = '#6b7280';
    
    audioBtn.style.background = 'rgba(16, 185, 129, 0.15)';
    audioBtn.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    audioBtn.style.color = '#10b981';
    
    console.log('✅ FORCED AUDIO BUTTON TO CORRECT STATE');
  }
  
  // Test tooltips
  const viewerDelta = document.getElementById('viewerDelta');
  if (viewerDelta) {
    viewerDelta.title = 'TEST TOOLTIP - Viewer change in last 5 seconds';
    console.log('✅ SET TEST TOOLTIP ON VIEWER DELTA');
  }
  
}, 1000);

console.log('=== EMERGENCY TEST SCRIPT END ===');
