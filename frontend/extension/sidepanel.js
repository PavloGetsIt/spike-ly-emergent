// Spikely Side Panel - WebSocket Integration
// VERSION: 2025-10-23-024 - VIEWER COUNT DECIMAL FIX
console.log('🎯 SIDEPANEL.JS LOADING - Version 2025-10-23-024 (Viewer Count Decimal Fix)');
console.log('🎯 Fixed: 1.2K now parses as 1200 (not 1000)');

import { AudioProcessor } from './audioProcessor.js';

// Threshold configuration (dynamic, loaded from chrome.storage)
let MIN_DELTA = 3;

// Load threshold from storage on init
chrome.storage.local.get(['minDelta'], (result) => {
  if (result.minDelta !== undefined) {
    MIN_DELTA = result.minDelta;
    console.log('[THRESHOLD:LOADED] MIN_DELTA=' + MIN_DELTA);
  } else {
    console.log('[THRESHOLD:LOADED] MIN_DELTA=3 (default)');
  }
});

let wsConnection = null;
let sessionStartTime = Date.now();
let winningActions = [];
let losingActions = [];
let audioProcessor = null;

let isAudioRecording = false;

// ==================== UI UTILITY FUNCTIONS ====================

/**
 * Add expandable tooltip for truncated text
 */
function addExpandableTooltip(element, fullText) {
  if (!element || !fullText) return;
  
  const isTruncated = element.scrollWidth > element.clientWidth;
  
  if (isTruncated) {
    element.title = fullText;
    element.style.cursor = 'pointer';
    element.classList.add('truncated-text');
    
    let isExpanded = false;
    
    element.addEventListener('click', () => {
      isExpanded = !isExpanded;
      
      if (isExpanded) {
        element.textContent = fullText;
        element.classList.add('expanded');
      } else {
        const truncated = fullText.length > 60 
          ? fullText.substring(0, 57) + '...' 
          : fullText;
        element.textContent = truncated;
        element.classList.remove('expanded');
      }
    });
  }
}

/**
 * Format time ago (e.g., "5s ago", "just now")
 */
function formatTimeAgo(timestamp) {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);
  
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/**
 * Update audio state display
 */
function updateAudioState(recording) {
  isAudioRecording = recording;
  
  const audioBtn = startAudioBtn;
  const statusDot = document.getElementById('audioStatusDot');
  const statusLabel = document.getElementById('audioStatusLabel');
  const btnIcon = audioBtn?.querySelector('.btn-icon');
  const btnText = audioBtn?.querySelector('.btn-text');
  
  if (!audioBtn) return;
  
  if (recording) {
    audioBtn.classList.add('recording');
    statusDot?.classList.add('recording');
    statusLabel?.classList.add('recording');
    
    if (statusLabel) statusLabel.textContent = 'Audio: Recording';
    if (btnIcon) btnIcon.textContent = '⏹️';
    if (btnText) btnText.textContent = 'Stop Audio';
    audioBtn.setAttribute('aria-label', 'Stop audio recording');
  } else {
    audioBtn.classList.remove('recording');
    statusDot?.classList.remove('recording');
    statusLabel?.classList.remove('recording');
    
    if (statusLabel) statusLabel.textContent = 'Audio: Stopped';
    if (btnIcon) btnIcon.textContent = '🎤';
    if (btnText) btnText.textContent = 'Start Audio';
    audioBtn.setAttribute('aria-label', 'Start audio recording');
  }
}

/**
 * Update viewer delta display with tooltips
 */
function updateViewerDeltaDisplay(delta, count, threshold) {
  const deltaEl = viewerDelta;
  const countEl = viewerCount;
  const thresholdEl = thresholdBadgeGray;
  
  if (deltaEl) {
    deltaEl.textContent = delta > 0 ? `+${delta}` : delta;
    deltaEl.title = `Viewer change in last 5 seconds: ${delta > 0 ? '+' : ''}${delta}`;
    
    if (delta > 0) {
      deltaEl.style.color = '#10b981';
    } else if (delta < 0) {
      deltaEl.style.color = '#ef4444';
    } else {
      deltaEl.style.color = 'rgba(255, 255, 255, 0.5)';
    }
  }
  
  if (countEl) {
    countEl.textContent = count;
    countEl.title = `Current live viewers: ${count}`;
  }
  
  if (thresholdEl) {
    thresholdEl.textContent = `±${threshold}`;
    thresholdEl.title = `Sensitivity threshold: ±${threshold} viewers`;
  }
}

/**
 * Setup tooltips for UI elements
 */
function setupTooltips() {
  // Viewer delta tooltip
  const deltaEl = document.getElementById('viewerDelta');
  if (deltaEl) {
    const currentDelta = deltaEl.textContent || '0';
    deltaEl.title = `Viewer change in last 5 seconds: ${currentDelta}`;
    console.log('[UI:INIT] Delta tooltip set');
  }
  
  // Viewer count tooltip
  const countEl = document.getElementById('viewerCount');
  if (countEl) {
    const currentCount = countEl.textContent || '0';
    countEl.title = `Current live viewers: ${currentCount}`;
    console.log('[UI:INIT] Count tooltip set');
  }
  
  // Threshold badge tooltip
  const thresholdGrayEl = document.getElementById('thresholdBadgeGray');
  if (thresholdGrayEl) {
    const currentThreshold = thresholdGrayEl.textContent || '±3';
    thresholdGrayEl.title = `Sensitivity threshold: ${currentThreshold} viewers`;
    console.log('[UI:INIT] Threshold tooltip set');
  }
  
  // Audio button tooltip
  const audioBtn = document.getElementById('startAudioBtn');
  if (audioBtn) {
    audioBtn.title = 'Start or stop audio capture for transcription';
    console.log('[UI:INIT] Audio button tooltip set');
  }
  
  console.log('[UI:INIT] ✅ Tooltips setup complete');
}

