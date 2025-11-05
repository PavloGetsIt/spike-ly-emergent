(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      console.log('[Spikely] Content script already initialized - skipping reinjection');
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
  } catch (_) {}

// ============================================================================
// TIKTOK VIEWER COUNT STARTUP FIX - Configuration (v025 - INSTANT MODE)
// ============================================================================
const TT_CONFIG = {
  WARMUP_MS: 500,                     // Warm-up duration (REDUCED from 1500ms for instant display)
  WARMUP_MIN_TICKS: 1,                // Minimum mutation ticks (REDUCED from 3 for speed)
  EMIT_MIN_INTERVAL_MS: 500,          // Rate limit: emit at most every 500ms (2Hz)
  MAX_REASONABLE_VIEWERS: 500000,     // Range guard upper bound
  OUTLIER_SIGMA: 5,                   // Outlier detection: median ± 5*MAD
  MUTATION_DEBOUNCE_MS: 100,          // Debounce mutation observer (REDUCED from 200ms)
  NODE_RESELECT_TIMEOUT_MS: 2500,     // Re-run selector if no samples after 2.5s
  STUCK_WARNING_TIMEOUT_MS: 3000,     // Emit "OBSERVING" status if stuck (REDUCED from 5000ms)
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

// Platform-specific selectors (ENHANCED - comprehensive fallback chain)
const PLATFORM_SELECTORS = {
  tiktok: [
    // Modern TikTok Live selectors (2025)
    '[data-e2e="live-audience-count"]',
    '[data-e2e*="viewer"]',
    '[data-e2e*="audience"]',
    '[class*="LiveAudience"]',
    '[class*="AudienceCount"]',
    '[class*="ViewerCount"]',
    
    // Legacy selectors
    '.P4-Regular.text-UIText3',
    'div:has(> span.inline-flex.justify-center)',
    '[class*="viewer"]',
    
    // Generic fallbacks by text content
    'span:contains("viewers")',
    'div:contains("viewers")',
    '[aria-label*="viewer"]',
    '[aria-label*="watching"]'
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

// Enhanced TikTok viewer detection with dynamic node re-querying
function queryViewerNode() {
  // Always re-query the node (do not store static reference for ephemeral DOM)
  cachedViewerEl = null;

  if (platform === 'tiktok') {
    
    // TIER 1: Enhanced 2025 TikTok selectors
    const tier1Selectors = [
      '[data-e2e="live-room-viewers"]',
      '[data-testid="live-room-viewers"]',
      '[data-e2e*="live-audience"]',
      '[data-e2e*="viewer-count"]',
      '[data-testid*="viewer"]',
      '[class*="LiveViewerCount"]',
      '[class*="AudienceCount"]'
    ];
    
    for (const selector of tier1Selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const parsed = normalizeAndParse(element);
        if (parsed !== null && parsed > 0) {
          console.log(`[VIEWER:PAGE] value=${parsed}`);
          cachedViewerEl = element;
          cachedContainer = element.closest('div[data-e2e*="live"], section, [class*="live"]') || element.parentElement;
          return element;
        }
      }
    }
    
    // TIER 2: Aria-label with enhanced regex
    const ariaElements = document.querySelectorAll('[aria-label*="view"], [aria-label*="watching"], [aria-label*="audience"]');
    for (const element of ariaElements) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        // Extract number with enhanced regex: [0-9,\.KM]+
        const match = ariaLabel.match(/([0-9,]+(?:\.[0-9]+)?[KkMm]?)/);
        if (match) {
          const countText = match[1].replace(/,/g, '');
          const parsed = normalizeAndParse(countText);
          if (parsed !== null && parsed > 0) {
            console.log(`[VIEWER:PAGE] value=${parsed}`);
            cachedViewerEl = element;
            cachedContainer = element.closest('div[data-e2e*="live"], section, [class*="live"]') || element.parentElement;
            return element;
          }
        }
      }
    }
    
    // TIER 3: Widget container traversal (find smallest container)
    const widgetContainers = document.querySelectorAll('div[data-e2e*="live"], section[class*="live"], [class*="viewer-info"]');
    for (const container of widgetContainers) {
      const numberSpans = container.querySelectorAll('span, div, strong');
      for (const span of numberSpans) {
        const text = span.textContent?.trim();
        if (text && /^[0-9,]+(?:\.[0-9]+)?[KkMm]?$/.test(text)) {
          const containerText = container.textContent.toLowerCase();
          if (containerText.includes('viewer') || containerText.includes('watching') || 
              containerText.includes('audience') || containerText.includes('live')) {
            const parsed = normalizeAndParse(text);
            if (parsed !== null && parsed > 100) {
              console.log(`[VIEWER:PAGE] value=${parsed}`);
              cachedViewerEl = span;
              cachedContainer = container; // Use widget container for observation
              return span;
            }
          }
        }
      }
    }
    
    // Throttled "not found" logging (max 1 per 15s)
    const now = Date.now();
    if (now - lastNotFoundLog > 15000) {
      console.log('[VIEWER:PAGE] node missing (throttled warning)');
      lastNotFoundLog = now;
    }
    
    return null;
  }

  return null;
}

