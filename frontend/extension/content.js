(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      console.log('[Spikely] Content script already initialized - skipping reinjection');
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
  } catch (_) {}

// ============================================================================
// TIKTOK VIEWER COUNT STARTUP FIX - Configuration
// ============================================================================
const TT_CONFIG = {
  WARMUP_MS: 1500,                    // Warm-up duration
  WARMUP_MIN_TICKS: 3,                // Minimum mutation ticks before completion
  EMIT_MIN_INTERVAL_MS: 500,          // Rate limit: emit at most every 500ms (2Hz)
  MAX_REASONABLE_VIEWERS: 500000,     // Range guard upper bound
  OUTLIER_SIGMA: 5,                   // Outlier detection: median ± 5*MAD
  MUTATION_DEBOUNCE_MS: 200,          // Debounce mutation observer
  NODE_RESELECT_TIMEOUT_MS: 2500,     // Re-run selector if no samples after 2.5s
  STUCK_WARNING_TIMEOUT_MS: 5000,     // Emit "OBSERVING" status if stuck after 5s
  ZERO_GATE_CONSECUTIVE: 2,           // Require 2 consecutive zeros
  ZERO_GATE_DURATION_MS: 1000,        // Over at least 1s duration
  CONSECUTIVE_OVERRIDE: 2,            // Accept outlier if 2 consecutive samples agree
  CONSECUTIVE_TOLERANCE: 50           // Within 50 viewers
};

// Platform detection
function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('tiktok.com')) return 'tiktok';
  if (hostname.includes('twitch.tv')) return 'twitch';
  if (hostname.includes('kick.com')) return 'kick';
  if (hostname.includes('youtube.com')) return 'youtube';
  return 'unknown';
}

// Platform-specific selectors
const PLATFORM_SELECTORS = {
  tiktok: [
    '.P4-Regular.text-UIText3', // New TikTok digit container
    'div:has(> span.inline-flex.justify-center)', // Container with digit spans
    '[data-e2e="live-viewer-count"]',
    '[data-e2e="room-stats-viewer-count"]',
    '.live-viewer-count',
    'svg[data-e2e="eye-icon"] + span',
  ],
  twitch: [
    '[data-a-target="animated-channel-viewers-count"]',
    '.live-indicator-container span',
    'p[data-test-selector="viewer-count"]',
  ],
  kick: [
    '[class*="viewer-count"]',
    '[class*="ViewerCount"]',
    'div[class*="stats"] span:first-child',
  ],
  youtube: [
    'span.ytp-live-badge + span',
    '.ytp-live .ytp-time-current',
    'ytd-video-primary-info-renderer #count',
  ]
};

let currentViewerCount = 0;
let detectionInterval = null;
let isTracking = false;
let lastSentCount = 0;
let lastSentAt = 0;
const platform = detectPlatform();

// Cached element + DOM observer to survive SPA/DOM changes
let cachedViewerEl = null;
let cachedContainer = null;
let domObserver = null;

// Warm-up state
let warmupSamples = [];
let warmupStartTime = 0;
let warmupMutationTicks = 0;
let isWarmupComplete = false;
let warmupReselectTimer = null;
let warmupStuckTimer = null;

// Post-warm-up validation state
let warmupMedian = 0;
let warmupMAD = 0;
let lastValidSamples = [];
let lastEmittedCount = 0;
let lastEmittedAt = 0;
let lastZeroAt = 0;
let consecutiveZeros = 0;

// Navigation tracking
let lastPathname = window.location.pathname;

// Silence noisy unhandled rejections when extension reloads
try {
  window.addEventListener('unhandledrejection', (e) => {
    const reason = String(e.reason || '');
    if (
      reason.includes('Extension context invalidated') ||
      reason.includes('Could not establish connection') ||
      reason.includes('Receiving end does not exist')
    ) {
      e.preventDefault();
    }
  });
} catch (_) {}


console.log(`[Spikely] Detected platform: ${platform}`);