// ==================== COUNTDOWN TIMER ====================
let countdownSeconds = 20;
let countdownInterval = null;

/**
 * Update countdown display
 */
function updateCountdown(seconds) {
  console.log('[COUNTDOWN] ⏰ updateCountdown called with:', seconds + 's');
  
  countdownSeconds = seconds;
  
  // Show permanent countdown container
  const permanentCountdown = document.getElementById('permanentCountdown');
  if (permanentCountdown) {
    permanentCountdown.style.display = 'flex';
    console.log('[COUNTDOWN] ✅ Permanent countdown container shown');
  }
  
  // Update countdown display
  const countdownEl = document.getElementById('countdownDisplay');
  if (countdownEl) {
    countdownEl.textContent = `${seconds}s`;
    console.log('[COUNTDOWN] ✅ Display updated to:', seconds + 's');
  } else {
    console.error('[COUNTDOWN] ❌ countdownDisplay element still not found!');
  }
  
  // Start countdown interval if not already running
  if (!countdownInterval && seconds > 0) {
    startCountdownInterval();
  }
}

/**
 * Start countdown interval (decrements every second)
 */
function startCountdownInterval() {
  stopCountdownInterval(); // Clear any existing
  
  countdownInterval = setInterval(() => {
    countdownSeconds--;
    
    const countdownEl = document.getElementById('countdownDisplay');
    if (countdownEl) {
      countdownEl.textContent = `${countdownSeconds}s`;
    }
    
    // Stop at 0
    if (countdownSeconds <= 0) {
      stopCountdownInterval();
    }
  }, 1000); // Update every second
  
  console.log('[COUNTDOWN] ⏰ Interval started');
}

/**
 * Stop countdown interval
 */
function stopCountdownInterval() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
// =========================================================
/**
 * Apply pulse animation fallback via JavaScript
 */
function applyPulseAnimationFallback() {
  const statusDot = document.querySelector('.status-pulse-dot');
  const audioDot = document.querySelector('.audio-status-dot');
  
  if (statusDot) {
    statusDot.style.animation = 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite';
  }
  
  if (audioDot) {
    // Don't apply animation initially - only when recording
    console.log('[UI:INIT] Audio dot found, animation will apply when recording');
  }
  
  console.log('[UI:INIT] Pulse animation fallback applied');
}

/**
 * Start timestamp updater for action items
 */
function startTimestampUpdater() {
  setInterval(() => {
    // Update action time elements
    document.querySelectorAll('.action-time[data-timestamp]').forEach(el => {
      const timestamp = parseInt(el.getAttribute('data-timestamp'));
      if (timestamp) {
        el.textContent = formatTimeAgo(timestamp);
      }
    });
    
    // Update any other timestamp elements
    document.querySelectorAll('[data-timestamp]').forEach(el => {
      if (!el.classList.contains('action-time')) {
        const timestamp = parseInt(el.getAttribute('data-timestamp'));
        if (timestamp) {
          el.textContent = formatTimeAgo(timestamp);
        }
      }
    });
  }, 5000); // Update every 5 seconds
  
  console.log('[UI:INIT] Timestamp updater started');
}

/**
 * Initialize UI features with retry logic
 * Ensures DOM is ready before initializing tooltips and animations
 */
function initializeUIFeatures() {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 200; // ms
  let retryCount = 0;
  
  function attemptInit() {
    console.log(`[UI:INIT] Attempt ${retryCount + 1}/${MAX_RETRIES}`);
    
    // Check if critical DOM elements are present
    const requiredElements = [
      document.getElementById('viewerDelta'),
      document.getElementById('viewerCount'),
      document.getElementById('thresholdBadgeGray'),
      document.getElementById('startAudioBtn')
    ];
    
    const allPresent = requiredElements.every(el => el !== null);
    
    if (allPresent) {
      console.log('[UI:INIT] All required DOM elements found');
      
      // Setup tooltips
      setupTooltips();
      
      // Initialize audio button state
      updateAudioState(false);
      console.log('[UI:INIT] Audio state initialized to stopped');
      
      // Apply animation fallback
      applyPulseAnimationFallback();
      
      // Start timestamp updater
      startTimestampUpdater();
      
      console.log('[UI:INIT] ✅ Initialization complete');
      return true;
    } else {
      console.warn('[UI:INIT] Some DOM elements not ready yet');
      retryCount++;
      
      if (retryCount < MAX_RETRIES) {
        setTimeout(attemptInit, RETRY_DELAY);
      } else {
        console.error('[UI:INIT] ❌ Failed after maximum retries');
      }
      return false;
    }
  }
  
  attemptInit();
}

// =============================================================



// DOM Elements
const viewerDelta = document.getElementById('viewerDelta');
const viewerCount = document.getElementById('viewerCount');
const thresholdBadgeDisplay = document.getElementById('thresholdBadge'); // Green badge next to slider
const thresholdBadgeGray = document.getElementById('thresholdBadgeGray'); // Gray badge in viewer card
const sessionTime = document.getElementById('sessionTime');
const insightContent = document.getElementById('insightContent');
const winningActionsContainer = document.getElementById('winningActions');
const losingActionsContainer = document.getElementById('losingActions');
const connectionStatus = document.getElementById('connectionStatus');
const panelContainer = document.getElementById('panelContainer');
const collapsedTab = document.getElementById('collapsedTab');
const collapseBtn = document.getElementById('collapseBtn');
const eyeIcon = document.querySelector('.eye-icon');
const viewerCard = document.querySelector('.viewer-card');
const resetTrackingBtn = document.getElementById('resetTrackingBtn');
const startAudioBtn = document.getElementById('startAudioBtn');
const systemStatusBadge = document.getElementById('systemStatusBadge');
const cooldownTimer = document.getElementById('cooldownTimer');
const testInsightBtn = document.getElementById('testInsightBtn');
const thresholdSlider = document.getElementById('thresholdSlider');

