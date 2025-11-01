// SPIKELY PAGE SCRIPT - Real button with proper MV3 message flow
console.log('🟡 [SPIKELY-PAGE] Audio capture script loaded');

let audioButton = null;
let mountRetries = 0;
const MAX_MOUNT_RETRIES = 10;

// Listen for button state updates from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_BUTTON_STATE') {
    console.log('🔘 [SPIKELY-PAGE] Button state update:', message.state);
    
    if (audioButton) {
      if (message.state === 'success') {
        audioButton.textContent = '✅ Success!';
        audioButton.style.background = 'linear-gradient(135deg, #44ff44, #66ff66)';
        setTimeout(() => {
          audioButton.style.display = 'none';
        }, 3000);
      } else if (message.state === 'error') {
        audioButton.textContent = '❌ ' + (message.message || 'Failed');
        audioButton.style.background = '#666';
        setTimeout(() => {
          audioButton.textContent = '🎤 Try Again';
          audioButton.disabled = false;
          audioButton.style.background = 'linear-gradient(135deg, #ff4444, #ff6666)';
        }, 3000);
      }
    }
    
    sendResponse({ success: true });
  }
});

// Create visible button with exponential retry
function createAudioCaptureButton() {
  // Check if TikTok DOM is fully loaded
  if (!document.body || document.readyState === 'loading') {
    const delay = Math.min(1000 * Math.pow(1.5, mountRetries), 5000); // Exponential backoff, max 5s
    mountRetries++;
    
    if (mountRetries <= MAX_MOUNT_RETRIES) {
      console.log(`🔄 [SPIKELY-PAGE] DOM not ready, retry ${mountRetries}/${MAX_MOUNT_RETRIES} in ${delay}ms`);
      setTimeout(createAudioCaptureButton, delay);
      return;
    } else {
      console.error('❌ [SPIKELY-PAGE] Failed to mount button after', MAX_MOUNT_RETRIES, 'retries');
      return;
    }
  }
  
  // Remove existing button if any
  const existing = document.getElementById('__SPIKELY_CAPTURE_BTN__');
  if (existing) existing.remove();
  
  console.log('🔴 [SPIKELY-PAGE] Creating audio capture button...');
  
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
    font-family: system-ui, -apple-system, sans-serif;
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
  
  // CRITICAL: Real click handler - only sends message, background handles tabCapture
  btn.addEventListener('click', function() {
    console.log('🔴 [SPIKELY-PAGE] USER CLICKED AUDIO BUTTON');
    btn.textContent = '🎤 Processing...';
    btn.disabled = true;
    
    // Send message to content script → background (proper MV3 flow)
    try {
      chrome.runtime.sendMessage({
        type: 'USER_CLICKED_RED_BUTTON',
        timestamp: Date.now(),
        url: window.location.href
      });
      console.log('🔴 [SPIKELY-PAGE] ✅ Message sent to extension');
    } catch (e) {
      console.error('🔴 [SPIKELY-PAGE] ❌ Failed to send message:', e);
      btn.textContent = '❌ Error';
      btn.style.background = '#666';
    }
  });
  
  document.body.appendChild(btn);
  audioButton = btn;
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