// ============================================================================
// Multi-tier DOM Selector Strategy (TikTok-specific hardening)
// ============================================================================
function queryViewerNode() {
  // Reuse if still in DOM
  if (cachedViewerEl && document.contains(cachedViewerEl)) return cachedViewerEl;

  // TikTok-specific 3-tier selector strategy
  if (platform === 'tiktok') {
    // Tier 1: Label-driven lookup (find "Viewers" text)
    const labels = Array.from(document.querySelectorAll('div,span,strong,p')).filter(
      el => el.textContent && el.textContent.trim().toLowerCase() === 'viewers'
    );
    for (const label of labels) {
      const parent = label.parentElement || label.closest('div,section,li');
      const digitContainer = parent?.querySelector('div:has(> span.inline-flex.justify-center)')
        || parent?.querySelector('.P4-Regular.text-UIText3')
        || parent?.nextElementSibling;
      if (digitContainer) {
        const parsed = normalizeAndParse(digitContainer);
        if (parsed !== null && parsed > 0) {
          console.debug('[TT:SEL] ✓ Tier 1: Label-driven match');
          cachedViewerEl = digitContainer;
          cachedContainer = digitContainer.closest('div,section,header') || document.body;
          return digitContainer;
        }
      }
    }

    // Tier 2: Priority selector sweep
    const selectors = PLATFORM_SELECTORS[platform] || [];
    for (let i = 0; i < selectors.length; i++) {
      const element = document.querySelector(selectors[i]);
      if (element && element.textContent?.trim()) {
        const parsed = normalizeAndParse(element);
        if (parsed !== null && parsed > 0) {
          console.debug(`[TT:SEL] ✓ Tier 2: Selector[${i}] matched`);
          cachedViewerEl = element;
          cachedContainer = element.closest('div,section,header') || document.body;
          return element;
        }
      }
    }

    // Tier 3: Heuristic fallback (numeric node near eye icon)
    const candidates = document.querySelectorAll('span, div, p, strong');
    for (const node of candidates) {
      const text = node.textContent?.trim() || '';
      if (!/^[\d,\.]+[kKmM]?$/.test(text)) continue;

      let ctxNode = node.parentElement;
      let depth = 0;
      let hasContext = false;
      while (ctxNode && depth < 3 && !hasContext) {
        const ctxText = ctxNode.textContent?.toLowerCase() || '';
        if (ctxText.includes('viewer') || ctxText.includes('watching')) hasContext = true;
        if (ctxNode.querySelector('svg[data-e2e="eye-icon"], [data-icon="eye"], svg[aria-label*="eye" i]')) hasContext = true;
        ctxNode = ctxNode.parentElement;
        depth++;
      }

      if (hasContext) {
        const parsed = normalizeAndParse(node);
        if (parsed !== null && parsed > 0) {
          console.debug('[TT:SEL] ✓ Tier 3: Heuristic match');
          cachedViewerEl = node;
          cachedContainer = node.closest('div,section,header') || document.body;
          return node;
        }
      }
    }
    console.debug('[TT:SEL] ✗ No match found');
    return null;
  }

  // Non-TikTok platforms: simple selector sweep
  const selectors = PLATFORM_SELECTORS[platform] || [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent?.trim()) {
      cachedViewerEl = element;
      return element;
    }
  }

  return null;
}

// Legacy alias for non-TikTok platforms
function findViewerElement() {
  return queryViewerNode();
}


// ============================================================================
// Robust Text Normalization & Parsing (with K/M suffix support)
// ============================================================================
function normalizeAndParse(textOrElement) {
  if (!textOrElement) return null;
  
  // Handle Element objects (TikTok split-digit format)
  if (textOrElement instanceof Element) {
    const el = textOrElement;

    // Try split-digit parsing first (TikTok renders each digit separately)
    let best = null;
    const digitSpans = el.querySelectorAll('span.inline-flex.justify-center');
    if (digitSpans.length > 0) {
      const digits = Array.from(digitSpans)
        .map(span => span.textContent.trim())
        .join('')
        .replace(/[·\s,]/g, '');

      const suffixMatch = (el.textContent || '').toLowerCase().match(/([km])/);
      // FIX: Use parseFloat instead of parseInt to preserve decimals (1.2K → 1200, not 1000)
      let parsed = parseFloat(digits);
      if (!isNaN(parsed) && parsed > 0) {
        if (suffixMatch?.[1] === 'k') parsed *= 1000;
        if (suffixMatch?.[1] === 'm') parsed *= 1000000;
        // Round to nearest integer for final count
        best = Math.round(parsed);
        console.debug(`[TT:PARSE] Split-digit: "${digits}" + suffix "${suffixMatch?.[1] || 'none'}" → ${best}`);
      }
    }

    // Also try full text parse
    const fullText = (el.textContent || '').trim().toLowerCase();
    const fullParsed = parseTextToCount(fullText);
    
    return best !== null ? best : fullParsed;
  }
  
  // Handle string text
  return parseTextToCount(String(textOrElement));
}