// Audio capture state
let audioIsCapturing = false;
let isSystemStarted = false; // Main system start/stop state

// Panel collapse/expand state
let isPanelCollapsed = false;

// System health state
let cooldownInterval = null;

// Warm-up state tracking
let isInWarmup = true;
let firstCountReceived = false;

// Collapse/Expand Toggle
collapseBtn.addEventListener('click', () => {
  isPanelCollapsed = true;
  panelContainer.classList.add('collapsed');
  collapsedTab.classList.add('visible');
});

collapsedTab.addEventListener('click', () => {
  isPanelCollapsed = false;
  panelContainer.classList.remove('collapsed');
  collapsedTab.classList.remove('visible');
});

// Threshold slider event handling
if (thresholdSlider && thresholdBadgeDisplay) {
  thresholdSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    MIN_DELTA = value;
    
    // ==================== INSTRUMENTATION ====================
    const timestamp = new Date().toISOString();
    console.log(`SLIDER_CHANGE ts=${timestamp} value=${value}`);
    // ==========================================================
    
    thresholdBadgeDisplay.textContent = '±' + value;
    if (thresholdBadgeGray) thresholdBadgeGray.textContent = '±' + value;
    
    // Update ARIA attributes
    thresholdSlider.setAttribute('aria-valuenow', value);
    thresholdSlider.setAttribute('aria-valuetext', `Plus or minus ${value} viewers`);
    
    // Persist to chrome.storage
    chrome.storage.local.set({ minDelta: value }, () => {
      console.log('[THRESHOLD:UPDATE] Saved MIN_DELTA=' + value);
    });
    
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'THRESHOLD_UPDATE',
      minDelta: value
    }, () => {
      void chrome.runtime.lastError;
    });
    
    // Send to webapp via WebSocket if connected
    if (typeof wsConnection !== 'undefined' && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'THRESHOLD_UPDATE',
        minDelta: value,
        timestamp: Date.now()
      }));
    }
  });
  
  // Initialize slider with stored value
  chrome.storage.local.get(['minDelta'], (result) => {
    const stored = result.minDelta !== undefined ? result.minDelta : 3;
    thresholdSlider.value = stored;
    thresholdBadgeDisplay.textContent = '±' + stored;
    if (thresholdBadgeGray) thresholdBadgeGray.textContent = '±' + stored;
    thresholdSlider.setAttribute('aria-valuenow', stored);
    thresholdSlider.setAttribute('aria-valuetext', `Plus or minus ${stored} viewers`);
    MIN_DELTA = stored;
  });
} else {
  console.warn('[SIDEPANEL] Slider elements not found in DOM');
}

// Debug UI elements
const aaiDebugEl = document.getElementById('aaiDebug');
function aaiDebug(step, detail) {
  const line = `[AAI] ${new Date().toLocaleTimeString()} - ${step}${detail ? `: ${detail}` : ''}`;
  console.log(line);
  if (!aaiDebugEl) return;
  const div = document.createElement('div');
  div.className = 'debug-line';
  div.textContent = line;
  aaiDebugEl.appendChild(div);
  aaiDebugEl.scrollTop = aaiDebugEl.scrollHeight;
}

// Initialize everything at zero - nothing starts until "Start" is clicked
resetAllData();

// Format session time
function formatSessionTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update session timer
setInterval(() => {
  const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
  sessionTime.textContent = formatSessionTime(elapsed);
}, 1000);

// Update system status badge
function updateSystemStatus(status) {
  const statusConfig = {
    IDLE: { emoji: '🔴', text: 'IDLE', class: 'status-idle' },
    OBSERVING: { emoji: '🟡', text: 'OBSERVING', class: 'status-observing' },
    ANALYZING: { emoji: '🟢', text: 'ANALYZING', class: 'status-analyzing' },
    READY: { emoji: '🔵', text: 'READY', class: 'status-ready' }
  };
  
  const config = statusConfig[status];
  if (systemStatusBadge) {
    systemStatusBadge.className = `system-status ${config.class}`;
    systemStatusBadge.innerHTML = `${config.emoji} ${config.text}`;
  }
}

// Update engine status
function updateEngineStatus(status, meta = {}) {
  console.debug('[SIDEPANEL] updateEngineStatus called:', status, meta);
  
  const engineStatus = document.getElementById('engineStatus');
  const engineStatusText = document.getElementById('engineStatusText');
  const statusLatency = document.getElementById('statusLatency');
  const statusSource = document.getElementById('statusSource');
  const statusReason = document.getElementById('statusReason');
  const statusSpinner = document.querySelector('.status-spinner');
  
  console.debug('[SIDEPANEL] DOM elements:', {
    engineStatus: !!engineStatus,
    engineStatusText: !!engineStatusText,
    statusLatency: !!statusLatency,
    statusSource: !!statusSource,
    statusReason: !!statusReason,
    statusSpinner: !!statusSpinner
  });
  
  if (!engineStatus || !engineStatusText) {
    console.warn('[SIDEPANEL] Required DOM elements not found!');
    return;
  }
  
  if (status === 'IDLE') {
    engineStatus.style.display = 'none';
    return;
  }
  
  engineStatus.style.display = 'block';
  
  const statusMap = {
    COLLECTING: { text: 'Collecting...', showSpinner: true },
    CORRELATING: { text: 'Correlating...', showSpinner: true },
    AI_CALLING: { text: 'AI Analyzing...', showSpinner: true },
    AI_FALLBACK: { text: 'Using Fallback...', showSpinner: true },
    SUCCESS: { text: 'Complete', showSpinner: false },
    FAILED: { text: 'Failed', showSpinner: false }
  };
  
  const config = statusMap[status];
  if (config) {
    engineStatusText.textContent = config.text;
    if (statusSpinner) {
      statusSpinner.style.display = config.showSpinner ? 'block' : 'none';
    }
  }
  
  if (meta.latencyMs && statusLatency) {
    statusLatency.textContent = `${meta.latencyMs}ms`;
    statusLatency.style.display = 'inline-block';
  } else if (statusLatency) {
    statusLatency.style.display = 'none';
  }
  
  if (meta.source && statusSource) {
    statusSource.textContent = meta.source;
    statusSource.className = `source-badge source-${meta.source.toLowerCase()}`;
    statusSource.style.display = 'inline-block';
  } else if (statusSource) {
    statusSource.style.display = 'none';
  }
  
  if (status === 'FAILED' && meta.reason && statusReason) {
    statusReason.textContent = meta.reason;
    statusReason.style.display = 'block';
  } else if (statusReason) {
    statusReason.style.display = 'none';
  }
  
  if (status === 'SUCCESS') {
    setTimeout(() => {
      if (engineStatus) engineStatus.style.display = 'none';
    }, 3000);
  }
}

