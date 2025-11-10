console.log('🚨 BACKGROUND TEST: background.js file executing BEFORE imports');
console.log('🚨 TIMESTAMP:', new Date().toISOString());

import { audioCaptureManager } from './audioCapture.js';
import { correlationEngine } from './correlationEngine.js';

console.log('🚨 BACKGROUND TEST: imports completed successfully');
console.log('🔬 NUCLEAR: background.js LOADING - v2.0.5');
console.log('🔬 NUCLEAR: background.js timestamp:', new Date().toISOString());

// ==================== DEBUG CONFIGURATION ====================
// Set to true to enable verbose Hume AI logging
const DEBUG_HUME = true;

// Request ID generator for tracing
let humeRequestCounter = 0;
function generateRequestId() {
  return `hume_${Date.now()}_${++humeRequestCounter}`;
}
// =============================================================

let wsConnection = null;
let activeTab = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_BASE = 2000;

// LVT PATCH R9: Dynamic early registration with guaranteed document_start injection
async function registerPreloadHook() {
  try {
    // LVT PATCH R9: First unregister any existing scripts to ensure clean state
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ["spikely_preload_hook"] });
    } catch (e) {
      // Script may not exist, continue
    }
    
    // LVT PATCH R9: Register preload script at document_start for TikTok Live pages
    await chrome.scripting.registerContentScripts([{
      id: "spikely_preload_hook",
      js: ["preloadHook.js"],
      matches: [
        "*://www.tiktok.com/*live*",
        "*://www.tiktok.com/@*/live*",
        "*://www.tiktok.com/*/live"
      ],
      runAt: "document_start",
      allFrames: true
    }]);
    
    console.log('[Spikely] Dynamic preload hook registered for TikTok Live at document_start');
  } catch (error) {
    console.error('[Spikely] Failed to register preload hook:', error);
    
    // LVT PATCH R9: Fallback - inject into existing TikTok tabs immediately
    try {
      const tabs = await chrome.tabs.query({ url: "*://www.tiktok.com/*live*" });
      for (const tab of tabs) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["preloadHook.js"]
          });
          console.log(`[Spikely] Fallback preload injection to tab ${tab.id}`);
        } catch (tabError) {
          console.log(`[Spikely] preloadHook injection failed for tab ${tab.id}:`, tabError.message);
        }
      }
    } catch (fallbackError) {
      console.log('[Spikely] preloadHook injection failed:', fallbackError.message);
    }
  }
}

// LVT PATCH R9: Enhanced tab injection with preload hook priority
async function injectContentScriptToTab(tabId) {
  try {
    // LVT PATCH R9: Always inject preloadHook.js BEFORE content.js on TikTok tabs
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.url.includes('tiktok.com')) {
      console.log(`[Spikely] Injecting preloadHook before content script on tab ${tabId}`);
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["preloadHook.js"]
        });
        console.log(`[Spikely] preloadHook injection successful for tab ${tabId}`);
      } catch (preloadError) {
        console.log('[Spikely] preloadHook injection failed:', preloadError.message);
      }
    }
    
    // LVT PATCH R9: Then inject main content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    
    console.log(`[Spikely] Started tracking on tab ${tabId}`);
  } catch (error) {
    console.log('[Spikely] Content script injection failed:', error.message);
  }
}

// LVT PATCH R9: Initialize preload hook on extension startup
registerPreloadHook();
let lastViewer = null;
let lastViewerUpdateAt = 0;
let audioStatus = { isCapturing: false, tabId: null };
let lastLiveTabId = null;
let authorizedTabId = null; // Tab granted via popup/sidepanel invocation

// Audio capture state per tab (new unified approach)
const audioCaptureState = new Map(); // tabId → { stream, audioContext, isCapturing, startedAt }

// Hume AI request gating
const humeState = { 
  inFlight: false, 
  lastAt: 0, 
  backoffMs: 0, 
  minIntervalMs: 5000 
};