// Add throttling for "not found" logs
let lastNotFoundLog = 0;
        }
      }
    }

    // Tier 2: Priority selector sweep
    const selectors = PLATFORM_SELECTORS[platform] || [];
    console.log('[VC:DEBUG] 🎯 Trying', selectors.length, 'priority selectors...');
    
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      const element = document.querySelector(selector);
      
      if (element && element.textContent?.trim()) {
        const text = element.textContent.trim();
        const parsed = normalizeAndParse(element);
        console.log(`[VC:DEBUG] Selector ${i + 1}: "${selector}" → "${text}" → ${parsed}`);
        
        if (parsed !== null && parsed > 0) {
          console.log('[VC:DEBUG] ✅ TIER 2 SUCCESS: Found via selector', i + 1, 'count =', parsed);
          cachedViewerEl = element;
          return element;
        }
      } else {
        console.log(`[VC:DEBUG] Selector ${i + 1}: "${selector}" → NOT FOUND`);
      }
    }

    console.log('[VC:DEBUG] ❌ All methods failed - no viewer count found');
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
  
  // Non-TikTok platforms: simple selector sweep
  const platformSelectors = PLATFORM_SELECTORS[platform] || [];
  for (const selector of platformSelectors) {
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
  
  // Use Math.round for better accuracy (1.2K → 1200, not 1000)
  const result = Math.round(num);
  
  if (!isFinite(result) || isNaN(result) || result < 0) {
    console.debug(`[TT:PARSE] ✗ Invalid: "${text}" → NaN/Inf/negative`);
    return null;
  }
  
  console.debug(`[TT:PARSE] ✓ "${text}" → ${result}`);
  return result;
}

// Run parser validation tests on load
function validateParserFix() {
  const tests = [
    { input: "953", expected: 953 },
    { input: "1K", expected: 1000 },
    { input: "1.0K", expected: 1000 },
    { input: "1.2K", expected: 1200 },
    { input: "1.5K", expected: 1500 },
    { input: "1.9K", expected: 1900 },
    { input: "15K", expected: 15000 },
    { input: "15.3K", expected: 15300 },
    { input: "1M", expected: 1000000 },
    { input: "1.5M", expected: 1500000 },
    { input: "1.2m", expected: 1200000 },
    { input: "2.5k", expected: 2500 }
  ];
  
  console.log('[TT:PARSE] 🧪 Running parser validation tests...');
  let passed = 0;
  let failed = 0;
  
  tests.forEach(({ input, expected }) => {
    const result = parseTextToCount(input);
    if (result === expected) {
      console.log(`[TT:PARSE] ✅ "${input}" → ${result} (expected ${expected})`);
      passed++;
    } else {
      console.error(`[TT:PARSE] ❌ "${input}" → ${result} (expected ${expected})`);
      failed++;
    }
  });
  
  console.log(`[TT:PARSE] 🧪 Test Results: ${passed}/${tests.length} passed, ${failed} failed`);
  return failed === 0;
}