// Start cooldown timer
function startCooldownTimer(seconds) {
  if (cooldownInterval) clearInterval(cooldownInterval);
  
  let remaining = seconds;
  if (cooldownTimer) {
    cooldownTimer.textContent = `⏱️ Next insight in ${remaining}s`;
    cooldownTimer.style.display = 'block';
  }
  
  cooldownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      if (cooldownTimer) {
        cooldownTimer.textContent = '🔍 Watching for changes...';
      }
      clearInterval(cooldownInterval);
      updateSystemStatus('READY');
    } else {
      if (cooldownTimer) {
        cooldownTimer.textContent = `⏱️ Next insight in ${remaining}s`;
      }
    }
  }, 1000);
}

// Listen to messages from background script (viewer updates, transcripts, etc.)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const allowedTypes = ['VIEWER_COUNT', 'VIEWER_COUNT_UPDATE', 'TRANSCRIPT', 'INSIGHT', 'ACTION', 'FULL_RESET', 'SYSTEM_STATUS', 'ENGINE_STATUS', 'COUNTDOWN_UPDATE'];
  
  if (!message || !message.type || !allowedTypes.includes(message.type)) {
    return;
  }
  
  console.debug('[SIDEPANEL] Message received:', message.type, message);
  console.log('[Spikely Side Panel] Received message type:', message.type);
  aaiDebug('[AAI] Message received:', message.type);
  
  // Always process FULL_RESET regardless of system state
  if (message.type === 'FULL_RESET') {
    handleMessage(message);
    return;
  }
  
  // Gate ENGINE_STATUS on system started state
  if (message.type === 'ENGINE_STATUS') {
    console.debug('[ENGINE_STATUS:SP:RX]', message.status, message.meta);
    if (!isSystemStarted) {
      console.debug('[ENGINE_STATUS:SP:RX] suppressed (system not started)');
      return;
    }
    console.debug('[ENGINE_STATUS:SP:UI] calling updateEngineStatus', message.status, message.meta);
    updateEngineStatus(message.status, message.meta);
    return;
  }
  
  // Other messages only when system is started
  if (isSystemStarted) {
    handleMessage(message);
  }
  // No async response here; do not return true.
});

// Connect to WebSocket relay
function connectToWebSocket() {
  console.log('[Spikely Side Panel] Connecting to WebSocket...');
  
  try {
    wsConnection = new WebSocket('wss://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/websocket-relay/spikely');
    
    wsConnection.onopen = () => {
      console.log('[Spikely Side Panel] ✅ Connected');
      connectionStatus.textContent = 'Connected';
      connectionStatus.classList.add('connected');
      
      wsConnection.send(JSON.stringify({
        type: 'SIDEPANEL_READY',
        timestamp: Date.now()
      }));
    };
    
    wsConnection.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('[Spikely Side Panel] Error parsing message:', error);
      }
    };
    
    wsConnection.onclose = () => {
      console.log('[Spikely Side Panel] Disconnected');
      connectionStatus.textContent = 'Reconnecting...';
      connectionStatus.classList.remove('connected');
      
      // Reconnect after 2 seconds
      setTimeout(connectToWebSocket, 2000);
    };
    
    wsConnection.onerror = (error) => {
      console.error('[Spikely Side Panel] WebSocket error:', error);
    };
  } catch (error) {
    console.error('[Spikely Side Panel] Failed to connect:', error);
    setTimeout(connectToWebSocket, 2000);
  }
}

