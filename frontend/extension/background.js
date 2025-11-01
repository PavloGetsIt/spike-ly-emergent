// ==================== PROGRAMMATIC CONTENT SCRIPT INJECTION ====================
// Since manifest content_scripts are being blocked, inject programmatically

async function injectContentScript(tabId) {
  try {
    console.log('[BG] 🚀 Injecting content script into tab:', tabId);
    
    // Inject the content script programmatically
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        // INLINE CONTENT SCRIPT - Minimal viewer detection
        console.log('%c🚀🚀🚀 [SPIKELY] PROGRAMMATIC INJECTION SUCCESS! 🚀🚀🚀', 'color: green; font-weight: bold; font-size: 16px');
        console.log('[SPIKELY] URL:', window.location.href);
        console.log('[SPIKELY] Timestamp:', new Date().toISOString());
        
        // Set flag
        window.__SPIKELY_CONTENT_ACTIVE__ = true;
        
        // Platform detection
        const platform = window.location.hostname.includes('tiktok') ? 'tiktok' : 'unknown';
        console.log('[SPIKELY] Platform detected:', platform);
        
        // Simple test functions
        window.__SPIKELY_TEST__ = function() {
          console.log('🧪 PROGRAMMATIC TEST EXECUTED!');
          return 'SUCCESS_PROGRAMMATIC';
        };
        
        window.__SPIKELY_TEST_CHAT__ = function() {
          console.log('💬 PROGRAMMATIC CHAT TEST EXECUTED!');
          return 'CHAT_SUCCESS_PROGRAMMATIC';
        };
        
        // Simple viewer detection function
        window.__SPIKELY_FIND_VIEWERS__ = function() {
          const allElements = Array.from(document.querySelectorAll('*'));
          for (const element of allElements) {
            const text = element.textContent?.trim() || '';
            if (text.includes('Viewers') && /\d+[\.\d]*[KkMm]?/.test(text)) {
              console.log('📊 Found viewer element:', text);
              return text;
            }
          }
          console.log('❌ No viewer element found');
          return null;
        };
        
        console.log('✅ [SPIKELY] Programmatic injection complete!');
        console.log('🧪 Test with: window.__SPIKELY_TEST__()');
        console.log('💬 Test chat: window.__SPIKELY_TEST_CHAT__()'); 
        console.log('📊 Find viewers: window.__SPIKELY_FIND_VIEWERS__()');
      }
    });
    
    console.log('[BG] ✅ Content script injected successfully');
    return true;
  } catch (error) {
    console.error('[BG] ❌ Failed to inject content script:', error);
    return false;
  }
}

// Inject content script when side panel opens
chrome.sidePanel.onChanged.addListener(async (details) => {
  if (details.opened) {
    console.log('[BG] 📂 Side panel opened, injecting content script...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url.includes('tiktok.com')) {
      await injectContentScript(tab.id);
    }
  }
});

// Also inject when tracking starts
async function injectAndStartTracking() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url.includes('tiktok.com')) {
    const success = await injectContentScript(tab.id);
    if (success) {
      console.log('[BG] ✅ Content script ready, starting tracking...');
      // Add small delay to ensure script is fully loaded
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: 'START_TRACKING' });
      }, 500);
    }
  }
}

import { audioCaptureManager } from './audioCapture.js';
import { correlationEngine } from './correlationEngine.js';

console.log('🚨 BACKGROUND TEST: imports completed successfully');
console.log('🔬 NUCLEAR: background.js LOADING - v2.7.0');
console.log('🔬 NUCLEAR: background.js timestamp:', new Date().toISOString());

// ==================== MV3 KEEP-ALIVE HEARTBEAT ====================
// Prevent service worker from sleeping during audio capture
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    console.log('[BG] 💓 Keep-alive heartbeat');
  }
});

function startKeepAlive() {
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 }); // Every 30 seconds
  console.log('[BG] ❤️ Keep-alive started');
}

function stopKeepAlive() {
  chrome.alarms.clear('keepAlive');
  console.log('[BG] 💔 Keep-alive stopped');
}
// =================================================================

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
let lastViewer = null;
let lastViewerUpdateAt = 0;
let audioStatus = { isCapturing: false, tabId: null };
let lastLiveTabId = null;
let contentScriptTabs = new Set(); // Track which tabs have active content scripts
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
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content_minimal.js'] })
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