// Legacy alias for backward compatibility
function parseViewerCount(textOrElement) {
  const result = normalizeAndParse(textOrElement);
  return result !== null ? result : 0;
}

// Hardened MV3 port lifecycle with auto-reconnect
let viewerCountPort = null;
let portRetryAttempts = 0;
let portReconnectTimer = null;
const MAX_PORT_RETRIES = 5;

// Initialize persistent port connection with enhanced lifecycle management
function initializeViewerCountPort() {
  try {
    if (viewerCountPort) {
      try {
        viewerCountPort.disconnect();
      } catch (e) {
        // Port already disconnected
      }
    }
    
    viewerCountPort = chrome.runtime.connect({ name: 'viewer-count-port' });
    portRetryAttempts = 0;
    
    // All ports must register port.onDisconnect with auto-reconnect
    viewerCountPort.onDisconnect.addListener(() => {
      console.log('[VIEWER:PAGE] port disconnected, reconnecting...');
      viewerCountPort = null;
      
      // Auto-reconnect with exponential backoff (max 5 attempts)
      if (portRetryAttempts < MAX_PORT_RETRIES) {
        portRetryAttempts++;
        const delay = Math.min(1000 * Math.pow(2, portRetryAttempts - 1), 8000);
        
        if (portReconnectTimer) clearTimeout(portReconnectTimer);
        portReconnectTimer = setTimeout(() => {
          initializeViewerCountPort();
        }, delay);
      } else {
        console.log('[VIEWER:PAGE] port max retries reached, fallback mode');
        portRetryAttempts = 0; // Reset for future attempts
      }
    });
    
    console.log('[VIEWER:PAGE] port connected');
  } catch (error) {
    // Never throw raw errors on disconnect
    console.log('[VIEWER:PAGE] port connection failed:', error.message);
    viewerCountPort = null;
  }
}

// Enhanced safe message sender - never throws raw errors
function safeSendMessage(payload) {
  try {
    // Try persistent port first
    if (viewerCountPort) {
      try {
        viewerCountPort.postMessage(payload);
        return;
      } catch (error) {
        // Don't log expected disconnection errors
        if (!error.message.includes('disconnected') && !error.message.includes('closed')) {
          console.log('[VIEWER:PAGE] port send failed:', error.message);
        }
        viewerCountPort = null;
      }
    }
    
    // Fallback to runtime sendMessage
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          // Only log unexpected errors
          if (!errorMsg.includes('Extension context invalidated') && 
              !errorMsg.includes('Could not establish connection') &&
              !errorMsg.includes('disconnected')) {
            console.log('[VIEWER:PAGE] runtime message error:', errorMsg);
          }
        }
      });
    }
  } catch (error) {
    // Silent fail for context invalidation
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
  console.log(`[VIEWER:PAGE] ${platform} viewer count: ${count} (${delta >= 0 ? '+' : ''}${delta})`);
}

// ============================================================================
// Enhanced MutationObserver that rebinds on node disappearance
// ============================================================================
let mutationDebounceTimer = null;
let mutationRetryCount = 0;
let mutationRetryTimer = null;