// Handle incoming messages
function handleMessage(message) {
  switch (message.type) {
    case 'VIEWER_COUNT_UPDATE':
      console.debug('[VC:SP:RX] VIEWER_COUNT_UPDATE', { count: message.count, delta: message.delta });
      // Fall through to VIEWER_COUNT handler
    case 'VIEWER_COUNT':
      console.debug('[VC:SP:RX] VIEWER_COUNT', { count: message.count, delta: message.delta });
      console.log('[Spikely Side Panel] VIEWER_COUNT payload:', { count: message.count, delta: message.delta });
      
      // Handle warm-up phase UI
      if (isSystemStarted && message.count === 0 && !firstCountReceived) {
        // During warm-up: show "Collecting..."
        updateEngineStatus('COLLECTING', {});
        isInWarmup = true;
      } else if (isSystemStarted && message.count > 0 && !firstCountReceived) {
        // First valid count: transition to IDLE
        firstCountReceived = true;
        isInWarmup = false;
        updateEngineStatus('IDLE', {});
      }
      
      updateViewerCount(message.count, message.delta || 0);
      break;
    case 'TRANSCRIPT':
      // Forward transcript through WebSocket to webapp
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'TRANSCRIPT',
          text: message.text,
          timestamp: message.timestamp,
          confidence: message.confidence,
          isFinal: message.isFinal
        }));
        console.log('[Spikely Side Panel] 📝 Forwarded transcript to webapp:', message.text.substring(0, 50));
      }
      break;
    case 'INSIGHT':
      console.log('[SIDEPANEL] 🎯 INSIGHT received:', {
        emotionalLabel: message.emotionalLabel,
        nextMove: message.nextMove,
        delta: message.delta,
        text: message.text?.substring(0, 50)
      });
      updateInsight(message);
      break;
    case 'ACTION':
      addAction(message);
      break;
    case 'THRESHOLD_UPDATE':
      // Forward threshold update to background script
      chrome.runtime.sendMessage({
        type: 'THRESHOLD_UPDATE',
        thresholds: message.thresholds
      });
      console.log('[Spikely Side Panel] Threshold update forwarded:', message.thresholds);
      break;
    case 'SYSTEM_STATUS':
      updateSystemStatus(message.status);
      break;
    case 'ENGINE_STATUS':
      updateEngineStatus(message.status, message.meta);
      break;
    case 'COUNTDOWN_UPDATE':
      console.log('[SIDEPANEL] ⏰ COUNTDOWN_UPDATE received:', message.seconds + 's');
      updateCountdown(message.seconds);
      break;
    case 'FULL_RESET':
      resetAllData();
      break;
  }
}

// Reset all data and UI to initial state
function resetAllData() {
  console.log('[Spikely Side Panel] Full reset initiated');
  
  // Reset warm-up state
  isInWarmup = true;
  firstCountReceived = false;
  
  // Clear actions arrays and render empty state
  winningActions = [];
  losingActions = [];
  renderActions();
  
  // Reset session timer
  sessionStartTime = Date.now();
  if (sessionTime) {
    sessionTime.textContent = '0:00';
  }
  
  // Clear insight display completely - reset to empty state
  if (insightContent) {
    insightContent.innerHTML = `
      <div class="insight-empty">
        <svg class="empty-icon-large" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
        <p class="empty-title">Analyzing viewer patterns</p>
        <p class="empty-subtitle">Speak to generate insights</p>
      </div>
    `;
  }
  
  // Reset viewer count display to 0 (not '---')
  if (viewerCount) viewerCount.textContent = '0';
  if (viewerDelta) {
    viewerDelta.textContent = '0';
    viewerDelta.className = 'viewer-delta neutral';
  }
  if (thresholdBadgeGray) {
    thresholdBadgeGray.className = 'threshold-badge';
  }
  
  // Hide test button on reset
  if (testInsightBtn) {
    testInsightBtn.style.display = 'none';
  }
  
  // Stop audio if capturing
  if (audioProcessor) {
    try {
      audioProcessor.stop();
    } catch (e) {
      console.log('[Spikely Side Panel] Audio stop error:', e);
    }
  }
  audioIsCapturing = false;
  isSystemStarted = false;
  if (startAudioBtn) {
    updateAudioState(false);  // Use centralized state update
    startAudioBtn.disabled = false;
  }
  
  console.log('[Spikely Side Panel] Full reset complete');
}

// UI-level sanitization safety net
function sanitizeForDisplay(text, maxWords, fallback) {
  if (!text || typeof text !== 'string') return fallback;
  
  const words = text.trim().split(/\s+/);
  
  if (words.length > maxWords) {
    const truncated = words.slice(0, maxWords).join(' ');
    console.log('[UI:SANITIZE]', {
      original: text.slice(0, 50),
      truncated,
      maxWords,
      actualWords: words.length
    });
    return truncated;
  }
  
  return text;
}

// Update viewer count with animation
function updateViewerCount(count, delta) {
  try {
    console.log('[Spikely Side Panel] updateViewerCount()', { count, delta });

    // Coerce and validate
    const n = Number(count);
    const d = Number(delta || 0);
    if (!Number.isFinite(n)) {
      console.warn('[Spikely Side Panel] Invalid count in VIEWER_COUNT:', count);
      return;
    }

    // Resolve elements defensively in case of hot-reloads
    const countEl = document.getElementById('viewerCount') || viewerCount;
    const deltaEl = document.getElementById('viewerDelta') || viewerDelta;
    const eyeEl = document.querySelector('.eye-icon') || eyeIcon;
    const cardEl = document.querySelector('.viewer-card') || viewerCard;
    const panelEl = document.getElementById('panelContainer') || panelContainer;

    if (!countEl || !deltaEl) {
      console.error('[Spikely Side Panel] Viewer elements not found');
      return;
    }

    countEl.textContent = n.toLocaleString();

    let signClass = 'neutral';
    if (d > 0) {
      deltaEl.textContent = `+${d}`;
      deltaEl.className = 'viewer-delta positive';
      signClass = 'positive';
      if (eyeEl) {
        eyeEl.classList.remove('negative', 'neutral');
        eyeEl.classList.add('positive');
      }
      updateSystemStatus('OBSERVING');
    } else if (d < 0) {
      deltaEl.textContent = d.toString();
      deltaEl.className = 'viewer-delta negative';
      signClass = 'negative';
      if (eyeEl) {
        eyeEl.classList.remove('positive', 'neutral');
        eyeEl.classList.add('negative');
      }
      updateSystemStatus('OBSERVING');
    } else {
      deltaEl.textContent = '0';
      deltaEl.className = 'viewer-delta neutral';
      if (eyeEl) {
        eyeEl.classList.remove('positive', 'negative');
        eyeEl.classList.add('neutral');
      }
    }
    
    // Update threshold badge color based on proximity to MIN_DELTA
    if (thresholdBadgeGray) {
      const absDelta = Math.abs(d);
      thresholdBadgeGray.className = 'threshold-badge';
      if (absDelta >= MIN_DELTA) {
        thresholdBadgeGray.classList.add('threshold-met');
      } else if (absDelta >= MIN_DELTA - 1) {
        thresholdBadgeGray.classList.add('threshold-near');
      }
    }

    // Update viewer card tint
    if (cardEl) {
      cardEl.classList.remove('positive', 'negative', 'neutral');
      cardEl.classList.add(signClass);
    }

    // Update app border state + flash
    if (panelEl) {
      panelEl.classList.remove('state-positive', 'state-negative', 'state-neutral');
      panelEl.classList.add(`state-${signClass}`);

      if (d !== 0) {
        const flashClass = signClass === 'positive' ? 'flash-positive' : 'flash-negative';
        panelEl.classList.remove('flash-positive', 'flash-negative');
        void panelEl.offsetWidth; // restart animation
        panelEl.classList.add(flashClass);
        setTimeout(() => panelEl.classList.remove(flashClass), 600);
      }
    }

    // Flash effect with CSS transition on the number
    countEl.style.transition = 'transform 0.2s ease';
    countEl.style.transform = 'scale(1.1)';
    setTimeout(() => {
      countEl.style.transform = 'scale(1)';
    }, 200);
  } catch (err) {
    console.error('[Spikely Side Panel] updateViewerCount error:', err);
  }
}