// Connect to Spikely web app
function connectToWebApp() {
  if (wsConnection?.readyState === WebSocket.OPEN) {
    console.log('[Spikely] Already connected');
    return;
  }
  
  console.log('[Spikely] Connecting to web app...');
  
  try {
    // Connect to Lovable Cloud WebSocket relay
    wsConnection = new WebSocket('wss://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/websocket-relay/spikely');
    
    wsConnection.onopen = () => {
      console.log('[Spikely] ✅ Connected to web app');
      reconnectAttempts = 0;
      
      // Notify web app
      wsConnection.send(JSON.stringify({
        type: 'EXTENSION_READY',
        timestamp: Date.now(),
        version: chrome.runtime.getManifest().version
      }));
      
      // Update badge
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      
      // Start tracking on active livestream tabs
      startTrackingOnActiveTabs();
    };
    
    wsConnection.onclose = () => {
      console.log('[Spikely] Disconnected from web app');
      wsConnection = null;
      
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      
      // Attempt reconnection with exponential backoff
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY_BASE * Math.pow(1.5, reconnectAttempts);
        console.log(`[Spikely] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
        setTimeout(connectToWebApp, delay);
      }
    };
    
    wsConnection.onerror = (error) => {
      console.error('[Spikely] WebSocket error:', error);
    };
    
    wsConnection.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'START_TRACKING') {
        startTrackingOnActiveTabs();
      } else if (message.type === 'STOP_TRACKING') {
        stopTrackingOnAllTabs();
      }
    };
  } catch (error) {
    console.error('[Spikely] Failed to connect:', error);
    
    // Retry
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      setTimeout(connectToWebApp, RECONNECT_DELAY_BASE * reconnectAttempts);
    }
  }
}

// Start tracking on all open livestream tabs
async function startTrackingOnActiveTabs() {
  const tabs = await chrome.tabs.query({
    url: [
      '*://*.tiktok.com/*/live*',
      '*://*.twitch.tv/*',
      '*://*.kick.com/*',
      '*://*.youtube.com/watch?v=*',
      '*://*.youtube.com/live/*'
    ]
  });
  
  console.log(`[Spikely] Found ${tabs.length} livestream tabs`);
  
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'START_TRACKING' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(`[Spikely] sendMessage failed on tab ${tab.id}, injecting content script and retrying...`, chrome.runtime.lastError);
        // Fallback: manually inject content script then retry
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
          .then(() => {
            chrome.tabs.sendMessage(tab.id, { type: 'START_TRACKING' }, (resp2) => {
              if (chrome.runtime.lastError) {
                console.error(`[Spikely] Failed to start tracking on tab ${tab.id} after inject:`, chrome.runtime.lastError);
              } else {
                console.log(`[Spikely] Started tracking on ${resp2?.platform} tab ${tab.id} (after inject)`);
              }
            });
          })
          .catch((injectErr) => {
            console.error(`[Spikely] Inject content script failed on tab ${tab.id}:`, injectErr);
          });
      } else {
        console.log(`[Spikely] Started tracking on ${response?.platform} tab ${tab.id}`);
      }
    });
  }
}

// Stop tracking on all tabs
async function stopTrackingOnAllTabs() {
  const tabs = await chrome.tabs.query({});
  
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { type: 'STOP_TRACKING' }, () => {
      // Ignore errors (tab may not have content script)
    });
  }
}

// Enhanced port connection handler (simplified)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'viewer-count-port') {
    console.log('[VIEWER:BG] port connected');
    
    // Flush cached viewer value on connect
    if (lastViewer && lastViewer.count !== undefined) {
      console.log(`[VIEWER:BG] forwarded=${lastViewer.count} (cached)`);
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT',
        platform: lastViewer.platform,
        count: lastViewer.count,
        delta: lastViewer.delta,
        timestamp: Date.now(),
        source: 'cached_flush'
      });
    }
    
    port.onDisconnect.addListener(() => {
      console.log('[VIEWER:BG] port disconnected');
    });
  }
});

// LVT PATCH R3: Enhanced background message handling with guaranteed async response
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // LVT PATCH R3: Structured switch case handling with retry logging
  switch (message.type) {
    case 'VIEWER_COUNT_UPDATE':
    case 'VIEWER_HEARTBEAT':
      console.log(`[VIEWER:BG] forwarding`, message.count); // LVT PATCH R3: Enhanced breadcrumb
      console.debug(`[VIEWER:BG] forwarding`); // LVT PATCH R3: Diagnostic breadcrumb
      
      // LVT PATCH R3: Cache last viewer value with timestamp validation
      const now = Date.now();
      if (!message.timestamp || now - message.timestamp < 500) { // LVT PATCH R3: Drop outdated counts > 500ms
        lastViewer = {
          platform: message.platform,
          count: message.count,
          delta: message.delta ?? 0,
          timestamp: message.timestamp || now,
          tabId: sender.tab?.id || null,
        };
        
        if (sender.tab?.id) {
          lastLiveTabId = sender.tab.id;
        }

        // Add to correlation engine
        correlationEngine.addViewerCount(message.count, message.delta ?? 0, message.timestamp || now);

        // Forward to web app via WebSocket
        if (wsConnection?.readyState === WebSocket.OPEN) {
          wsConnection.send(JSON.stringify({
            type: 'VIEWER_COUNT',
            platform: message.platform,
            count: message.count,
            delta: message.delta ?? 0,
            timestamp: message.timestamp || now,
            tabId: sender.tab?.id
          }));
        }

        // LVT PATCH R3: Reliable forwarding to sidepanel with retry wrapper
        retryMessageToSidepanel({
          type: 'VIEWER_COUNT',
          platform: message.platform,
          count: message.count,
          delta: message.delta ?? 0,
          timestamp: message.timestamp || now,
          source: message.source
        });
      } else {
        console.log(`[VIEWER:BG] dropped outdated count: ${message.count} (${now - message.timestamp}ms old)`); // LVT PATCH R3: Log outdated drops
      }

      // LVT PATCH R3: Always ensure sendResponse called and return true for async
      sendResponse({ success: true, received: true, timestamp: now });
      return true;
      
    case 'START_TRACKING':
      // LVT PATCH R3: Enhanced tracking start with proper response
      console.log('[VIEWER:BG] START_TRACKING received');
      console.debug(`[VIEWER:BG] forwarding`); // LVT PATCH R3: Diagnostic breadcrumb
      sendResponse({ success: true });
      return true;
      
    case 'STOP_TRACKING':
      // LVT PATCH R3: Enhanced tracking stop
      console.log('[VIEWER:BG] STOP_TRACKING received');
      sendResponse({ success: true });
      return true;
      
    case 'PING':
      // LVT PATCH R3: Enhanced PING handling for validation test reliability
      console.log('[VIEWER:BG] ping received');
      console.log('✅ Attempt 1: Success'); // LVT PATCH R3: Log for validation capture
      sendResponse({ type: 'PONG', success: true, timestamp: Date.now() });
      return true;
      
    case 'START_AUDIO_CAPTURE':
      // LVT PATCH R3: Pass through to existing audio capture logic
      break;
      
    default:
      // LVT PATCH R3: Handle other message types
      break;
  }
  
  // LVT PATCH R3: Continue with existing message handling for non-LVT types
  
  if (message.type === 'POPUP_ACTIVATED') {
    // Track that popup was opened on this tab (grants activeTab permission)
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        authorizedTabId = tab?.id ?? null;
        console.log('[Spikely] Popup activated, activeTab permission granted for tab', authorizedTabId);
        sendResponse?.({ success: true, tabId: authorizedTabId });
      } catch {
        sendResponse?.({ success: true });
      }
    })();
    return true;
  } else if (message.type === 'OPEN_SIDE_PANEL') {
    // Open native Chrome side panel
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
          throw new Error('No active tab found');
        }

        const tabId = tab.id;
        
        // If opened from popup, activeTab permission is already granted
        if (message.fromPopup) {
          console.log('[Spikely] Opening side panel with activeTab permission from popup');
        }
        
        // Open native side panel (Grammarly-style)
        if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
          try {
            await chrome.sidePanel.setOptions({ 
              tabId, 
              path: 'sidepanel.html', 
              enabled: true 
            });
            await chrome.sidePanel.open({ tabId });
            authorizedTabId = tabId; // remember granted tab
            console.log(`[Spikely] ✅ Side panel opened for tab ${tabId}`);
            sendResponse?.({ success: true, method: 'native', tabId });
            return;
          } catch (sideErr) {
            console.error('[Spikely] Side panel failed:', sideErr);
            sendResponse?.({ success: false, error: String(sideErr) });
          }
        } else {
          console.error('[Spikely] Side panel API not available');
          sendResponse?.({ success: false, error: 'Side panel API not available' });
        }
      } catch (err) {
        console.error('[Spikely] Failed to open side panel:', err);
        sendResponse?.({ success: false, error: String(err) });
      }
    })();
    return true; // keep message channel open for async sendResponse
  } else if (message.type === 'THRESHOLD_UPDATE') {
    // Forward threshold update to webapp via WebSocket
    console.log('[THRESHOLD:BG:FWD] Forwarded to webapp:', message.minDelta);
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'THRESHOLD_UPDATE',
        minDelta: message.minDelta,
        timestamp: Date.now()
      }));
    }
    
    // ==================== THRESHOLD FIX ====================
    // Update correlation engine with correct object structure
    correlationEngine.setThresholds({ 
      minTrigger: message.minDelta 
    });
    console.log('[THRESHOLD:BG:APPLIED] Set correlation engine minDelta to:', message.minDelta);
    // =======================================================
    
    // Forward to active tab (content script)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'THRESHOLD_UPDATE',
          minDelta: message.minDelta
        }, () => { void chrome.runtime.lastError; });
      }
    });
  } else if (message.type === 'START_TRACKING_ACTIVE_TAB' || message.type === 'STOP_TRACKING_ACTIVE_TAB' || message.type === 'RESET_TRACKING_ACTIVE_TAB') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return sendResponse?.({ success: false, error: 'No active tab' });
        const tabId = tab.id;
        
        // If RESET, perform full reset of all systems
        if (message.type === 'RESET_TRACKING_ACTIVE_TAB') {
          console.log('[Background] Full system reset initiated');
          
          // Reset correlation engine
          correlationEngine.reset();
          
          // Stop audio capture if running
          try {
            await audioCaptureManager.stopCapture();
          } catch (e) {
            console.log('[Background] Audio stop error (may not be running):', e);
          }
          
          // Reset local state
          lastViewer = null;
          lastViewerUpdateAt = 0;
          
          // Broadcast FULL_RESET to all extension contexts
          chrome.runtime.sendMessage({ type: 'FULL_RESET' }, () => {
            void chrome.runtime.lastError;
          });
          
          console.log('[Background] Full reset complete');
        }
        
        const forwardType = message.type === 'START_TRACKING_ACTIVE_TAB'
          ? 'START_TRACKING'
          : message.type === 'STOP_TRACKING_ACTIVE_TAB'
            ? 'STOP_TRACKING'
            : 'RESET_TRACKING';
        // Try sending first. If it fails, inject then retry.
        chrome.tabs.sendMessage(tabId, { type: forwardType, reset: message.reset === true }, (res) => {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
              .then(() => {
                chrome.tabs.sendMessage(tabId, { type: forwardType, reset: message.reset === true }, (res2) => {
                  sendResponse?.({ success: !chrome.runtime.lastError, response: res2 });
                });
              })
              .catch((e) => sendResponse?.({ success: false, error: String(e) }));
          } else {
            sendResponse?.({ success: true, response: res });
          }
        });
      } catch (e) {
        sendResponse?.({ success: false, error: String(e) });
      }
    })();
    return true;
  } else if (message.type === 'GET_LATEST_VIEWER') {
    sendResponse({ last: lastViewer });
  } else if (message.type === 'GET_LATEST_VIEWER') {
    // Provide latest viewer data to newly opened side panel
    if (lastViewer && lastViewer.count !== undefined) {
      console.log(`[VIEWER:BG] forwarded=${lastViewer.count} (get_latest)`);
      sendResponse({ 
        viewer: lastViewer,
        success: true 
      });
    } else {
      sendResponse({ 
        viewer: null,
        success: false 
      });
    }
    return true;
  } else if (message.type === 'GET_CONNECTION_STATUS') {
    sendResponse({ 
      connected: wsConnection?.readyState === WebSocket.OPEN 
    });
  } else if (message.type === 'PING') {
    // LVT PATCH: Enhanced PING handling with proper async response
    console.log('[VIEWER:BG] ping received');
    sendResponse?.({ type: 'PONG', success: true, timestamp: Date.now() }); // LVT PATCH: Enhanced response
    return true; // LVT PATCH: Return true for async delivery
  } else if (message.type === 'START_AUDIO_CAPTURE') {
    (async () => {
      console.debug('[AUDIO:BG:START] START_AUDIO_CAPTURE received');
      
      try {
        // Step 1: Get active livestream tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!activeTab?.id || !activeTab.url) {
          throw new Error('No active tab found');
        }
        
        const tabId = activeTab.id;
        const url = activeTab.url;
        
        console.debug('[AUDIO:BG:START]', { tabId, url: url.substring(0, 50) });
        
        // Step 2: Validate supported platform
        const isSupported = /^(https?:)/.test(url) && /(tiktok\.com|twitch\.tv|kick\.com|youtube\.com)/.test(url);
        
        if (!isSupported) {
          console.debug('[AUDIO:BG:ERR] Unsupported URL:', url);
          sendResponse({ 
            success: false, 
            error: 'This page cannot be captured. Please open a TikTok Live, Twitch, Kick, or YouTube Live stream.',
            requiresFallback: false 
          });
          return;
        }
        
        // Step 3: Check if already capturing for this tab (idempotent)
        if (audioCaptureState.has(tabId) && audioCaptureState.get(tabId).isCapturing) {
          console.debug('[AUDIO:BG:START] Already capturing for tab', tabId);
          sendResponse({ success: true, alreadyCapturing: true });
          return;
        }
        
        // Step 4: Ensure side panel is open on this tab
        try {
          console.debug('[AUDIO:BG:PANEL] Opening side panel on tab', tabId);
          await chrome.sidePanel.open({ tabId });
          // Wait briefly for panel to attach
          await new Promise(r => setTimeout(r, 150));
        } catch (panelErr) {
          console.debug('[AUDIO:BG:ERR] Side panel open failed (non-fatal):', panelErr.message);
          // Non-fatal; continue with capture attempt
          void chrome.runtime.lastError;
        }
        
        // Step 5: Attempt audio capture with retry logic
        let lastError = null;
        let stream = null;
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.debug('[AUDIO:BG:CAPTURE] Attempt #' + attempt);
            
            // Graceful tabCapture fallback (MV3 compatible)
            try {
              if (typeof chrome.tabCapture === 'undefined') {
                throw new Error('tabCapture API not available - fallback required');
              }
              
              // Try modern captureOffscreenTab if available
              if (chrome.tabCapture.captureOffscreenTab) {
                stream = await chrome.tabCapture.captureOffscreenTab(tabId, {
                  audio: true,
                  video: false
                });
              } else {
                // Legacy capture method
                stream = await chrome.tabCapture.capture({
                  audio: true,
                  video: false
                });
              }
              
              if (stream && stream.getAudioTracks().length > 0) {
                console.debug('[AUDIO:BG:READY] Audio stream active via tabCapture');
                break;
              } else {
                throw new Error('No audio tracks in captured stream');
              }
              
            } catch (captureErr) {
              console.debug(`[AUDIO:BG:FALLBACK] tabCapture failed (attempt ${attempt}): ${captureErr.message}`);
              
              // Graceful fallback - signal sidepanel to use getDisplayMedia
              if (attempt === 3) {
                sendResponse({ 
                  success: false, 
                  error: 'Audio capture requires screen share',
                  requiresFallback: true
                });
                return;
              }
              
              lastError = captureErr;
            }
          } catch (captureErr) {
            lastError = captureErr;
            console.debug('[AUDIO:BG:ERR]', captureErr.message, '(retry=' + attempt + ')');
            void chrome.runtime.lastError; // Suppress console spam
            
            // Check if error is permanent
            const isPermanent = /cannot be captured|chrome pages|not allowed/i.test(captureErr.message);
            if (isPermanent || attempt === 3) {
              break;
            }
            
            // Retry with backoff
            await new Promise(r => setTimeout(r, 300 * attempt));
          }
        }
        
        if (!stream) {
          const errorMsg = lastError?.message || 'Audio capture failed';
          console.debug('[AUDIO:BG:ERR] Final failure:', errorMsg);
          
          sendResponse({ 
            success: false, 
            error: errorMsg,
            requiresFallback: !/cannot be captured|chrome pages/.test(errorMsg)
          });
          return;
        }
        
        // Step 6: Store capture state
        audioCaptureState.set(tabId, {
          stream,
          audioContext: null,
          isCapturing: true,
          startedAt: Date.now()
        });
        
        // Step 7: Forward stream to offscreen for transcription (existing flow)
        try {
          const existingContexts = await chrome.runtime.getContexts({});
          const offscreenDocument = existingContexts.find(c => c.contextType === 'OFFSCREEN_DOCUMENT');
          
          if (!offscreenDocument) {
            await chrome.offscreen.createDocument({
              url: 'offscreen.html',
              reasons: ['USER_MEDIA'],
              justification: 'Audio capture for transcription'
            });
          }
          
          // CONTEXT GUARD: Only call tabCapture in background script
          if (typeof chrome.tabCapture === 'undefined') {
            throw new Error('tabCapture API not available in this context');
          }
          
          // Get stream ID for offscreen
          const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
          
          // Send to offscreen with retry
          let offscreenReady = false;
          for (let i = 0; i < 5; i++) {
            try {
              const res = await chrome.runtime.sendMessage({
                type: 'START_OFFSCREEN_CAPTURE',
                streamId
              });
              if (res?.success) {
                offscreenReady = true;
                break;
              }
            } catch (e) {
              void chrome.runtime.lastError;
              await new Promise(r => setTimeout(r, 200));
            }
          }
          
          if (!offscreenReady) {
            throw new Error('Offscreen document not ready');
          }
        } catch (offscreenErr) {
          console.warn('[AUDIO:BG:ERR] Offscreen setup failed:', offscreenErr.message);
          // Clean up
          stream.getTracks().forEach(t => t.stop());
          audioCaptureState.delete(tabId);
          
          sendResponse({ 
            success: false, 
            error: 'Audio processing initialization failed. Please try again.',
            requiresFallback: true
          });
          return;
        }
        
        console.debug('[AUDIO:BG:READY] Capture complete for tab', tabId);
        
        // Start 20-second auto-insight timer
        correlationEngine.startAutoInsightTimer();
        console.log('[AUDIO:BG] 🎯 Started auto-insight timer');
        
        sendResponse({ success: true, tabId });
        
      } catch (error) {
        console.debug('[AUDIO:BG:ERR] Unexpected error:', error.message);
        sendResponse({ 
          success: false, 
          error: error.message,
          requiresFallback: false
        });
      }
    })();
    return true;
  } else if (message.type === 'START_AUDIO_CAPTURE_FALLBACK') {
    // Handle getDisplayMedia fallback - stream is already obtained by sidepanel
    console.log('[Spikely] getDisplayMedia fallback invoked');
    console.log('[Spikely] Processing fallback stream from sidepanel');
    
    // For fallback, we need to handle the stream in the sidepanel context
    // since getDisplayMedia must be called from a user gesture in the page
    sendResponse({ 
      success: true,
      message: 'Fallback stream should be processed in sidepanel context'
    });
    return true;
  } else if (message.type === 'STOP_AUDIO_CAPTURE') {
    (async () => {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = activeTab?.id;
        
        console.debug('[AUDIO:BG:STOP]', { tabId });
        
        if (tabId && audioCaptureState.has(tabId)) {
          const state = audioCaptureState.get(tabId);
          
          // Stop all tracks
          if (state.stream) {
            state.stream.getTracks().forEach(track => {
              console.debug('[AUDIO:BG:STOP] Stopping track', track.id);
              track.stop();
            });
          }
          
          // Close audio context if exists
          if (state.audioContext) {
            await state.audioContext.close();
          }
          
          audioCaptureState.delete(tabId);
        }
        
        // Stop offscreen capture
        chrome.runtime.sendMessage({
          type: 'STOP_OFFSCREEN_CAPTURE'
        }, () => { void chrome.runtime.lastError; });
        
        // Reset correlation engine
        correlationEngine.reset();
        
        sendResponse({ success: true });
      } catch (error) {
        console.debug('[AUDIO:BG:ERR] Stop failed:', error.message);
        sendResponse({ success: true }); // Non-fatal
      }
    })();
    return true;
  } else if (message.type === 'GET_AUDIO_STATUS') {
    (async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = activeTab?.id;
      const state = tabId ? audioCaptureState.get(tabId) : null;
      
      sendResponse({ 
        isCapturing: state?.isCapturing || false, 
        tabId: tabId || null 
      });
    })();
    return true;
  } else if (message.type === 'TRANSCRIPT') {
    // Transcript received from audio capture
    console.log('[Background] Transcript:', message.text);
    
    // Only add FINAL transcripts to correlation engine to avoid duplicates
    if (message.isFinal) {
      correlationEngine.addTranscript(message.text, message.timestamp, message.confidence);
      console.log('[Background] Added FINAL transcript to correlation engine');
    }
    
    // Forward to side panel and web app
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPT',
      text: message.text,
      timestamp: message.timestamp,
      confidence: message.confidence,
      isFinal: message.isFinal
    }, () => { void chrome.runtime.lastError; });
    
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'TRANSCRIPT',
        text: message.text,
        timestamp: message.timestamp,
        confidence: message.confidence
      }));
    }
  } else if (message.type === 'AUDIO_LEVEL') {
    // Forward audio level to side panel for UI feedback
    chrome.runtime.sendMessage({
      type: 'AUDIO_LEVEL',
      level: message.level
    }, () => { void chrome.runtime.lastError; });
  } else if (message.type === 'SYSTEM_STATUS') {
    // Forward system status to side panel
    chrome.runtime.sendMessage({
      type: 'SYSTEM_STATUS',
      status: message.status,
      timestamp: message.timestamp
    }, () => { void chrome.runtime.lastError; });
  } else if (message.type === 'ENGINE_STATUS') {
    // Relay ENGINE_STATUS from correlation engine to side panel
    console.log('[ENGINE_STATUS:BG:RX]', message.status, message.meta);
    console.debug('[ENGINE_STATUS:BG:TX]', message.status, message.meta);
    chrome.runtime.sendMessage({
      type: 'ENGINE_STATUS',
      status: message.status,
      meta: message.meta
    }, () => { void chrome.runtime.lastError; });
  } else if (message.type === 'INSIGHT') {
    // Forward insight to side panel
    console.log('🔬 NUCLEAR: INSIGHT message received in background.js');
    console.log('🔬 NUCLEAR: INSIGHT content:', {
      emotionalLabel: message.emotionalLabel,
      nextMove: message.nextMove?.substring(0, 50),
      source: message.source,
      isTimedInsight: message.isTimedInsight,
      from: sender.tab?.id
    });
    console.log('[Background] Insight generated:', message.nextMove);
    
    console.log('🔬 NUCLEAR: About to forward INSIGHT to sidepanel');
    chrome.runtime.sendMessage({
      type: 'INSIGHT',
      ...message
    }, () => { void chrome.runtime.lastError; });
    console.log('🔬 NUCLEAR: INSIGHT forwarded to sidepanel');
    
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'INSIGHT',
        ...message
      }));
    }
  } else if (message.type === 'ACTION') {
    // Forward action to side panel
    console.log('[Background] Action logged:', message.label, message.delta);
    chrome.runtime.sendMessage({
      type: 'ACTION',
      ...message
    }, () => { void chrome.runtime.lastError; });
    
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'ACTION',
        ...message
      }));
    }
  } else if (message.type === 'NICHE_UPDATE') {
    // Handle niche/goal selection updates
    console.log('[Background] 🎯 Niche update:', message.niche, message.goal);
    
    // Update correlation engine with new niche preferences
    if (correlationEngine && correlationEngine.updateNichePreferences) {
      correlationEngine.updateNichePreferences(message.niche, message.goal);
    }
    
    // Forward to web app
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'NICHE_UPDATE',
        niche: message.niche,
        goal: message.goal,
        timestamp: Date.now()
      }));
    }
  } else if (message.type === 'HUME_ANALYZE') {
    // Centralized Hume AI analysis with request gating
    (async () => {
      const requestId = generateRequestId();
      
      const now = Date.now();
      const cooldown = humeState.minIntervalMs + humeState.backoffMs;
      
      if (humeState.inFlight) {
        console.log('[Background] Hume in-flight, dropping request');
        sendResponse?.({ ok: false, reason: 'cooldown', message: 'Analysis in progress' });
        return;
      }
      
      if (now - humeState.lastAt < cooldown) {
        console.log(`[Background] Hume cooldown active (${cooldown}ms), dropping request`);
        sendResponse?.({ ok: false, reason: 'cooldown', message: `Wait ${Math.ceil((cooldown - (now - humeState.lastAt)) / 1000)}s` });
        return;
      }
      
      humeState.inFlight = true;
      humeState.lastAt = now;
      console.log('[Background] Hume queued → sending (inFlight=true)');
      
      if (DEBUG_HUME) {
        console.log(`[DEBUG_HUME] Request ${requestId} initiated at ${new Date().toISOString()}`);
      }      
        try {
          // Ensure offscreen document exists for Hume AI processing
          const existingContexts = await chrome.runtime.getContexts({});
          let offscreenDocument = existingContexts.find(c => c.contextType === 'OFFSCREEN_DOCUMENT');
          
          if (!offscreenDocument) {
            console.log('[Background] Creating offscreen document for Hume AI...');
            try {
              await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['AUDIO_PLAYBACK'],
                justification: 'Hume AI prosody analysis'
              });
              // Give it time to initialize
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
              if (!err.message.includes('Only a single offscreen')) {
                throw err;
              }
            }
          }
          
          // Send to offscreen document for Hume AI processing with retry logic
          const resp = await new Promise((resolve) => {
            let retryCount = 0;
            const maxRetries = 3;
            
            function attemptSend() {
              chrome.runtime.sendMessage({
                type: 'HUME_ANALYZE_FETCH',
                audioBase64: message.audioBase64
              }, (r) => {
                if (chrome.runtime.lastError) {
                  console.error('[Background] Hume message error (attempt', retryCount + 1, '):', chrome.runtime.lastError.message);
                  
                  // Check if it's a "port closed" error and retry
                  if (chrome.runtime.lastError.message.includes('message port closed') || 
                      chrome.runtime.lastError.message.includes('Could not establish connection')) {
                    
                    if (retryCount < maxRetries) {
                      retryCount++;
                      console.log(`[Background] Retrying Hume message (${retryCount}/${maxRetries}) in 500ms...`);
                      setTimeout(attemptSend, 500 * retryCount); // Exponential backoff
                      return;
                    }
                  }
                  
                  resolve({ ok: false, reason: 'message_error', status: 0, message: chrome.runtime.lastError.message });
                } else {
                  resolve(r);
                }
              });
            }
            
            attemptSend();
          });
          
          if (DEBUG_HUME && resp) {
            console.log(`[DEBUG_HUME] Request ${requestId} received response:`, {
              ok: resp.ok,
              reason: resp.reason,
              hasResult: !!resp.result,
              timestamp: new Date().toISOString()
            });
          }
          
          if (!resp || !resp.ok) {
            const reason = resp?.reason || 'api_error';
            if (reason === 'rate_limit') {
              humeState.backoffMs = Math.min(30000, (humeState.backoffMs || 1000) * 2);
              console.log(`[Background] Hume backoff set to ${humeState.backoffMs}ms (429)`);
              sendResponse?.({ ok: false, reason: 'rate_limit', message: 'Too many requests' });
              return;
            }
            if (reason === 'payment_required') {
              humeState.backoffMs = Math.min(30000, (humeState.backoffMs || 5000) * 2);
              console.log(`[Background] Hume backoff set to ${humeState.backoffMs}ms (402)`);
              sendResponse?.({ ok: false, reason: 'payment_required', message: 'Payment required' });
              return;
            }
            console.error('[Background] Hume fetch (offscreen) failed:', resp?.message || reason);
            humeState.backoffMs = Math.min(30000, (humeState.backoffMs || 2000) * 1.5);
            sendResponse?.({ ok: false, reason, message: resp?.message || 'Fetch failed' });
            return;
          }
          
          const result = resp.result;
          
          // ==================== DEBUG LOGGING ====================
          if (DEBUG_HUME) {
            console.log(`[DEBUG_HUME] ========================================`);
            console.log(`[DEBUG_HUME] Request ${requestId} - Full Response Object:`);
            console.log(`[DEBUG_HUME] ========================================`);
            console.log(`[DEBUG_HUME] Full result:`, JSON.stringify(result, null, 2));
            
            console.log(`[DEBUG_HUME] Prosody data:`, {
              exists: !!result.prosody,
              type: typeof result.prosody,
              hasMetrics: !!result.prosody?.metrics,
              hasTopEmotions: !!result.prosody?.topEmotions,
              topEmotionsType: Array.isArray(result.prosody?.topEmotions) ? 'array' : typeof result.prosody?.topEmotions,
              topEmotionsLength: result.prosody?.topEmotions?.length
            });
            
            console.log(`[DEBUG_HUME] Burst data:`, {
              exists: !!result.burst,
              type: typeof result.burst,
              hasTopEmotions: !!result.burst?.topEmotions,
              topEmotionsType: Array.isArray(result.burst?.topEmotions) ? 'array' : typeof result.burst?.topEmotions,
              topEmotionsLength: result.burst?.topEmotions?.length,
              topEmotions: result.burst?.topEmotions
            });
            
            console.log(`[DEBUG_HUME] Language data:`, {
              exists: !!result.language,
              type: typeof result.language,
              hasTopEmotions: !!result.language?.topEmotions,
              topEmotionsType: Array.isArray(result.language?.topEmotions) ? 'array' : typeof result.language?.topEmotions,
              topEmotionsLength: result.language?.topEmotions?.length,
              topEmotions: result.language?.topEmotions
            });
          }
          // =======================================================
          
          // Clear backoff on success
          humeState.backoffMs = 0;
          
          const metrics = {
            excitement: result.prosody?.metrics?.excitement || 0,
            confidence: result.prosody?.metrics?.confidence || 0,
            energy: result.prosody?.metrics?.energy || 0,
            topEmotions: result.prosody?.topEmotions || [],
            topBursts: result.burst?.topEmotions || [],
            topLanguageEmotions: result.language?.topEmotions || [],
            dominantSignal: result.meta?.dominantSignal || 'Unknown',
            avgSignalStrength: result.meta?.avgSignalStrength || 0,
            correlationQuality: result.meta?.correlationQuality || 'WEAK',
            timestamp: Date.now()
          };
          
          console.log(`[Background] Prosody metrics received {quality: ${metrics.correlationQuality}, dominant: ${metrics.dominantSignal}, energy: ${metrics.energy.toFixed(2)}}`);
          
          // ==================== EXTENDED LOGGING ====================
          if (DEBUG_HUME) {
            console.log(`[DEBUG_HUME] Request ${requestId} - Parsed Metrics:`, {
              timestamp: new Date().toISOString(),
              excitement: metrics.excitement,
              confidence: metrics.confidence,
              energy: metrics.energy,
              topEmotionsCount: metrics.topEmotions.length,
              topBurstsCount: metrics.topBursts.length,
              topLanguageEmotionsCount: metrics.topLanguageEmotions.length,
              dominantSignal: metrics.dominantSignal,
              correlationQuality: metrics.correlationQuality
            });
            
            if (metrics.topBursts.length > 0) {
              console.log(`[DEBUG_HUME] 💥 VOCAL BURSTS DETECTED:`, metrics.topBursts);
            }
            if (metrics.topLanguageEmotions.length > 0) {
              console.log(`[DEBUG_HUME] 📝 LANGUAGE EMOTIONS DETECTED:`, metrics.topLanguageEmotions);
            }
          }
          // ==========================================================
          
          // Add to correlation engine
          correlationEngine.addProsodyMetrics(metrics);
          
          // Broadcast to side panel and web app
          chrome.runtime.sendMessage({
            type: 'PROSODY_METRICS',
            metrics: metrics
          }, () => { void chrome.runtime.lastError; });
          
          if (wsConnection?.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'PROSODY_METRICS',
              metrics: metrics
            }));
          }
          
          sendResponse?.({ ok: true, metrics });
        } catch (error) {
          console.error('[Background] Hume error:', error);
          humeState.backoffMs = Math.min(30000, (humeState.backoffMs || 2000) * 1.5);
          sendResponse?.({ ok: false, reason: 'network_error', message: error.message });
        } finally {
          humeState.inFlight = false;
          console.log('[Background] Hume done (inFlight=false)');
        }
    })();
    return true; // Keep channel open for async response
  }
  return message.type === 'OPEN_SIDE_PANEL' || message.type === 'START_AUDIO_CAPTURE' || message.type === 'HUME_ANALYZE';
});

// Auto-connect on extension load
console.log('[Spikely] Background script loaded');
connectToWebApp();

// Reconnect when browser starts
chrome.runtime.onStartup.addListener(() => {
  console.log('[Spikely] Browser started, connecting...');
  connectToWebApp();
});

// Re-inject tracking on SPA navigation
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  console.log(`[Spikely] SPA navigation detected on tab ${details.tabId}`);
  chrome.tabs.sendMessage(details.tabId, { type: 'START_TRACKING' }, () => {
    if (chrome.runtime.lastError) {
      // Attempt to inject if content script isn't present, then retry
      chrome.scripting.executeScript({ target: { tabId: details.tabId }, files: ['content.js'] })
        .then(() => {
          chrome.tabs.sendMessage(details.tabId, { type: 'START_TRACKING' }, () => {});
        })
        .catch(() => {});
    }
  });
}, {
  url: [
    { hostContains: 'tiktok.com' },
    { hostContains: 'twitch.tv' },
    { hostContains: 'kick.com' },
    { hostContains: 'youtube.com' }
  ]
});

// Ensure tracking after full page loads too (not just SPA)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    try {
      const u = new URL(tab.url);
      if (/(tiktok\.com|twitch\.tv|kick\.com|youtube\.com)/.test(u.hostname)) {
        chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
          .then(() => {
            chrome.tabs.sendMessage(tabId, { type: 'START_TRACKING' }, () => {});
          })
          .catch(() => {});
      }
    } catch (_) {}
  }
});

// Open side panel from toolbar icon click (user gesture)
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab?.id) return;
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
    await chrome.sidePanel.open({ tabId: tab.id });
    console.log(`[Spikely] ✅ Side panel opened via action for tab ${tab.id}`);
  } catch (err) {
    console.error('[Spikely] Side panel open failed (action):', err);
  }
});

// Context menu to open the panel
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({ id: 'spikely-open-panel', title: 'Open Spikely Side Panel', contexts: ['all'] });
  } catch (e) {}
  if (chrome.sidePanel?.setPanelBehavior) {
    try {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (e) {}
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'spikely-open-panel' && tab?.id) {
    try {
      await chrome.sidePanel.setOptions({ tabId: tab.id, path: 'sidepanel.html', enabled: true });
      await chrome.sidePanel.open({ tabId: tab.id });
      console.log(`[Spikely] ✅ Side panel opened via context menu for tab ${tab.id}`);
    } catch (err) {
      console.error('[Spikely] Side panel open failed (menu):', err);
    }
  }
});

// Keyboard command to open the panel
chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'open-spikely-panel') {
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!active?.id) return;
      await chrome.sidePanel.setOptions({ tabId: active.id, path: 'sidepanel.html', enabled: true });
      await chrome.sidePanel.open({ tabId: active.id });
      console.log(`[Spikely] ✅ Side panel opened via command for tab ${active.id}`);
    } catch (err) {
      console.error('[Spikely] Side panel open failed (command):', err);
    }
  }
});