// Listen for messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
  } else if (message.type === 'CONTENT_SCRIPT_READY') {
    // Handle handshake from content script
    console.log('[BG] ✅ CONTENT_SCRIPT_READY handshake received', { 
      platform: message.platform, 
      url: message.url?.substring(0, 50),
      tabId: sender.tab?.id 
    });
    
    // Store that this tab has an active content script
    if (sender.tab?.id) {
      contentScriptTabs.add(sender.tab.id);
      console.log('[BG] 📝 Tab', sender.tab.id, 'marked as content script ready');
    }
    
    sendResponse({ success: true, acknowledged: true });
    
  } else if (message.type === 'VIEWER_COUNT_UPDATE') {
    // Log synthetic test messages
    if (message.source === 'test_trigger') {
      console.log('[TEST:INSIGHT:BG:RX]', { count: message.count, delta: message.delta, source: message.source });
    }
    
    console.debug('[VC:BG:RX] VIEWER_COUNT_UPDATE', { count: message.count, delta: message.delta, platform: message.platform });
    
    // Remember last viewer stats for late-opened side panels
    lastViewer = {
      platform: message.platform,
      count: message.count,
      delta: message.delta ?? 0,
      timestamp: message.timestamp,
      tabId: sender.tab?.id || null,
    };
    // Remember the last livestream tab id to use for audio capture
    if (sender.tab?.id) {
      lastLiveTabId = sender.tab.id;
    }

    // Add to correlation engine
    correlationEngine.addViewerCount(message.count, message.delta ?? 0, message.timestamp);

    // Forward to web app via WebSocket
    if (wsConnection?.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'VIEWER_COUNT',
        platform: message.platform,
        count: message.count,
        delta: message.delta ?? 0,
        timestamp: message.timestamp,
        rawText: message.rawText,
        confidence: message.confidence,
        tabId: sender.tab?.id
      }));
    }

    // Also broadcast to extension pages (e.g., side panel)
    console.debug('[VC:BG:TX] VIEWER_COUNT', { count: message.count, delta: message.delta ?? 0 });
    chrome.runtime.sendMessage({
      type: 'VIEWER_COUNT',
      platform: message.platform,
      count: message.count,
      delta: message.delta ?? 0,
      timestamp: message.timestamp
    }, () => { void chrome.runtime.lastError; });

  } else if (message.type === 'CHAT_STREAM_UPDATE') {
    console.log('[CHAT:BG:RX] CHAT_STREAM_UPDATE', { 
      commentCount: message.commentCount, 
      chatRate: message.chatRate,
      platform: message.platform 
    });

    // Add to correlation engine
    if (correlationEngine && typeof correlationEngine.addChatStream === 'function') {
      correlationEngine.addChatStream(message.comments, message.chatRate, message.timestamp);
    } else {
      console.warn('[CHAT:BG] Correlation engine not ready for chat stream');
    }

    // Broadcast to side panel for display
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM',
      platform: message.platform,
      comments: message.comments,
      chatRate: message.chatRate,
      commentCount: message.commentCount,
      timestamp: message.timestamp
    }, () => { void chrome.runtime.lastError; });

    // Log sample comments for debugging
    if (message.comments.length > 0) {
      const sample = message.comments.slice(0, 3).map(c => 
        `${c.username}: ${c.text.substring(0, 30)}`
      ).join(' | ');
      console.log('[CHAT:BG] Sample:', sample);
    }

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
            chrome.scripting.executeScript({ target: { tabId }, files: ['content_minimal.js'] })
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
  } else if (message.type === 'GET_CONNECTION_STATUS') {
    sendResponse({ 
      connected: wsConnection?.readyState === WebSocket.OPEN 
    });
  } else if (message.type === 'CAPTURE_CLICK_ACKNOWLEDGED') {
    // Forward click acknowledgement to sidepanel
    console.log('[BG] 🔴 Click acknowledgement received, forwarding to sidepanel');
    
    chrome.runtime.sendMessage({
      type: 'CAPTURE_CLICK_ACKNOWLEDGED',
      timestamp: message.timestamp
    });
    
  } else if (message.type === 'BEGIN_AUDIO_CAPTURE') {
    // ONLY valid context for tabCapture under MV3
    console.log('[BG] 🔴 STATE: IDLE → CAPTURING');
    console.log('[BG] 🔴 BEGIN_AUDIO_CAPTURE received from content script');
    
    (async () => {
      try {
        const tabId = sender.tab?.id;
        if (!tabId) {
          throw new Error('No tab ID in message sender');
        }
        
        // Validate gesture timing (must be < 500ms old)
        const gestureAge = performance.now() - (message.gestureTimestamp || 0);
        if (gestureAge > 500) {
          throw new Error(`Gesture too old: ${gestureAge}ms (max 500ms)`);
        }
        console.log('[BG] ✅ Gesture timing valid:', gestureAge + 'ms');
        
        console.log('[BG] 🎤 STATE: CAPTURING - Calling tabCapture.capture()...');
        
        // Ensure offscreen document exists for MV3 compliance
        async function ensureOffscreen() {
          const existing = await chrome.offscreen.hasDocument();
          if (!existing) {
            await chrome.offscreen.createDocument({
              url: chrome.runtime.getURL("offscreen.html"),
              reasons: ["AUDIO_CAPTURE"],
              justification: "Process tab audio in MV3"
            });
            console.log('[BG] ✅ Offscreen document created');
          } else {
            console.log('[BG] ✅ Offscreen document exists');
          }
        }
        
        // Bootstrap offscreen before capture
        await ensureOffscreen();
        console.log("[PRECAP] Tab active:", tabId);
        console.log("[PRECAP] Offscreen ready");
        console.log("[PRECAP] Calling tabCapture.capture");
        
        // Guard Chrome API availability
        if (!chrome.tabCapture || typeof chrome.tabCapture.capture !== "function") {
          throw new Error('tabCapture API not available');
        }
        
        // Start keep-alive to prevent service worker sleep
        startKeepAlive();
        
        // Helper function for successful stream processing
        function processSuccessfulStream(stream, tabId) {
          console.log('[BG] 🔴 STATE: CAPTURING → STREAMING');
          console.log('[AUDIO] PERMISSION POPUP SHOWN');
          console.log('[AUDIO] STREAM RECEIVED');
          console.log('[AUDIO:BG] stream returned');
          console.log('[AUDIO:BG] audio tracks:', stream.getAudioTracks().length);
          console.log('[AUDIO] Stream returned successfully');
          
          // Store stream
          audioCaptureState.set(tabId, {
            isCapturing: true,
            stream: stream,
            startTime: Date.now()
          });
          
          // Setup track end detection (replaces onStatusChanged)
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.onended = () => {
              console.warn('[AUDIO] Track ended');
              chrome.runtime.sendMessage({
                type: 'AUDIO_CAPTURE_RESULT',
                success: false,
                error: 'track ended'
              });
            };
          }
          
          // Start correlation engine
          correlationEngine.startAutoInsightTimer();
          
          // Send immediate confirmation to sidepanel
          chrome.runtime.sendMessage({
            type: 'AUDIO_CAPTURE_RESULT',
            success: true,
            capture_started: true,
            streamId: stream.id,
            trackCount: stream.getAudioTracks().length
          });
          
          console.log('[AUDIO] capture_started message sent');
          console.log('[BG] 🔴 STATE: STREAMING - System ready');
        }
        
        // Call tabCapture from background context (MV3 - remove consumerTabId/targetTabId)
        chrome.tabCapture.capture(
          {audio: true, video: false},
          async (stream) => {
            try {
              console.log('[BG] capture callback fired');
              console.log('[AUDIO:BG] tabCapture.capture invoked');
              
              // Validate stream immediately
              if (!stream) {
                console.error('[AUDIO:BG] Stream validation failed: null stream');
                throw new Error("null stream");
              }
              if (!stream.getAudioTracks) {
                console.error('[AUDIO:BG] Stream validation failed: no accessor');
                throw new Error("no accessor");
              }
              if (stream.getAudioTracks().length === 0) {
                console.error('[AUDIO:BG] Stream validation failed: zero tracks');
                
                // Retry capture once
                console.log('[AUDIO:BG] Retrying capture once...');
                chrome.tabCapture.capture(
                  {audio: true, video: false},
                  (retryStream) => {
                    if (chrome.runtime.lastError || !retryStream || retryStream.getAudioTracks().length === 0) {
                      console.error('[AUDIO:BG] Retry failed, surfacing warning');
                      
                      chrome.runtime.sendMessage({
                        type: 'AUDIO_CAPTURE_RESULT',
                        success: false,
                        error: 'No audio tracks after retry - tab may be muted'
                      });
                      return;
                    }
                    
                    // Retry succeeded, continue with retryStream
                    processSuccessfulStream(retryStream, tabId);
                  }
                );
                return;
              }
              
              // Process successful stream
              processSuccessfulStream(stream, tabId);
              
            } catch (streamError) {
              console.log('[BG] 🔴 STATE: CAPTURING → IDLE (STREAM_ERROR)');
              console.error('[BG] ❌ Stream processing error:', streamError);
              stopKeepAlive();
              
              chrome.runtime.sendMessage({
                type: 'AUDIO_CAPTURE_RESULT',
                success: false,
                error: streamError.message
              });
            }
          }
        );
        
      } catch (captureError) {
        console.log('[BG] 🔴 STATE: CAPTURING → IDLE (CAPTURE_EXCEPTION)');
        console.error('[BG] ❌ tabCapture.capture() failed:', captureError);
        
        stopKeepAlive();
        
        chrome.runtime.sendMessage({
          type: 'AUDIO_CAPTURE_RESULT',
          success: false,
          error: captureError.message
        });
      }
    })();
    
    return true;
    
  } else if (message.type === 'AUDIO_CAPTURE_RESULT') {
    // Handle result from page script button click
    console.log('[BG] 🔴 AUDIO_CAPTURE_RESULT received:', { 
      success: message.success, 
      error: message.error,
      tracks: message.trackCount 
    });
    
    if (message.success) {
      console.log('[BG] ✅ Page button audio capture succeeded');
      // Audio stream is already active, just update state
      sendResponse({ success: true, source: 'page_button' });
    } else {
      console.log('[BG] ❌ Page button audio capture failed:', message.error);
      sendResponse({ success: false, error: message.error, source: 'page_button' });
    }
    
  } else if (message.type === 'PROCESS_CAPTURED_STREAM') {
    (async () => {
      console.debug('[AUDIO:BG:PROCESS] PROCESS_CAPTURED_STREAM received', { tabId: message.tabId });
      
      try {
        const tabId = message.tabId;
        
        if (!tabId) {
          throw new Error('No tab ID provided');
        }
        
        // STEP 1: Ensure content script is injected and ready
        console.log('[AUDIO:BG] 💉 Checking content script readiness...');
        
        // Check if we have confirmation that content script is ready
        const isContentScriptReady = contentScriptTabs.has(tabId);
        console.log('[AUDIO:BG] Content script ready check:', { tabId, ready: isContentScriptReady });
        
        if (!isContentScriptReady) {
          console.log('[AUDIO:BG] ⚠️ Content script not ready, injecting programmatically...');
          
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content_minimal.js']
            });
            console.log('[AUDIO:BG] ✅ Content script injected, waiting for handshake...');
            
            // Wait up to 3 seconds for handshake
            let handshakeReceived = false;
            for (let i = 0; i < 6; i++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              if (contentScriptTabs.has(tabId)) {
                handshakeReceived = true;
                break;
              }
            }
            
            if (!handshakeReceived) {
              throw new Error('Content script did not respond after injection');
            }
            
            console.log('[AUDIO:BG] ✅ Content script handshake confirmed');
          } catch (injectError) {
            console.error('[AUDIO:BG] ❌ Content script injection failed:', injectError);
            sendResponse({ 
              success: false, 
              error: 'Failed to initialize page tracking: ' + injectError.message
            });
            return;
          }
        }
        
        // Stream is already captured by side panel, just process it
        console.log('[AUDIO:BG] ✅ Processing captured stream for tab', tabId);
        
        // Store capture state
        audioCaptureState.set(tabId, {
          isCapturing: true,
          startTime: Date.now()
        });
        
        // Start viewer tracking on content script
        console.log('[AUDIO:BG] 🎯 Starting viewer tracking on content script...');
        chrome.tabs.sendMessage(tabId, { type: 'START_TRACKING' }, (trackingResponse) => {
          if (chrome.runtime.lastError) {
            console.warn('[AUDIO:BG] ⚠️ START_TRACKING failed:', chrome.runtime.lastError.message);
          } else {
            console.log('[AUDIO:BG] ✅ Viewer tracking started:', trackingResponse);
          }
        });
        
        // Start 20-second auto-insight timer
        correlationEngine.startAutoInsightTimer();
        console.log('[AUDIO:BG] 🎯 Started auto-insight timer');
        
        sendResponse({ success: true, tabId });
        
      } catch (error) {
        console.debug('[AUDIO:BG:ERR] Stream processing error:', error.message);
        sendResponse({ 
          success: false, 
          error: error.message
        });
      }
    })();
    return true;
    
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
        
        // STEP 0: Inject content script first (since manifest injection fails)
        console.log('[AUDIO:BG] 💉 Injecting content script before audio capture...');
        await injectContentScript(tabId);
        
        // STEP 0: Ensure content script is injected and ready
        console.log('[AUDIO:BG] 💉 Checking content script readiness...');
        
        // Check if we have confirmation that content script is ready
        const isContentScriptReady = contentScriptTabs.has(tabId);
        console.log('[AUDIO:BG] Content script ready check:', { tabId, ready: isContentScriptReady });
        
        if (!isContentScriptReady) {
          console.log('[AUDIO:BG] ⚠️ Content script not ready, injecting programmatically...');
          
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ['content_minimal.js']
            });
            console.log('[AUDIO:BG] ✅ Content script injected, waiting for handshake...');
            
            // Wait up to 3 seconds for handshake
            let handshakeReceived = false;
            for (let i = 0; i < 6; i++) {
              await new Promise(resolve => setTimeout(resolve, 500));
              if (contentScriptTabs.has(tabId)) {
                handshakeReceived = true;
                break;
              }
            }
            
            if (!handshakeReceived) {
              throw new Error('Content script did not respond after injection');
            }
            
            console.log('[AUDIO:BG] ✅ Content script handshake confirmed');
          } catch (injectError) {
            console.error('[AUDIO:BG] ❌ Content script injection failed:', injectError);
            sendResponse({ 
              success: false, 
              error: 'Failed to initialize page tracking: ' + injectError.message
            });
            return;
          }
        }
        
        // Step 1: Validate supported platform
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
            
            stream = await chrome.tabCapture.capture({
              audio: true,
              video: false
            });
            
            if (stream && stream.getAudioTracks().length > 0) {
              console.debug('[AUDIO:BG:READY] Audio stream active', { 
                tracks: stream.getAudioTracks().length,
                tabId 
              });
              break;
            } else {
              throw new Error('No audio tracks in captured stream');
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
        
        // Start viewer tracking on content script
        console.log('[AUDIO:BG] 🎯 Starting viewer tracking on content script...');
        chrome.tabs.sendMessage(tabId, { type: 'START_TRACKING' }, (trackingResponse) => {
          if (chrome.runtime.lastError) {
            console.warn('[AUDIO:BG] ⚠️ START_TRACKING failed:', chrome.runtime.lastError.message);
          } else {
            console.log('[AUDIO:BG] ✅ Viewer tracking started:', trackingResponse);
          }
        });
        
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
          
          // Send to offscreen document for Hume AI processing
          const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'HUME_ANALYZE_FETCH',
              audioBase64: message.audioBase64
            }, (r) => {
              if (chrome.runtime.lastError) {
                console.error('[Background] Hume message error:', chrome.runtime.lastError.message);
                resolve({ ok: false, reason: 'message_error', status: 0, message: chrome.runtime.lastError.message });
              } else {
                resolve(r);
              }
            });
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
startKeepAlive(); // Start heartbeat immediately
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
      chrome.scripting.executeScript({ target: { tabId: details.tabId }, files: ['content_minimal.js'] })
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
        chrome.scripting.executeScript({ target: { tabId }, files: ['content_minimal.js'] })
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
