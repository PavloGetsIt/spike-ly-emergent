// Audio capture and processing for browser extension
// Captures tab audio and streams to Deepgram Speech API

class AudioCaptureManager {
  constructor() {
    this.isCapturing = false;
    this.currentStreamId = null;
  }

  // Start capturing audio from tab
  async startCapture(tabId) {
    console.log('[Audio Capture] Starting capture for tab', tabId);
    
    try {
      // Step 1: Validate tab exists and is accessible
      let tab;
      try {
        tab = await chrome.tabs.get(tabId);
        console.log('[Audio Capture] ✅ Tab accessible:', tab.url);
      } catch (tabErr) {
        console.error('[Audio Capture] ❌ Tab not accessible:', tabErr);
        throw new Error('Tab not found or not accessible. Please open the side panel from the livestream tab.');
      }

      // Step 2: Get the offscreen document or create it
      // Manifest V3 requires audio capture to happen in an offscreen document
      const existingContexts = await chrome.runtime.getContexts({});
      const offscreenDocument = existingContexts.find(
        c => c.contextType === 'OFFSCREEN_DOCUMENT'
      );
      
      if (!offscreenDocument) {
        console.log('[Audio Capture] Creating offscreen document...');
        await chrome.offscreen.createDocument({
          url: chrome.runtime.getURL('offscreen.html'),
          reasons: ['USER_MEDIA'],
          justification: 'Audio capture for transcription'
        });
        console.log('[Audio Capture] ✅ Offscreen document created');
      } else {
        console.log('[Audio Capture] Offscreen document already exists');
      }

      // Step 3: Verify activeTab permission by probing script injection (does NOT grant perms)
      try {
        await chrome.scripting.executeScript({ target: { tabId }, func: () => true });
        console.log('[Audio Capture] ✅ Permission probe succeeded for tab', tabId);
      } catch (permErr) {
        console.warn('[Audio Capture] Permission probe failed:', permErr);
        throw new Error('Extension has not been invoked for the current page (see activeTab permission). Chrome pages cannot be captured. Open Side Panel from the livestream tab, then click Start Audio.');
      }

      // Step 4: Request stream ID from background context (chrome.tabCapture only available here)
      // NOTE: This requires activeTab permission, which is granted when user opens extension on the tab
      console.log('[Audio Capture] Requesting media stream ID for tab:', tabId);
      
      let streamId;
      try {
        streamId = await chrome.tabCapture.getMediaStreamId({
          targetTabId: tabId
        });
        console.log('[Audio Capture] ✅ Got stream ID:', streamId);
      } catch (err) {
        console.error('[Audio Capture] ❌ getMediaStreamId failed:', err);
        
        // Provide specific error message
        if (err.message.includes('not found') || err.message.includes('invalid')) {
          throw new Error(`Tab not found. Please ensure the livestream tab is still open.`);
        } else if (err.message.includes('permission')) {
          throw new Error(`Permission denied. Please click the Spikely icon on the livestream tab to grant access.`);
        } else {
          throw new Error(`Failed to capture audio. Make sure the livestream has audio playing and try again.`);
        }
      }

      // Step 4: Send stream ID to offscreen document to start capture (with retry to avoid race)
      const sendWithRetry = async (attempts = 8, delayMs = 150) => {
        for (let i = 0; i < attempts; i++) {
          try {
            const res = await chrome.runtime.sendMessage({
              type: 'START_OFFSCREEN_CAPTURE',
              streamId
            });
            if (res?.success) return res;
            if (res && res.success === false && res.error) throw new Error(res.error);
          } catch (e) {
            // Offscreen may not be ready yet
            const msg = String(e?.message || e);
            if (msg.includes('Receiving end does not exist') || msg.includes('Could not establish connection')) {
              await new Promise(r => setTimeout(r, delayMs));
              continue;
            }
            throw e;
          }
          await new Promise(r => setTimeout(r, delayMs));
        }
        throw new Error('Offscreen not ready. Please try again.');
      };

      const response = await sendWithRetry();

      if (!response?.success) {
        throw new Error(response?.error || 'Offscreen capture failed');
      }

      this.isCapturing = true;
      this.currentStreamId = streamId;
      console.log('[Audio Capture] ✅ Audio capture started via offscreen document');

      return { success: true, streamId };
    } catch (error) {
      console.error('[Audio Capture] ❌ Failed to start capture:', error);
      this.stopCapture();
      this.currentStreamId = null;
      return { success: false, error: error.message };
    }
  }

  // Stop capturing audio
  stopCapture() {
    console.log('[Audio Capture] Stopping capture');

    this.isCapturing = false;
    this.currentStreamId = null;

    // Tell offscreen document to stop
    chrome.runtime.sendMessage({
      type: 'STOP_OFFSCREEN_CAPTURE'
    }, () => { void chrome.runtime.lastError; });

    console.log('[Audio Capture] ✅ Capture stopped');
  }

  getStatus() {
    return {
      isCapturing: this.isCapturing
    };
  }
}

// Export singleton instance
export const audioCaptureManager = new AudioCaptureManager();
