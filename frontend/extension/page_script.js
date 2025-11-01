// SPIKELY PAGE SCRIPT - Real button with tabCapture in page context
console.log('🟡 [SPIKELY-PAGE] Audio capture script loaded');

// Create visible button for user to click
function createAudioCaptureButton() {
  // Remove existing button if any
  const existing = document.getElementById('__SPIKELY_CAPTURE_BTN__');
  if (existing) existing.remove();
  
  // Create styled button
  const btn = document.createElement('button');
  btn.id = '__SPIKELY_CAPTURE_BTN__';
  btn.innerHTML = '🎤 Start Spikely Audio';
  btn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 999999;
    padding: 12px 20px;
    background: linear-gradient(135deg, #ff4444, #ff6666);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(255,68,68,0.3);
    transition: all 0.2s;
  `;
  
  // Hover effect
  btn.addEventListener('mouseenter', () => {
    btn.style.transform = 'scale(1.05)';
    btn.style.boxShadow = '0 6px 20px rgba(255,68,68,0.4)';
  });
  
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = 'scale(1)';
    btn.style.boxShadow = '0 4px 12px rgba(255,68,68,0.3)';
  });
  
  // CRITICAL: Real click handler - no async boundaries
  btn.addEventListener('click', function() {
    console.log('🔴 [SPIKELY-PAGE] USER CLICKED AUDIO BUTTON - Starting tabCapture...');
    btn.textContent = '🎤 Capturing...';
    btn.disabled = true;
    
    // Call tabCapture.capture IMMEDIATELY - no async/await
    chrome.tabCapture.capture({
      audio: true,
      video: false
    }, function(stream) {
      if (chrome.runtime.lastError) {
        console.error('🔴 [SPIKELY-PAGE] ❌ TabCapture failed:', chrome.runtime.lastError.message);
        btn.textContent = '❌ Failed';
        btn.style.background = '#666';
        
        // Send error to extension
        try {
          chrome.runtime.sendMessage({
            type: 'AUDIO_CAPTURE_RESULT',
            success: false,
            error: chrome.runtime.lastError.message
          });
        } catch (e) {
          console.error('🔴 [SPIKELY-PAGE] Failed to send error message:', e);
        }
        
        setTimeout(() => {
          btn.textContent = '🎤 Try Again';
          btn.disabled = false;
          btn.style.background = 'linear-gradient(135deg, #ff4444, #ff6666)';
        }, 3000);
        
      } else if (!stream || stream.getAudioTracks().length === 0) {
        console.error('🔴 [SPIKELY-PAGE] ❌ No audio tracks captured');
        btn.textContent = '❌ No Audio';
        btn.style.background = '#666';
        
        try {
          chrome.runtime.sendMessage({
            type: 'AUDIO_CAPTURE_RESULT',
            success: false,
            error: 'No audio tracks captured from tab'
          });
        } catch (e) {
          console.error('🔴 [SPIKELY-PAGE] Failed to send error message:', e);
        }
        
        setTimeout(() => {
          btn.textContent = '🎤 Try Again';
          btn.disabled = false;
          btn.style.background = 'linear-gradient(135deg, #ff4444, #ff6666)';
        }, 3000);
        
      } else {
        console.log('🔴 [SPIKELY-PAGE] ✅ Audio capture SUCCESS!', stream.getAudioTracks().length, 'tracks');
        btn.textContent = '✅ Success!';
        btn.style.background = 'linear-gradient(135deg, #44ff44, #66ff66)';
        
        // Send success to extension
        try {
          chrome.runtime.sendMessage({
            type: 'AUDIO_CAPTURE_RESULT',
            success: true,
            streamId: stream.id,
            trackCount: stream.getAudioTracks().length
          });
        } catch (e) {
          console.error('🔴 [SPIKELY-PAGE] Failed to send success message:', e);
        }
        
        // Hide button after success
        setTimeout(() => {
          btn.style.display = 'none';
        }, 2000);
      }
    });
  });
  
  document.body.appendChild(btn);
  console.log('🔴 [SPIKELY-PAGE] ✅ Audio capture button created and visible');
  
  return btn;
}

// Create button when script loads
window.__SPIKELY_CREATE_AUDIO_BUTTON__ = createAudioCaptureButton;

// Auto-create if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createAudioCaptureButton);
} else {
  createAudioCaptureButton();
}