// Update insight
function updateInsight(data) {
  console.log('[Spikely Side Panel] 🎯 updateInsight called with:', {
    emotionalLabel: data.emotionalLabel,
    nextMove: data.nextMove,
    delta: data.delta,
    textLength: data.text?.length || 0
  });
  
  const delta = data.delta || 0;
  
  // Apply UI-level sanitization safety net
  const emotionalLabel = sanitizeForDisplay(data.emotionalLabel, 3, '✅ Neutral');
  const nextMove = sanitizeForDisplay(data.nextMove, 8, 'Keep momentum');
  const text = data.text || '';
  
  console.log('[Spikely Side Panel] 🎯 After sanitization:', {
    emotionalLabel,
    nextMove,
    delta
  });
  
  const isPositive = delta > 0;
  const arrowIcon = isPositive 
    ? '<svg class="tiny-arrow" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="8" x2="5" y2="2"></line><polyline points="2 5 5 2 8 5"></polyline></svg>'
    : '<svg class="tiny-arrow" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="2" x2="5" y2="8"></line><polyline points="8 5 5 8 2 5"></polyline></svg>';
  
  const deltaClass = isPositive ? 'positive' : 'negative';
  const deltaSign = isPositive ? '+' : '';
  
  const truncatedText = truncate(text, 60);
  const isTruncated = text.length > 60;
  
  insightContent.innerHTML = `
    <div class="insight-card">
      <div class="insight-delta ${deltaClass}">
        <span class="delta">${deltaSign}${delta}</span>
        ${arrowIcon}
      </div>
      ${nextMove ? `<div class="insight-next-move">${escapeHtml(nextMove)}</div>` : ''}
      ${text ? `<div class="insight-transcript" ${isTruncated ? `title="${escapeHtml(text)}"` : ''}>"${escapeHtml(truncatedText)}"</div>` : ''}
    </div>
  `;
  
  // Add expandable tooltip if text is truncated
  if (isTruncated && text) {
    const transcriptEl = insightContent.querySelector('.insight-transcript');
    if (transcriptEl) {
      addExpandableTooltip(transcriptEl, `"${text}"`);
    }
  }
  
  // Show cooldown timer with countdown
  const cooldownEl = document.getElementById('cooldownTimer');
  if (cooldownEl) {
    cooldownEl.style.display = 'flex';
    console.log('[COUNTDOWN] ⏰ Cooldown timer displayed');
  }
  
  // Start cooldown timer and update status
  startCooldownTimer(5);
  updateSystemStatus('ANALYZING');
}

// Add action to winning/losing list
function addAction(action) {
  const actionItem = {
    id: `${Date.now()}-${Math.random()}`,
    label: action.label || action.topic || 'Unknown',
    delta: action.delta,
    snippet: truncate(action.text || '', 40),
    time: formatActionTime(action.startTime, action.endTime),
    timestamp: Date.now()
  };
  
  if (action.delta > 0) {
    winningActions.push(actionItem);
    winningActions.sort((a, b) => b.delta - a.delta);
    winningActions = winningActions.slice(0, 10);
    renderActions('winning');
  } else {
    losingActions.push(actionItem);
    losingActions.sort((a, b) => a.delta - b.delta);
    losingActions = losingActions.slice(0, 10);
    renderActions('losing');
  }
}