function parseTextToCount(text) {
  const cleaned = text.toLowerCase().replace(/[\s,·]/g, '');
  const match = cleaned.match(/([\d.]+)([km])?/);
  if (!match) {
    console.debug(`[TT:PARSE] ✗ No match: "${text}"`);
    return null;
  }
  
  let num = parseFloat(match[1]);
  const suffix = match[2];
  
  if (suffix === 'k') num *= 1000;
  if (suffix === 'm') num *= 1000000;
  
  const result = Math.floor(num);
  
  if (!isFinite(result) || isNaN(result) || result < 0) {
    console.debug(`[TT:PARSE] ✗ Invalid: "${text}" → NaN/Inf/negative`);
    return null;
  }
  
  console.debug(`[TT:PARSE] ✓ "${text}" → ${result}`);
  return result;
}

// Legacy alias for backward compatibility
function parseViewerCount(textOrElement) {
  const result = normalizeAndParse(textOrElement);
  return result !== null ? result : 0;
}

// Utility: safe message sender to avoid "Extension context invalidated"
function safeSendMessage(payload) {
  try {
    if (!chrome?.runtime?.id) return;
    chrome.runtime.sendMessage(payload, () => {
      void chrome.runtime.lastError; // consume without throwing
    });
  } catch (_e) {
    // ignore context invalidation
  }
}