function setupMutationObserver() {
  if (domObserver) {
    try { domObserver.disconnect(); } catch (_) {}
  }
  
  if (!cachedContainer) {
    // Retry with reduced attempts to avoid infinite loops
    if (mutationRetryCount < 5) {
      mutationRetryCount++;
      if (mutationRetryTimer) clearTimeout(mutationRetryTimer);
      mutationRetryTimer = setTimeout(() => {
        const node = queryViewerNode();
        if (node && cachedContainer) {
          mutationRetryCount = 0;
          setupMutationObserver();
        }
      }, 1000);
    }
    return;
  }
  
  try {
    domObserver = new MutationObserver((mutations) => {
      // Check if cached node still exists, rebind if disappeared
      if (cachedViewerEl && !document.contains(cachedViewerEl)) {
        console.log('[VIEWER:PAGE] node disappeared, rebinding observer');
        const node = queryViewerNode();
        if (node && cachedContainer) {
          setupMutationObserver(); // Rebind to new container
        }
        return;
      }
      
      // Detect numeric changes via text OR aria-label regex
      let shouldUpdate = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          shouldUpdate = true;
          break;
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'aria-label') {
          const newAriaLabel = mutation.target.getAttribute('aria-label');
          if (newAriaLabel && /[0-9,\.KM]+/.test(newAriaLabel)) {
            shouldUpdate = true;
            break;
          }
        }
      }
      
      if (shouldUpdate) {
        if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = setTimeout(() => {
          handleMutation();
        }, TT_CONFIG.MUTATION_DEBOUNCE_MS);
      }
    });
    
    // Observe only the widget container (not document.body)
    domObserver.observe(cachedContainer, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label']
    });
    
    console.log('[VIEWER:PAGE] observer bound to widget container');
    mutationRetryCount = 0;
  } catch (e) {
    console.log('[VIEWER:PAGE] observer setup failed:', e.message);
  }
}

function handleMutation() {
  // Always re-query the node on mutation (dynamic DOM changes)
  const node = queryViewerNode();
  if (node) {
    const parsed = normalizeAndParse(node);
    if (parsed !== null) {
      processValidatedSample(parsed);
    }
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
    console.debug('[VIEWER:PAGE] Already tracking, ignoring duplicate START');
    return;
  }
  
  isTracking = true;
  console.debug('[VIEWER:PAGE] startTracking() invoked', { platform, isTracking: true });
  console.log('[VIEWER:PAGE] Starting viewer count tracking...');
  
  // Initialize persistent port for reliable messaging
  initializeViewerCountPort();
  
  // TikTok: Use warm-up + observer with retry loop for node discovery
  if (platform === 'tiktok') {
    let retryCount = 0;
    const maxRetries = 10;
    
    const tryDiscoverNode = () => {
      const node = queryViewerNode();
      
      if (node) {
        const testParse = normalizeAndParse(node);
        if (testParse !== null) {
          console.debug('[VIEWER:PAGE] ✅ Viewer node found', { 
            cached: !!cachedViewerEl, 
            retries: retryCount,
            initialValue: testParse 
          });
          
          // ⚡ INSTANT SEND: Send initial value immediately (don't wait for warm-up)
          if (testParse > 0) {
            safeSendMessage({
              type: 'VIEWER_COUNT',
              count: testParse,
              delta: 0,
              timestamp: Date.now(),
              source: 'initial_instant'
            });
            console.log(`[VIEWER:PAGE] ⚡ Sent initial count immediately: ${testParse} (no warm-up wait)`);
          }
          
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
    console.log('[VIEWER:PAGE] ✅ START_TRACKING received', { platform, isTracking: true });
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
    console.log('[VIEWER:PAGE] PING received', { platform });
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
  // All responses above are synchronous; no need to return true.
});

// Content script loaded - initialize port and wait for START_TRACKING
console.log('[VIEWER:PAGE] Content script loaded - Version 2.1.1-LVT-HARDENED');

// Run parser validation tests
validateParserFix();

// Initialize port connection (but don't start tracking yet)
initializeViewerCountPort();

// Enhanced cleanup on navigation to prevent port leaks
function cleanup() {
  try {
    stopTracking();
    if (viewerCountPort) {
      viewerCountPort.disconnect();
      viewerCountPort = null;
    }
    if (portReconnectTimer) {
      clearTimeout(portReconnectTimer);
      portReconnectTimer = null;
    }
    if (mutationRetryTimer) {
      clearTimeout(mutationRetryTimer);
      mutationRetryTimer = null;
    }
  } catch (_) {}
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);
})();