// Render actions
function renderActions(type) {
  const actions = type === 'winning' ? winningActions : losingActions;
  const container = type === 'winning' ? winningActionsContainer : losingActionsContainer;
  
  if (actions.length === 0) {
    container.innerHTML = `<div class="actions-empty">No ${type} actions yet</div>`;
    return;
  }
  
  const html = actions.map(action => {
    const isPositive = action.delta > 0;
    const arrowSvg = isPositive 
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';
    
    // Use timestamp to format relative time
    const timeText = action.timestamp ? formatTimeAgo(action.timestamp) : action.time;
    const fullTimestamp = action.timestamp ? new Date(action.timestamp).toLocaleString() : '';
    
    return `
      <div class="action-item">
        <div class="action-header">
          <span class="action-arrow ${isPositive ? 'positive' : 'negative'}">${arrowSvg}</span>
          <span class="action-label">${escapeHtml(action.label)}</span>
          <span class="action-delta ${isPositive ? 'positive' : 'negative'}">${action.delta > 0 ? '+' : ''}${action.delta}</span>
        </div>
        <div class="action-snippet" title="${escapeHtml(action.snippet)}">"${escapeHtml(action.snippet)}"</div>
        <div class="action-time" data-timestamp="${action.timestamp || ''}" title="${fullTimestamp}">${timeText}</div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

// Format action time
function formatActionTime(startTime, endTime) {
  if (!startTime || !endTime) return 'Unknown duration';
  
  const start = new Date(startTime);
  const end = new Date(endTime);
  const duration = end - start;
  
  const seconds = Math.floor(duration / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const durationStr = minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  
  return `${timeStr} (${durationStr})`;
}

// Utility: Truncate text
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Wire tracking controls
function sendToActive(type, extra = {}) {
  try {
    chrome.runtime.sendMessage({ type, ...extra }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('[Spikely Side Panel] control send failed:', chrome.runtime.lastError);
      } else {
        console.log('[Spikely Side Panel] control sent:', type, res);
      }
    });
  } catch (e) {}
}

if (resetTrackingBtn) {
  resetTrackingBtn.addEventListener('click', () => {
    // Disable button and add pressing animation
    resetTrackingBtn.disabled = true;
    resetTrackingBtn.classList.add('pressing');
    
    // Stop system
    isSystemStarted = false;
    
    // Perform local reset for instant UI feedback
    resetAllData();
    
    // Send reset message to background script for full system reset
    sendToActive('RESET_TRACKING_ACTIVE_TAB');
    
    // Remove animation and re-enable after delay
    setTimeout(() => {
      resetTrackingBtn.classList.remove('pressing');
      resetTrackingBtn.disabled = false;
    }, 600);
  });
}

// Hook up test insight button
if (testInsightBtn) {
  testInsightBtn.addEventListener('click', () => {
    console.log('[TEST:INSIGHT:TRIGGERED]');
    
    const currentCount = parseInt(viewerCount.textContent.replace(/,/g, '')) || 0;
    const testDelta = 15;
    const newCount = currentCount + testDelta;
    
    console.log('[TEST:INSIGHT] Simulating viewer update:', {
      current: newCount,
      previous: currentCount,
      delta: testDelta
    });
    
    // Send synthetic VIEWER_COUNT_UPDATE message to background
    chrome.runtime.sendMessage({
      type: 'VIEWER_COUNT_UPDATE',
      count: newCount,
      delta: testDelta,
      timestamp: Date.now(),
      source: 'test_trigger'
    }, () => {
      void chrome.runtime.lastError;
    });
    
    console.log('[TEST:INSIGHT] Message sent');
    
    // Update local UI immediately for responsiveness
    updateViewerCount(newCount, testDelta);
  });
}

// Helper function for screen-share audio fallback
async function startAudioViaScreenShare() {
  startAudioBtn.textContent = 'Select tab to share...';
  try {
    // Fallback to getDisplayMedia
    console.log('[Spikely] getDisplayMedia fallback invoked');
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: true // Some browsers require video to enable tab audio; we'll immediately stop it
    });
    
    console.log('[Spikely] stream.getAudioTracks():', stream.getAudioTracks().length);
    const audioTracks = stream.getAudioTracks();
    
    if (audioTracks.length === 0) {
      throw new Error('No audio tracks in shared stream. Make sure "Share tab audio" was checked.');
    }
    
    // Log track settings for debugging
    const settings = audioTracks[0].getSettings();
    console.log('[Spikely] audio settings:', JSON.stringify({
      sampleRate: settings.sampleRate,
      channelCount: settings.channelCount,
      deviceId: settings.deviceId
    }));
    
    startAudioBtn.textContent = 'Connecting...';
    
    // Fetch v3 token from secure relay
    console.log('🎙️ [ASSEMBLYAI v3] Step 1: Requesting temporary token...');
    aaiDebug('request_token', 'v3:start');
    const tokenResponse = await fetch('https://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/realtime-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'assembly' })
    });
    console.log(`🎙️ [ASSEMBLYAI v3] Token response status: ${tokenResponse.status}`);
    aaiDebug('token_status', String(tokenResponse.status));
    
    if (!tokenResponse.ok) {
      let errorDetails = '';
      try {
        const errorData = await tokenResponse.json();
        if (errorData.upstream) {
          errorDetails = ` - Upstream ${errorData.upstream.status}: ${errorData.upstream.body}`;
        }
      } catch {}
      console.error('🎙️ [ASSEMBLYAI v3] ❌ Token fetch failed:', tokenResponse.status, errorDetails);
      throw new Error(`Token fetch failed: ${tokenResponse.status}${errorDetails || ' - Check ASSEMBLYAI_API_KEY in backend'}`);
    }
    
    const config = await tokenResponse.json();
    console.log('🎙️ [ASSEMBLYAI v3] ✅ Token received', Object.keys(config));
    aaiDebug('token_received', 'v3:ok');
    
    // Use the correct URL key from the function response
    let websocketUrl = config.url || config.realtime_url || config.websocket_url;
    if (!websocketUrl) {
      throw new Error('Token response missing websocket URL');
    }
    // Ensure sample_rate parameter is present
    if (!/sample_rate=/.test(websocketUrl)) {
      websocketUrl += (websocketUrl.includes('?') ? '&' : '?') + 'sample_rate=16000';
    }
    console.log('🎙️ [ASSEMBLYAI v3] WebSocket URL:', websocketUrl.substring(0, 80) + '...');
    aaiDebug('ws_connecting', 'v3:token-auth');
    
    // If getDisplayMedia forced a video track, stop it (we only need audio)
    stream.getVideoTracks().forEach(t => {
      console.log('🎙️ [ASSEMBLYAI v3] Stopping video track (not needed)');
      t.stop();
    });
    
    // Initialize audio processor with stream -> AssemblyAI v3
    console.log('🎙️ [ASSEMBLYAI v3] Step 3: Connecting to Universal Streaming...');
    audioProcessor = new AudioProcessor();
    await audioProcessor.initialize(stream, websocketUrl, aaiDebug);
    console.log('🎙️ [ASSEMBLYAI v3] ✅ Audio processor initialized');
    audioProcessor.printDebugChecklist();
    aaiDebug('ws_connected', 'v3:streaming');
    console.log('🎙️ [ASSEMBLYAI v3] ✅ Ready to transcribe audio!');
    
    audioIsCapturing = true;
    updateAudioState(true);  // Use centralized state update
    startAudioBtn.disabled = false;
    if (testInsightBtn) testInsightBtn.style.display = 'inline-block';
    console.debug('[TEST:INSIGHT:UI] Button visible (fallback)');
    console.log('[Spikely] ✅ System started via screen-share audio');
    
  } catch (err) {
    console.error('[Spikely] Screen-share audio error:', err);
    alert(`Audio capture failed: ${err.message}\n\nPlease try again and make sure to check "Share tab audio".`);
    updateAudioState(false);  // Use centralized state update
    startAudioBtn.disabled = false;
    isSystemStarted = false;
    throw err;
  }
}

// Wire start/stop button to control entire system
if (startAudioBtn) {
  startAudioBtn.addEventListener('click', async () => {
    if (!isSystemStarted) {
      // Start entire system
      console.debug('[AUDIO:SP:TX] START_AUDIO_CAPTURE');
      startAudioBtn.disabled = true;
      startAudioBtn.textContent = 'Starting...';
      
      // Enable system
      isSystemStarted = true;
      
      // Start viewer tracking
      sendToActive('START_VIEWER_TRACKING');
      
      // Start audio capture
      chrome.runtime.sendMessage({ type: 'START_AUDIO_CAPTURE' }, async (response) => {
        console.debug('[AUDIO:SP:RX]', response);
        
        if (response?.success) {
      audioIsCapturing = true;
      updateAudioState(true);  // Use centralized state update
      startAudioBtn.disabled = false;
      console.log('[Spikely Side Panel] ✅ System started');
      
      // Show test button when system starts
      if (testInsightBtn) {
        testInsightBtn.style.display = 'inline-block';
      }
    } else {
          const errMsg = response?.error || 'Unknown error';
          console.warn('[AUDIO:SP:RX] Failed:', errMsg);
          
          // Check if fallback is appropriate
          if (response?.requiresFallback) {
            console.log('[AUDIO:SP:UI] Auto-falling back to screen share');
            try {
              await startAudioViaScreenShare();
            } catch (fallbackErr) {
              // Error already handled in helper
            }
          } else {
            // Show friendly inline error (unrecoverable)
            console.debug('[AUDIO:SP:UI] Showing inline error:', errMsg);
            alert('⚠️ Audio Capture Not Available\n\n' + errMsg);
            updateAudioState(false);  // Use centralized state update
            startAudioBtn.disabled = false;
            isSystemStarted = false;
          }
        }
      });
    } else {
      // Stop entire system
      console.debug('[AUDIO:SP:TX] STOP_AUDIO_CAPTURE');
      isSystemStarted = false;
      
      // Stop viewer tracking
      sendToActive('STOP_VIEWER_TRACKING');
      
      // Stop audio capture
      if (audioProcessor) {
        // Stop fallback audio processor
        audioProcessor.stop();
        audioProcessor = null;
        audioIsCapturing = false;
        updateAudioState(false);  // Use centralized state update
        console.log('[Spikely] ✅ System stopped');
        
        // Hide test button when system stops
        if (testInsightBtn) {
          testInsightBtn.style.display = 'none';
        }
      } else {
        // Stop normal tabCapture audio
        chrome.runtime.sendMessage({ type: 'STOP_AUDIO_CAPTURE' }, (response) => {
          audioIsCapturing = false;
          updateAudioState(false);  // Use centralized state update
          console.log('[Spikely] ✅ System stopped');
          
          // Hide test button when system stops
          if (testInsightBtn) {
            testInsightBtn.style.display = 'none';
          }
        });
      }
    }
  });
}

// Initialize
console.log('[Spikely Side Panel] Initializing...');

// Don't auto-request viewer data or start polling - wait for user to click Start
// Everything stays at zero until "Start" is clicked

// Test harness for ENGINE_STATUS rendering
window.__spikelyTestEngineStatus = function(sequence = ['COLLECTING', 'CORRELATING', 'AI_CALLING', 'SUCCESS', 'IDLE']) {
  console.log('[TEST] Running ENGINE_STATUS test sequence:', sequence);
  return new Promise((resolve) => {
    let index = 0;
    const interval = setInterval(() => {
      if (index >= sequence.length) {
        clearInterval(interval);
        console.log('[TEST] ENGINE_STATUS test complete');
        resolve();
        return;
      }
      
      const status = sequence[index];
      let meta = {};
      
      // Add appropriate meta for each status
      if (status === 'AI_FALLBACK') {
        meta = { reason: 'Test fallback' };
      } else if (status === 'SUCCESS') {
        meta = { source: 'Test' };
      } else if (status === 'FAILED') {
        meta = { reason: 'Test failure' };
      }
      
      console.debug('[TEST:ENGINE_STATUS]', status, meta);
      updateEngineStatus(status, meta);
      index++;
    }, 600);
  });
};

// Keyboard shortcut: Alt+E triggers test
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'e') {
    console.log('[TEST] Alt+E pressed, running engine status test');
    window.__spikelyTestEngineStatus();
  }
});

// Initialize UI features with retry logic
console.log('[UI:INIT] Starting UI initialization...');
initializeUIFeatures();

connectToWebSocket();