// ============================================================================
// Statistical Helpers (Median, MAD, Outlier Detection)
// ============================================================================
function calculateMedian(arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function calculateMAD(arr, median) {
  if (!arr || arr.length === 0) return 0;
  const deviations = arr.map(x => Math.abs(x - median));
  return calculateMedian(deviations);
}

function isOutlier(value, median, mad, sigma = TT_CONFIG.OUTLIER_SIGMA) {
  if (mad === 0) return false; // All samples identical
  return Math.abs(value - median) > sigma * mad;
}

// ============================================================================
// Warm-Up Phase Logic
// ============================================================================
function startWarmup() {
  console.debug('[TT:WARMUP] Starting warm-up phase...');
  warmupSamples = [];
  warmupStartTime = Date.now();
  warmupMutationTicks = 0;
  isWarmupComplete = false;
  
  // Arm re-select timer (if no samples after 2.5s, re-run selector)
  if (warmupReselectTimer) clearTimeout(warmupReselectTimer);
  warmupReselectTimer = setTimeout(() => {
    if (!isWarmupComplete && warmupSamples.length === 0) {
      console.debug('[TT:WARMUP] No samples after 2.5s, re-running selector...');
      cachedViewerEl = null;
      cachedContainer = null;
      const node = queryViewerNode();
      if (node) setupMutationObserver();
    }
  }, TT_CONFIG.NODE_RESELECT_TIMEOUT_MS);
  
  // Arm stuck warning timer (after 5s, emit OBSERVING status)
  if (warmupStuckTimer) clearTimeout(warmupStuckTimer);
  warmupStuckTimer = setTimeout(() => {
    if (!isWarmupComplete) {
      console.debug('[TT:WARMUP] Still stuck after 5s, emitting OBSERVING status');
      safeSendMessage({
        type: 'SYSTEM_STATUS',
        status: 'OBSERVING',
        debug: '[TikTok] Waiting for viewer node…'
      });
    }
  }, TT_CONFIG.STUCK_WARNING_TIMEOUT_MS);
}

function addWarmupSample(count) {
  const elapsed = Date.now() - warmupStartTime;
  warmupSamples.push(count);
  warmupMutationTicks++;
  
  console.debug(`[TT:WARMUP] Sample #${warmupSamples.length}: ${count} (${elapsed}ms)`);
  
  // Check completion criteria
  const timeOk = elapsed >= TT_CONFIG.WARMUP_MS;
  const ticksOk = warmupMutationTicks >= TT_CONFIG.WARMUP_MIN_TICKS;
  const samplesOk = warmupSamples.length >= 2;
  
  if (timeOk && ticksOk && samplesOk) {
    completeWarmup();
  }
}

function completeWarmup() {
  if (isWarmupComplete) return;
  isWarmupComplete = true;
  
  // Clear timers
  if (warmupReselectTimer) clearTimeout(warmupReselectTimer);
  if (warmupStuckTimer) clearTimeout(warmupStuckTimer);
  
  // Calculate stats
  warmupMedian = calculateMedian(warmupSamples);
  warmupMAD = calculateMAD(warmupSamples, warmupMedian);
  
  console.debug(`[TT:WARMUP] Complete: ${warmupSamples.length} samples, median=${warmupMedian}, MAD=${warmupMAD}`);
  
  // Emit first valid sample
  if (warmupMedian > 0) {
    emitViewerCount(warmupMedian, 0);
  }
}

// ============================================================================
// Post-Warm-Up Validation & Rate-Limited Emission
// ============================================================================
function processValidatedSample(count) {
  if (!isWarmupComplete) {
    // Still in warm-up, collect sample
    addWarmupSample(count);
    return;
  }
  
  const now = Date.now();
  
  // Zero-gate: Don't emit 0 as first value unless 2 consecutive over 1s
  if (count === 0) {
    if (lastEmittedCount === 0) {
      consecutiveZeros++;
      if (consecutiveZeros >= TT_CONFIG.ZERO_GATE_CONSECUTIVE && 
          now - lastZeroAt >= TT_CONFIG.ZERO_GATE_DURATION_MS) {
        console.debug('[TT:GUARD] ✓ Accepted: zero (consecutive gate passed)');
        emitViewerCount(0, -lastEmittedCount);
      } else {
        console.debug('[TT:GUARD] ✗ Rejected: zero-gate');
      }
    } else {
      lastZeroAt = now;
      consecutiveZeros = 1;
      console.debug('[TT:GUARD] ✗ Rejected: zero-gate (first zero)');
    }
    return;
  }
  consecutiveZeros = 0;
  
  // Range guard: 1 <= count <= MAX_REASONABLE_VIEWERS
  if (count < 1 || count > TT_CONFIG.MAX_REASONABLE_VIEWERS) {
    console.debug(`[TT:GUARD] ✗ Rejected: range (${count} outside bounds)`);
    return;
  }
  
  // Outlier guard with 2-consecutive override
  if (isOutlier(count, warmupMedian, warmupMAD)) {
    lastValidSamples.push(count);
    if (lastValidSamples.length > 3) lastValidSamples.shift();
    
    // Check if last 2 samples agree (within tolerance)
    if (lastValidSamples.length >= TT_CONFIG.CONSECUTIVE_OVERRIDE) {
      const recent = lastValidSamples.slice(-TT_CONFIG.CONSECUTIVE_OVERRIDE);
      const allClose = recent.every((v, i, arr) => 
        i === 0 || Math.abs(v - arr[i - 1]) <= TT_CONFIG.CONSECUTIVE_TOLERANCE
      );
      
      if (allClose) {
        console.debug(`[TT:GUARD] ✓ Accepted: outlier override (${TT_CONFIG.CONSECUTIVE_OVERRIDE} consecutive)`);
        // Update median/MAD to new level
        warmupMedian = count;
        warmupMAD = calculateMAD(lastValidSamples, warmupMedian);
        emitViewerCount(count, count - lastEmittedCount);
        return;
      }
    }
    
    console.debug(`[TT:GUARD] ✗ Rejected: outlier (${count}, median=${warmupMedian}, MAD=${warmupMAD})`);
    return;
  }
  
  // Rate limiting: max 2Hz
  if (now - lastEmittedAt < TT_CONFIG.EMIT_MIN_INTERVAL_MS) {
    console.debug('[TT:GUARD] ⏱ Throttled');
    return;
  }
  
  // Accept & emit
  console.debug(`[TT:GUARD] ✓ Accepted: ${count}`);
  lastValidSamples.push(count);
  if (lastValidSamples.length > 3) lastValidSamples.shift();
  emitViewerCount(count, count - lastEmittedCount);
}

function emitViewerCount(count, delta) {
  const now = Date.now();
  lastEmittedCount = count;
  lastEmittedAt = now;
  currentViewerCount = count;
  
  const payload = {
    type: 'VIEWER_COUNT_UPDATE',
    platform,
    count,
    delta,
    timestamp: now,
    confidence: 1.0
  };
  
  safeSendMessage(payload);
  console.log(`[Spikely] ${platform} viewer count: ${count} (${delta >= 0 ? '+' : ''}${delta})`);
}

// ============================================================================
// Targeted MutationObserver (with debounce)
// ============================================================================
let mutationDebounceTimer = null;

function setupMutationObserver() {
  if (domObserver) {
    try { domObserver.disconnect(); } catch (_) {}
  }
  
  if (!cachedContainer) {
    console.debug('[TT:MUT] No container to observe');
    return;
  }
  
  try {
    domObserver = new MutationObserver((mutations) => {
      console.debug(`[TT:MUT] Tick #${warmupMutationTicks + 1}, ${mutations.length} mutations`);
      
      // Debounce handler
      if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(() => {
        handleMutation();
      }, TT_CONFIG.MUTATION_DEBOUNCE_MS);
    });
    
    domObserver.observe(cachedContainer, {
      childList: true,
      characterData: true,
      subtree: true
    });
    
    console.debug('[TT:MUT] Observer armed on container');
  } catch (e) {
    console.debug('[TT:MUT] Failed to setup observer:', e);
  }
}

function handleMutation() {
  // Check if node still attached
  if (!cachedViewerEl || !document.contains(cachedViewerEl)) {
    console.debug('[TT:MUT] Node detached, re-querying...');
    cachedViewerEl = null;
    cachedContainer = null;
    const node = queryViewerNode();
    if (node) setupMutationObserver();
    return;
  }
  
  // Parse current value
  const parsed = normalizeAndParse(cachedViewerEl);
  if (parsed !== null) {
    processValidatedSample(parsed);
  }
}

// ============================================================================
// SPA Navigation Detection & Recovery
// ============================================================================
function detectNavigation() {
  const currentPathname = window.location.pathname;
  if (currentPathname !== lastPathname) {
    console.debug(`[TT:NAV] Route change detected: ${lastPathname} → ${currentPathname}`);
    lastPathname = currentPathname;
    
    // Tear down observer
    if (domObserver) {
      try { domObserver.disconnect(); } catch (_) {}
      domObserver = null;
    }
    
    // Clear cached nodes
    cachedViewerEl = null;
    cachedContainer = null;
    
    // Restart warm-up after brief delay
    setTimeout(() => {
      if (isTracking) {
        startWarmup();
        const node = queryViewerNode();
        if (node) setupMutationObserver();
      }
    }, 500);
  }
}


// ============================================================================
// Start Tracking (Initialize Warm-Up + Observer)
// ============================================================================
function startTracking() {
  if (isTracking) {
    console.debug('[VC:INIT] Already tracking, ignoring duplicate START');
    return;
  }
  
  isTracking = true;
  console.debug('[VC:INIT] startTracking() invoked', { platform, isTracking: true });
  console.log('[Spikely] Starting viewer count tracking...');
  
  // TikTok: Use warm-up + observer with retry loop for node discovery
  if (platform === 'tiktok') {
    let retryCount = 0;
    const maxRetries = 10;
    
    const tryDiscoverNode = () => {
      const node = queryViewerNode();
      
      if (node) {
        const testParse = normalizeAndParse(node);
        if (testParse !== null) {
          console.debug('[VC:READY] Viewer node found', { 
            cached: !!cachedViewerEl, 
            retries: retryCount,
            initialValue: testParse 
          });
          
          // Setup observer first
          setupMutationObserver();
          
          // Force initial DOM read after 100ms to seed warm-up
          setTimeout(() => {
            console.debug('[VC:INIT] Forcing initial DOM read');
            handleMutation();
          }, 100);
          
          // Start warm-up after observer is ready
          startWarmup();
          
          return true; // Success
        }
      }
      
      // Node not found or invalid, retry
      retryCount++;
      if (retryCount <= maxRetries) {
        console.debug('[VC:INIT] Retry #' + retryCount + ': searching for viewer node...');
        setTimeout(tryDiscoverNode, 300);
      } else {
        // After max retries, keep trying in background (non-blocking)
        console.warn('[VC:INIT] Node not found after ' + maxRetries + ' attempts, continuing background retries');
        setTimeout(tryDiscoverNode, 1000);
      }
      
      return false; // Keep retrying
    };
    
    // Start discovery
    tryDiscoverNode();
    
    // SPA navigation detection
    if (detectionInterval) clearInterval(detectionInterval);
    detectionInterval = setInterval(detectNavigation, 1000);
    
    // Heartbeat: re-emit every 5s for panel sync
    setInterval(() => {
      if (isTracking && lastEmittedCount > 0) {
        const now = Date.now();
        if (now - lastEmittedAt > 5000) {
          emitViewerCount(lastEmittedCount, 0);
        }
      }
    }, 5000);
    
    return;
  }
  
  // Non-TikTok platforms: Use legacy polling
  if (detectionInterval) return;
  
  detectionInterval = setInterval(() => {
    try {
      let element = (cachedViewerEl && document.contains(cachedViewerEl))
        ? cachedViewerEl
        : findViewerElement();
      if (element && element !== cachedViewerEl) cachedViewerEl = element;

      if (element) {
        const count = parseViewerCount(element);
        const text = element.textContent?.trim() || '';

        let shouldSend = false;
        let delta = 0;

        if (count > 0) {
          if (count !== currentViewerCount) {
            const previousCount = currentViewerCount;
            currentViewerCount = count;
            delta = previousCount > 0 ? count - previousCount : 0;
            shouldSend = true;
          } else if (Date.now() - lastSentAt > 5000) {
            delta = 0;
            shouldSend = true;
          }
        }

        if (shouldSend) {
          const payload = {
            type: 'VIEWER_COUNT_UPDATE',
            platform,
            count,
            delta,
            timestamp: Date.now(),
            rawText: text,
            confidence: 1.0
          };

          safeSendMessage(payload);
          lastSentAt = Date.now();
          lastSentCount = count;

          console.log(`[Spikely] ${platform} viewer count: ${count} (${delta >= 0 ? '+' : ''}${delta})`);
        }
      } else if (Date.now() % 10000 < 100) {
        console.warn('[Spikely] No viewer count element found');
      }
    } catch (_e) {
      // Never let polling crash
    }
  }, 500);
}

function stopTracking() {
  console.debug('[VC:CT:STOP] stopTracking invoked');
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  isTracking = false;
  console.log('[Spikely] Stopped viewer count tracking');
  
  // Clear warm-up state
  warmupSamples = [];
  isWarmupComplete = false;
  if (warmupReselectTimer) clearTimeout(warmupReselectTimer);
  if (warmupStuckTimer) clearTimeout(warmupStuckTimer);
  if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
  
  // Disconnect observer
  try { domObserver?.disconnect(); domObserver = null; } catch (_) {}
}

// Clear all state so switching lives can't glitch
function clearState() {
  try { clearInterval(detectionInterval); } catch (_) {}
  detectionInterval = null;
  isTracking = false;
  currentViewerCount = 0;
  lastSentCount = 0;
  lastSentAt = 0;
  lastEmittedCount = 0;
  lastEmittedAt = 0;
  cachedViewerEl = null;
  cachedContainer = null;
  
  // Clear warm-up state
  warmupSamples = [];
  isWarmupComplete = false;
  if (warmupReselectTimer) clearTimeout(warmupReselectTimer);
  if (warmupStuckTimer) clearTimeout(warmupStuckTimer);
  if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
  
  try { domObserver?.disconnect(); } catch (_) {}
  domObserver = null;
}

function resetTracking() {
  console.debug('[VC:CT:RESET] resetTracking invoked', { stack: (new Error()).stack?.split('\n').slice(0,3).join(' | ') });
  console.log('[Spikely] Resetting viewer count tracking - STOPPING tracking completely');
  stopTracking();
  // Send final zero count update
  safeSendMessage({
    type: 'VIEWER_COUNT_UPDATE',
    count: 0,
    delta: 0,
    platform,
    timestamp: Date.now()
  });
}

// Listen for commands from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TRACKING') {
    if (message?.reset) {
      resetTracking();
    } else {
      startTracking();
    }
    console.debug('[VC:CT:ACK] STARTED', { platform, isTracking: true });
    sendResponse({ type: 'ACK_START', platform, isTracking: true });
  } else if (message.type === 'STOP_TRACKING') {
    stopTracking();
    sendResponse({ success: true });
  } else if (message.type === 'RESET_TRACKING') {
    resetTracking();
    sendResponse({ success: true, platform });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ isTracking, platform, currentCount: currentViewerCount });
  } else if (message.type === 'PING') {
    console.debug('[VC:CT:ACK] PONG', { platform });
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
  // All responses above are synchronous; no need to return true.
});

// Content script loaded - no auto-start, wait for explicit START_TRACKING
console.log('[Spikely] Content script loaded');
// Stop timers cleanly on navigation to avoid context errors
window.addEventListener('pagehide', () => { try { stopTracking(); } catch (_) {} });
window.addEventListener('beforeunload', () => { try { stopTracking(); } catch (_) {} });
})();
