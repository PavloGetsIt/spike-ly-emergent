// Grant activeTab permission notice
const permissionNotice = document.getElementById('permission-notice');
const permissionText = document.getElementById('permission-text');

// Check if we're on a livestream tab
async function checkLivestreamTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return false;
  
  const url = tab.url || '';
  const isLivestream = url.includes('tiktok.com') || 
                       url.includes('twitch.tv') || 
                       url.includes('kick.com') || 
                       url.includes('youtube.com');
  
  if (isLivestream && permissionNotice) {
    permissionNotice.style.display = 'block';
    permissionText.textContent = `✓ Permission granted for this tab. Click "Open Side Panel" to start tracking.`;
  } else if (permissionNotice) {
    permissionNotice.style.display = 'block';
    permissionNotice.style.background = '#3b3320';
    permissionNotice.style.borderColor = '#f59e0b';
    permissionText.innerHTML = '<strong>⚠️ Not a livestream tab</strong>Navigate to TikTok Live, Twitch, Kick, or YouTube Live first.';
  }
  
  return isLivestream;
}

// Update status display
async function updateStatus() {
  // Check connection to background script
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' });
    
    const connectionText = document.getElementById('connection-text');
    if (response?.connected) {
      connectionText.textContent = '✅ Connected';
      connectionText.style.color = '#10b981';
    } else {
      connectionText.textContent = '❌ Offline';
      connectionText.style.color = '#ef4444';
    }
  } catch (error) {
    console.error('Failed to get status:', error);
    const connectionText = document.getElementById('connection-text');
    connectionText.textContent = '❌ Error';
    connectionText.style.color = '#ef4444';
  }
  
  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (tab) {
    try {
      const tabStatus = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATUS' });
      
      document.getElementById('platform-text').textContent = 
        tabStatus?.platform || 'Not detected';
      
      document.getElementById('viewer-text').textContent = 
        tabStatus?.currentCount > 0 ? tabStatus.currentCount.toLocaleString() : '-';
    } catch (error) {
      document.getElementById('platform-text').textContent = 'Not detected';
      document.getElementById('viewer-text').textContent = '-';
    }
  }
}

// Wire up Open Side Panel button
const openBtn = document.getElementById('open-sidepanel-btn');
if (openBtn) {
  openBtn.addEventListener('click', async () => {
    try {
      const isLivestream = await checkLivestreamTab();
      
      if (!isLivestream) {
        alert('Please navigate to a livestream page (TikTok Live, Twitch, Kick, or YouTube Live) first.');
        return;
      }
      
      // Notify background that we're granting activeTab permission from popup
      await chrome.runtime.sendMessage({ 
        type: 'POPUP_ACTIVATED',
        timestamp: Date.now()
      });
      
      // Ask background to open side panel for active tab
      const response = await chrome.runtime.sendMessage({ 
        type: 'OPEN_SIDE_PANEL', 
        userGesture: true,
        fromPopup: true
      });
      
      if (response?.success) {
        window.close();
      } else {
        console.error('Failed to open side panel:', response?.error);
        alert('Failed to open side panel. Please try again.');
      }
    } catch (e) {
      console.error('Failed to open side panel:', e);
      alert(`Error: ${e.message}`);
    }
  });
}

// Initialize
checkLivestreamTab();
updateStatus();
setInterval(updateStatus, 2000);
