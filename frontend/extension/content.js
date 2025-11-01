(function(){
  // PAGE CONSOLE LOGGING - User must see these logs
  console.log('%c🚀🚀🚀 [SPIKELY] CONTENT SCRIPT LOADING... 🚀🚀🚀', 'color: green; font-weight: bold; font-size: 16px');
  console.log('[SPIKELY] URL:', window.location.href);
  console.log('[SPIKELY] DOM ready state:', document.readyState);
  
  try {
    // Check if already fully initialized (has both flag AND functions)
    const hasFlag = !!window.__SPIKELY_CONTENT_ACTIVE__;
    const hasFunctions = typeof window.__SPIKELY_TEST__ === 'function';
    
    if (hasFlag && hasFunctions) {
      console.warn('[Spikely] ⚠️ Content script already fully initialized - skipping reinjection');
      return;
    }
    
    if (hasFlag && !hasFunctions) {
      console.warn('[Spikely] ⚠️ Flag set but functions missing - forcing re-initialization');
    }
    
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
    console.log('[Spikely] ✅ Marking script as active');
    
    // DOM READINESS CHECK - Wait for DOM before viewer detection
    if (document.readyState === 'loading') {
      console.log('[SPIKELY] 📄 DOM still loading, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', initializeAfterDOM);
    } else {
      console.log('[SPIKELY] 📄 DOM already ready, initializing immediately');
      initializeAfterDOM();
    }
    
  } catch (e) {
    console.error('[Spikely] ❌ Error in initialization:', e);
  }
  
  function initializeAfterDOM() {
    console.log('[SPIKELY] 🏁 DOM ready, starting initialization...');
    
    // Send handshake to background script
    sendContentScriptReady();
    
    // Start viewer detection with retry logic
    startViewerDetectionWithRetry();
  }

// ============================================================================
// VARIABLE DECLARATIONS - Must be before any function calls
// ============================================================================

// Platform detection - declare before use
function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('tiktok.com')) return 'tiktok';
  if (hostname.includes('twitch.tv')) return 'twitch';
  if (hostname.includes('kick.com')) return 'kick';
  if (hostname.includes('youtube.com')) return 'youtube';
  return 'unknown';
}

const platform = detectPlatform();

// Viewer tracking state
let currentViewerCount = 0;
let detectionInterval = null;
let isTracking = false;
let lastSentCount = 0;
let lastSentAt = 0;

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

// Chat state
let chatContainer = null;
let chatObserver = null;
let chatBuffer = [];
let lastChatEmitTime = 0;
let seenCommentIds = new Set();
let chatMutationDebounce = null;
let chatRetryInterval = null;
let isChatTracking = false;

// Retry state
let viewerDetectionRetries = 0;
const MAX_VIEWER_RETRIES = 60; // 60 * 500ms = 30 seconds max
let viewerRetryInterval = null;
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

const platform = detectPlatform();

// HANDSHAKE - Send ready message to background script
function sendContentScriptReady() {
  try {
    console.log('[SPIKELY] 📡 Sending CONTENT_SCRIPT_READY handshake...');
    chrome.runtime.sendMessage({
      type: 'CONTENT_SCRIPT_READY',
      platform,
      url: window.location.href,
      timestamp: Date.now()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[SPIKELY] ⚠️ Handshake failed:', chrome.runtime.lastError.message);
      } else {
        console.log('[SPIKELY] ✅ Handshake confirmed by background script');
      }
    });
  } catch (e) {
    console.error('[SPIKELY] ❌ Handshake error:', e);
  }
}

// RETRY LOGIC - Keep trying to find viewer element until found
let viewerDetectionRetries = 0;
const MAX_VIEWER_RETRIES = 60; // 60 * 500ms = 30 seconds max
let viewerRetryInterval = null;

function startViewerDetectionWithRetry() {
  console.log('[SPIKELY] 🔍 Starting viewer detection with retry logic...');
  
  function attemptViewerDetection() {
    const node = queryViewerNode();
    
    if (node) {
      const parsed = normalizeAndParse(node);
      console.log('[SPIKELY] ✅ VIEWER DETECTION SUCCESS:', parsed, 'retries:', viewerDetectionRetries);
      
      // Clear retry interval
      if (viewerRetryInterval) {
        clearInterval(viewerRetryInterval);
        viewerRetryInterval = null;
      }
      
      // Start mutation observer for continuous tracking
      setupMutationObserver();
      
      // Send initial count
      if (parsed > 0) {
        emitViewerCount(parsed, 0);
      }
      
      return true;
    } else {
      viewerDetectionRetries++;
      console.log('[SPIKELY] ⏳ Viewer element not found, retry', viewerDetectionRetries + '/' + MAX_VIEWER_RETRIES);
      
      if (viewerDetectionRetries >= MAX_VIEWER_RETRIES) {
        console.warn('[SPIKELY] ❌ Viewer detection failed after', MAX_VIEWER_RETRIES, 'retries');
        if (viewerRetryInterval) {
          clearInterval(viewerRetryInterval);
          viewerRetryInterval = null;
        }
        return false;
      }
      
      return false;
    }
  }
  
  // Try once immediately
  if (!attemptViewerDetection()) {
    // If failed, start retry interval
    viewerRetryInterval = setInterval(attemptViewerDetection, 500);
  }
}

// Platform-specific selectors (COMPREHENSIVE 2025 UPDATE)
const PLATFORM_SELECTORS = {
  tiktok: [
    // 2025 TikTok Live selectors (most common patterns)
    '[data-e2e="live-viewer-count"]',
    '[data-e2e*="viewer"]',
    '[class*="LiveViewerCount"]',
    '[class*="ViewerCount"]',
    '[class*="live-viewer"]',
    '[class*="viewer-count"]',
    
    // Original working selectors
    '.P4-Regular.text-UIText3',
    'div:has(> span.inline-flex.justify-center)',
    
    // Generic class-based patterns
    '[class*="viewer"]',
    '[class*="Viewer"]',
    
    // Aria labels for accessibility
    '[aria-label*="viewer"]',
    '[aria-label*="Viewer"]',
    
    // Role-based selectors
    '[role="status"]:has-text(/\d+[KkMm]?/)',
    
    // Generic fallbacks
    'span:has-text(/^\d+\.?\d*[KkMm]?$/)',
    'div:has-text(/^\d+\.?\d*[KkMm]?$/)'
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

let lastPathname = window.location.pathname;

// Handshake function
function sendContentScriptReady() {
  try {
    console.log('[SPIKELY] 📡 Sending CONTENT_SCRIPT_READY handshake...');
    chrome.runtime.sendMessage({
      type: 'CONTENT_SCRIPT_READY',
      platform,
      url: window.location.href,
      timestamp: Date.now()
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[SPIKELY] ⚠️ Handshake failed:', chrome.runtime.lastError.message);
      } else {
        console.log('[SPIKELY] ✅ Handshake confirmed by background script');
      }
    });
  } catch (e) {
    console.error('[SPIKELY] ❌ Handshake error:', e);
  }
}

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

  console.log('[VC:DEBUG] 🔍 Starting TikTok viewer count search...');
  console.log('[VC:DEBUG] 🌐 Current URL:', window.location.href);
  
  if (platform === 'tiktok') {
    
    // STRATEGY 1: Look for "Viewers" text and find associated number
    console.log('[VC:DEBUG] 🎯 Strategy 1: Searching for "Viewers" label...');
    const viewerLabels = Array.from(document.querySelectorAll('*')).filter(el => {
      const text = el.textContent?.trim() || '';
      // Match "Viewers", "viewer", "Viewer" as standalone word or with bullet
      return /\bviewers?\b/i.test(text) && text.length < 30;
    });
    
    console.log('[VC:DEBUG] Found', viewerLabels.length, 'potential "Viewers" labels');
    
    for (const label of viewerLabels) {
      console.log('[VC:DEBUG]   Label text:', label.textContent?.substring(0, 50));
      
      // Check the label's parent and siblings for numbers
      const parent = label.parentElement;
      if (!parent) continue;
      
      // Check all children and siblings within the parent
      const candidates = [
        ...Array.from(parent.children),
        parent.nextElementSibling,
        parent.previousElementSibling,
        label.nextElementSibling,
        label.previousElementSibling
      ].filter(Boolean);
      
      for (const candidate of candidates) {
        const text = candidate.textContent?.trim() || '';
        // Look for numbers with K/M suffix (like 2.1K, 953, etc.)
        if (/^[\d,.]+[KkMm]?$/.test(text)) {
          const parsed = normalizeAndParse(text);
          if (parsed !== null && parsed > 0) {
            console.log('[VC:DEBUG] ✅ STRATEGY 1 SUCCESS: Found count near "Viewers":', text, '→', parsed);
            cachedViewerEl = candidate;
            cachedContainer = parent;
            return candidate;
          }
        }
      }
      
      // Also check the label itself if it contains the count
      const fullText = label.textContent?.trim() || '';
      const match = fullText.match(/Viewers?\s*[•·:]\s*([\d,.]+[KkMm]?)/i);
      if (match) {
        const countText = match[1];
        const parsed = normalizeAndParse(countText);
        if (parsed !== null && parsed > 0) {
          console.log('[VC:DEBUG] ✅ STRATEGY 1 SUCCESS: Count in same element:', countText, '→', parsed);
          // Create wrapper for just the count portion
          cachedViewerEl = label;
          cachedContainer = parent;
          return label;
        }
      }
    }
    
    console.log('[VC:DEBUG] ❌ Strategy 1 failed');
    
    // STRATEGY 2: Brute force - find ALL numbers that look like viewer counts
    console.log('[VC:DEBUG] 🎯 Strategy 2: Brute force number search...');
    const allElements = Array.from(document.querySelectorAll('*'));
    const numberCandidates = [];
    
    for (const element of allElements) {
      const text = element.textContent?.trim() || '';
      // Only look at elements with short text (likely a count)
      if (text.length > 10) continue;
      
      // Match standalone numbers with optional K/M suffix
      if (/^[\d,.]+[KkMm]?$/.test(text)) {
        const parsed = normalizeAndParse(text);
        if (parsed !== null && parsed >= 0) {
          // Get context from parent
          const parentText = element.parentElement?.textContent?.toLowerCase() || '';
          const hasViewerContext = /viewer|watching|live|audience/i.test(parentText);
          
          numberCandidates.push({
            element,
            parsed,
            text,
            hasViewerContext,
            parentClasses: element.parentElement?.className || '',
            classes: element.className || ''
          });
        }
      }
    }
    
    console.log('[VC:DEBUG] Found', numberCandidates.length, 'number candidates');
    
    // Prioritize candidates with viewer context
    numberCandidates.sort((a, b) => {
      // First by viewer context
      if (a.hasViewerContext && !b.hasViewerContext) return -1;
      if (!a.hasViewerContext && b.hasViewerContext) return 1;
      // Then by value (higher counts more likely to be viewers)
      return b.parsed - a.parsed;
    });
    
    // Log top 5 candidates
    console.log('[VC:DEBUG] Top number candidates:');
    for (let i = 0; i < Math.min(5, numberCandidates.length); i++) {
      const c = numberCandidates[i];
      console.log(`[VC:DEBUG]   ${i+1}. "${c.text}" → ${c.parsed} (context: ${c.hasViewerContext}, classes: ${c.classes.substring(0, 30)})`);
    }
    
    // Try the best candidate
    if (numberCandidates.length > 0) {
      const best = numberCandidates[0];
      if (best.parsed > 0 && best.hasViewerContext) {
        console.log('[VC:DEBUG] ✅ STRATEGY 2 SUCCESS: Using best candidate:', best.text, '→', best.parsed);
        cachedViewerEl = best.element;
        cachedContainer = best.element.parentElement;
        return best.element;
      }
    }
    
    console.log('[VC:DEBUG] ❌ Strategy 2 failed');
    
    // STRATEGY 3: Try priority selectors
    console.log('[VC:DEBUG] 🎯 Strategy 3: Priority selectors...');
    const selectors = PLATFORM_SELECTORS[platform] || [];
    console.log('[VC:DEBUG] Trying', selectors.length, 'priority selectors...');
    
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      try {
        const element = document.querySelector(selector);
        
        if (element && element.textContent?.trim()) {
          const text = element.textContent.trim();
          const parsed = normalizeAndParse(element);
          console.log(`[VC:DEBUG] Selector ${i + 1}: "${selector}" → "${text}" → ${parsed}`);
          
          if (parsed !== null && parsed > 0) {
            console.log('[VC:DEBUG] ✅ STRATEGY 3 SUCCESS: Found via selector', i + 1, 'count =', parsed);
            cachedViewerEl = element;
            cachedContainer = element.parentElement;
            return element;
          }
        } else {
          console.log(`[VC:DEBUG] Selector ${i + 1}: "${selector}" → NOT FOUND`);
        }
      } catch (e) {
        console.log(`[VC:DEBUG] Selector ${i + 1}: "${selector}" → ERROR:`, e.message);
      }
    }

    console.log('[VC:DEBUG] ❌ All strategies failed - no viewer count found');
    console.log('[VC:DEBUG] 💡 TIP: Open TikTok Live in another tab and inspect the viewer count element');
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

// DEPRECATED: Legacy method for backward compatibility
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
  const cleaned = text.toLowerCase().replace(/[\s,·•]/g, '');
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
          
          // ⚡ INSTANT SEND: Send initial value immediately (don't wait for warm-up)
          if (testParse > 0) {
            safeSendMessage({
              type: 'VIEWER_COUNT',
              count: testParse,
              delta: 0,
              timestamp: Date.now(),
              source: 'initial_instant'
            });
            console.log(`[VC:INSTANT] ⚡ Sent initial count immediately: ${testParse} (no warm-up wait)`);
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
      // Also start chat tracking
      startChatTracking();
    }
    console.debug('[VC:CT:ACK] STARTED', { platform, isTracking: true, isChatTracking: true });
    sendResponse({ type: 'ACK_START', platform, isTracking: true, isChatTracking: true });
  } else if (message.type === 'STOP_TRACKING') {
    stopTracking();
    stopChatTracking();
    sendResponse({ success: true });
  } else if (message.type === 'RESET_TRACKING') {
    resetTracking();
    stopChatTracking();
    sendResponse({ success: true, platform });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ 
      isTracking, 
      isChatTracking,
      platform, 
      currentCount: currentViewerCount,
      chatBufferSize: chatBuffer.length
    });
  } else if (message.type === 'PING') {
    console.debug('[VC:CT:ACK] PONG', { platform });
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
  // All responses above are synchronous; no need to return true.
});


// ============================================================================
// TIKTOK LIVE CHAT STREAM DETECTION - v1.0
// ============================================================================

const CHAT_CONFIG = {
  BUFFER_DURATION_MS: 30000,           // 30 second rolling buffer
  MAX_BUFFER_SIZE: 200,                // Max comments to keep in memory
  EMIT_BATCH_INTERVAL_MS: 2000,        // Send batches every 2s
  MUTATION_DEBOUNCE_MS: 100,           // Debounce chat mutations
  DUPLICATE_WINDOW_MS: 1000,           // Ignore duplicates within 1s
  RETRY_FIND_INTERVAL_MS: 3000         // Retry finding chat container every 3s
};

// Chat state
let chatContainer = null;
let chatObserver = null;
let chatBuffer = [];
let lastChatEmitTime = 0;
let seenCommentIds = new Set();
let chatMutationDebounce = null;
let chatRetryInterval = null;
let isChatTracking = false;

// Platform-specific chat selectors
const CHAT_SELECTORS = {
  tiktok: {
    // Container selectors (most to least specific)
    containers: [
      '[data-e2e="live-chat-list"]',
      '[data-e2e*="chat"]',
      '[class*="LiveChatList"]',
      '[class*="ChatList"]',
      '[class*="live-chat"]',
      '[class*="chat-list"]',
      '[class*="comment-list"]',
      'div[class*="Chat"][class*="Container"]'
    ],
    // Comment item selectors
    comments: [
      '[data-e2e="live-chat-item"]',
      '[data-e2e*="comment"]',
      '[class*="ChatItem"]',
      '[class*="CommentItem"]',
      '[class*="chat-item"]',
      '[class*="comment-item"]'
    ],
    // Username selectors
    usernames: [
      '[data-e2e="comment-username"]',
      '[class*="Username"]',
      '[class*="username"]',
      '[class*="user-name"]'
    ],
    // Comment text selectors
    text: [
      '[data-e2e="comment-text"]',
      '[class*="CommentText"]',
      '[class*="comment-text"]',
      '[class*="chat-text"]',
      '[class*="message-text"]'
    ]
  },
  twitch: {
    containers: ['.chat-scrollable-area__message-container'],
    comments: ['.chat-line__message'],
    usernames: ['.chat-author__display-name'],
    text: ['.text-fragment']
  },
  youtube: {
    containers: ['yt-live-chat-item-list-renderer'],
    comments: ['yt-live-chat-text-message-renderer'],
    usernames: ['#author-name'],
    text: ['#message']
  }
};

/**
 * Find the chat container element
 */
function findChatContainer() {
  if (chatContainer && document.contains(chatContainer)) {
    return chatContainer;
  }

  console.log('[CHAT:DEBUG] 🔍 Searching for chat container...');
  
  const selectors = CHAT_SELECTORS[platform];
  if (!selectors) {
    console.log('[CHAT:DEBUG] ❌ No chat selectors for platform:', platform);
    return null;
  }

  // Try each container selector
  for (let i = 0; i < selectors.containers.length; i++) {
    const selector = selectors.containers[i];
    try {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`[CHAT:DEBUG] ✅ Found chat container with selector ${i + 1}: "${selector}"`);
        chatContainer = element;
        return element;
      }
    } catch (e) {
      console.log(`[CHAT:DEBUG] Selector ${i + 1} error: "${selector}"`, e.message);
    }
  }

  // Fallback: Look for elements with many children (likely chat list)
  console.log('[CHAT:DEBUG] 🎯 Trying heuristic search...');
  const allDivs = Array.from(document.querySelectorAll('div'));
  
  for (const div of allDivs) {
    const text = div.textContent?.toLowerCase() || '';
    const childCount = div.children.length;
    
    // Look for containers with:
    // - Many children (10+)
    // - Chat-related text in nearby elements
    // - Scrollable (overflow-y)
    if (childCount >= 10) {
      const style = window.getComputedStyle(div);
      const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll';
      
      if (isScrollable) {
        console.log('[CHAT:DEBUG] 📦 Found potential chat container (scrollable, ' + childCount + ' children)');
        chatContainer = div;
        return div;
      }
    }
  }

  console.log('[CHAT:DEBUG] ❌ No chat container found');
  return null;
}

/**
 * Parse a comment element to extract data
 */
function parseCommentElement(element) {
  const selectors = CHAT_SELECTORS[platform];
  if (!selectors) return null;

  const comment = {
    id: null,
    username: 'Unknown',
    text: '',
    timestamp: Date.now(),
    element: element
  };

  // Try to find username
  for (const selector of selectors.usernames) {
    try {
      const usernameEl = element.querySelector(selector);
      if (usernameEl && usernameEl.textContent?.trim()) {
        comment.username = usernameEl.textContent.trim();
        break;
      }
    } catch (_) {}
  }

  // Try to find comment text
  for (const selector of selectors.text) {
    try {
      const textEl = element.querySelector(selector);
      if (textEl && textEl.textContent?.trim()) {
        comment.text = textEl.textContent.trim();
        break;
      }
    } catch (_) {}
  }

  // Fallback: Use full text content if specific text not found
  if (!comment.text && element.textContent) {
    const fullText = element.textContent.trim();
    // Remove username from text if it's at the start
    comment.text = fullText.replace(comment.username, '').trim();
    // Remove any leading colons or separators
    comment.text = comment.text.replace(/^[:：\s]+/, '').trim();
  }

  // Generate ID from username + text + rough timestamp
  const roughTime = Math.floor(comment.timestamp / 1000); // Second precision
  comment.id = `${comment.username}_${comment.text.substring(0, 20)}_${roughTime}`;

  // Validate we have meaningful data
  if (!comment.text || comment.text.length < 1) {
    return null;
  }

  return comment;
}

/**
 * Check if comment is duplicate
 */
function isDuplicateComment(commentId) {
  if (seenCommentIds.has(commentId)) {
    return true;
  }
  
  seenCommentIds.add(commentId);
  
  // Clean up old IDs (older than duplicate window)
  if (seenCommentIds.size > 500) {
    const idsArray = Array.from(seenCommentIds);
    const keepCount = 300;
    seenCommentIds = new Set(idsArray.slice(-keepCount));
  }
  
  return false;
}

/**
 * Add comment to buffer
 */
function addCommentToBuffer(comment) {
  // Check for duplicates
  if (isDuplicateComment(comment.id)) {
    console.debug('[CHAT] Skipping duplicate:', comment.username, comment.text.substring(0, 30));
    return;
  }

  // Add to buffer
  chatBuffer.push(comment);
  
  console.log('[CHAT] 💬', comment.username + ':', comment.text);

  // Trim buffer to max size
  if (chatBuffer.length > CHAT_CONFIG.MAX_BUFFER_SIZE) {
    chatBuffer = chatBuffer.slice(-CHAT_CONFIG.MAX_BUFFER_SIZE);
  }

  // Clean old comments (older than buffer duration)
  const now = Date.now();
  chatBuffer = chatBuffer.filter(c => 
    now - c.timestamp < CHAT_CONFIG.BUFFER_DURATION_MS
  );
}

/**
 * Emit chat batch to background script
 */
function emitChatBatch() {
  const now = Date.now();
  
  // Rate limiting
  if (now - lastChatEmitTime < CHAT_CONFIG.EMIT_BATCH_INTERVAL_MS) {
    return;
  }

  // Get comments from last 30 seconds
  const recentComments = chatBuffer.filter(c => 
    now - c.timestamp < CHAT_CONFIG.BUFFER_DURATION_MS
  );

  if (recentComments.length === 0) {
    return;
  }

  // Calculate chat rate (comments per minute)
  const durationMinutes = CHAT_CONFIG.BUFFER_DURATION_MS / 60000;
  const chatRate = Math.round(recentComments.length / durationMinutes);

  const payload = {
    type: 'CHAT_STREAM_UPDATE',
    platform,
    timestamp: now,
    comments: recentComments.map(c => ({
      username: c.username,
      text: c.text,
      timestamp: c.timestamp
    })),
    chatRate: chatRate,
    commentCount: recentComments.length,
    windowDuration: CHAT_CONFIG.BUFFER_DURATION_MS
  };

  safeSendMessage(payload);
  lastChatEmitTime = now;

  console.log(`[CHAT] 📤 Emitted batch: ${recentComments.length} comments, rate: ${chatRate}/min`);
}

/**
 * Handle chat mutations
 */
function handleChatMutation(mutations) {
  console.debug('[CHAT:MUT] Detected', mutations.length, 'mutations');

  const selectors = CHAT_SELECTORS[platform];
  if (!selectors) return;

  // Find new comment elements in mutations
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      // Check added nodes
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // Try to match as comment element
        let isComment = false;
        
        for (const selector of selectors.comments) {
          try {
            if (node.matches && node.matches(selector)) {
              isComment = true;
              break;
            }
          } catch (_) {}
        }

        // Also check if children match comment selector
        if (!isComment) {
          for (const selector of selectors.comments) {
            try {
              const children = node.querySelectorAll(selector);
              if (children.length > 0) {
                children.forEach(child => {
                  const comment = parseCommentElement(child);
                  if (comment) {
                    addCommentToBuffer(comment);
                  }
                });
                isComment = true;
                break;
              }
            } catch (_) {}
          }
        }

        // Parse if this is a comment element
        if (isComment) {
          const comment = parseCommentElement(node);
          if (comment) {
            addCommentToBuffer(comment);
          }
        }
      }
    }
  }

  // Emit batch periodically
  emitChatBatch();
}

/**
 * Setup MutationObserver for chat
 */
function setupChatObserver() {
  // Disconnect existing observer
  if (chatObserver) {
    try {
      chatObserver.disconnect();
    } catch (_) {}
    chatObserver = null;
  }

  // Find chat container
  const container = findChatContainer();
  if (!container) {
    console.log('[CHAT] ❌ No chat container, will retry...');
    return false;
  }

  console.log('[CHAT] ✅ Setting up observer on container');

  try {
    chatObserver = new MutationObserver((mutations) => {
      // Debounce handler
      if (chatMutationDebounce) clearTimeout(chatMutationDebounce);
      
      chatMutationDebounce = setTimeout(() => {
        handleChatMutation(mutations);
      }, CHAT_CONFIG.MUTATION_DEBOUNCE_MS);
    });

    chatObserver.observe(container, {
      childList: true,
      subtree: true
    });

    console.log('[CHAT] 👀 Observer active, watching for comments...');
    return true;
  } catch (e) {
    console.error('[CHAT] ❌ Failed to setup observer:', e);
    return false;
  }
}

/**
 * Start chat tracking
 */
function startChatTracking() {
  if (isChatTracking) {
    console.log('[CHAT] Already tracking, ignoring duplicate start');
    return;
  }

  if (platform !== 'tiktok' && platform !== 'twitch' && platform !== 'youtube') {
    console.log('[CHAT] Platform not supported for chat tracking:', platform);
    return;
  }

  console.log('[CHAT] 🚀 Starting chat stream tracking...');
  isChatTracking = true;

  // Clear state
  chatBuffer = [];
  seenCommentIds = new Set();
  lastChatEmitTime = 0;

  // Try to setup observer
  const success = setupChatObserver();

  // If failed, retry periodically
  if (!success) {
    console.log('[CHAT] Setting up retry interval...');
    if (chatRetryInterval) clearInterval(chatRetryInterval);
    
    chatRetryInterval = setInterval(() => {
      console.log('[CHAT] 🔄 Retrying observer setup...');
      const retry = setupChatObserver();
      if (retry) {
        clearInterval(chatRetryInterval);
        chatRetryInterval = null;
      }
    }, CHAT_CONFIG.RETRY_FIND_INTERVAL_MS);
  }

  // Emit batches periodically (even if no new comments)
  setInterval(() => {
    if (isChatTracking) {
      emitChatBatch();
    }
  }, CHAT_CONFIG.EMIT_BATCH_INTERVAL_MS);
}

/**
 * Stop chat tracking
 */
function stopChatTracking() {
  console.log('[CHAT] ⏹️ Stopping chat stream tracking');
  isChatTracking = false;

  if (chatObserver) {
    try {
      chatObserver.disconnect();
    } catch (_) {}
    chatObserver = null;
  }

  if (chatRetryInterval) {
    clearInterval(chatRetryInterval);
    chatRetryInterval = null;
  }

  if (chatMutationDebounce) {
    clearTimeout(chatMutationDebounce);
    chatMutationDebounce = null;
  }

  chatBuffer = [];
  seenCommentIds = new Set();
}

/**
 * Manual test function for chat detection
 */
window.__SPIKELY_TEST_CHAT__ = function() {
  console.log('='.repeat(60));
  console.log('🧪 SPIKELY CHAT DETECTION TEST');
  console.log('='.repeat(60));

  const container = findChatContainer();
  
  if (container) {
    console.log('✅ SUCCESS! Found chat container');
    console.log('   Element:', container.tagName);
    console.log('   Classes:', container.className || '(none)');
    console.log('   Children count:', container.children.length);
    console.log('   Current buffer:', chatBuffer.length, 'comments');
    
    // Try to parse existing comments
    const selectors = CHAT_SELECTORS[platform];
    if (selectors) {
      let foundComments = 0;
      
      for (const selector of selectors.comments) {
        try {
          const elements = container.querySelectorAll(selector);
          console.log(`   Selector "${selector}": found ${elements.length} comments`);
          
          if (elements.length > 0 && foundComments === 0) {
            // Try to parse first 3
            for (let i = 0; i < Math.min(3, elements.length); i++) {
              const parsed = parseCommentElement(elements[i]);
              if (parsed) {
                console.log(`   Comment ${i + 1}:`, parsed.username, '→', parsed.text.substring(0, 50));
                foundComments++;
              }
            }
          }
        } catch (e) {
          console.log(`   Selector "${selector}": error`, e.message);
        }
      }
      
      if (foundComments > 0) {
        console.log('✅ Successfully parsed', foundComments, 'comments');
      } else {
        console.log('⚠️ Found container but could not parse comments');
        console.log('   Try adjusting selectors or inspect a comment element manually');
      }
    }
    
    console.log('\n📊 Chat tracking status:', isChatTracking ? 'ACTIVE' : 'INACTIVE');
    
    if (!isChatTracking) {
      console.log('💡 Run startChatTracking() to begin tracking');
    }
  } else {
    console.log('❌ FAILED - No chat container found');
    console.log('\n🔍 Debugging info:');
    console.log('   Platform:', platform);
    console.log('   URL:', window.location.href);
    
    console.log('\n💡 Suggestions:');
    console.log('   1. Make sure you\'re on a TikTok Live page');
    console.log('   2. Open DevTools and inspect the chat area');
    console.log('   3. Look for a scrollable container with many comments');
    console.log('   4. Check the console logs above for selector attempts');
  }
  
  console.log('='.repeat(60));
  return container;
};


// Content script loaded - DOM ready initialization complete
console.log('🎉🎉🎉 [SPIKELY] CONTENT SCRIPT FULLY LOADED! 🎉🎉🎉');
console.log('[Spikely] Version: 2.3.0-ROBUST-INJECTION');
console.log('[Spikely] Platform detected:', platform);
console.log('[Spikely] 🧪 Manual tests: window.__SPIKELY_TEST__(), window.__SPIKELY_TEST_CHAT__()');

// Expose manual testing functions
window.__SPIKELY_TEST__ = function() {
  console.log('='.repeat(60));
  console.log('🧪 SPIKELY MANUAL VIEWER DETECTION TEST');
  console.log('='.repeat(60));
  
  const node = queryViewerNode();
  
  if (node) {
    const parsed = normalizeAndParse(node);
    console.log('✅ SUCCESS! Found viewer count element');
    console.log('   Text content:', node.textContent?.substring(0, 100));
    console.log('   Parsed value:', parsed);
    console.log('   Element classes:', node.className || '(none)');
    console.log('   Parent classes:', node.parentElement?.className || '(none)');
    console.log('   Cached:', cachedViewerEl === node);
    
    // Try to trigger an update
    if (parsed !== null) {
      console.log('\n📤 Sending test message to background script...');
      safeSendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        platform,
        count: parsed,
        delta: 0,
        timestamp: Date.now(),
        source: 'manual_test'
      });
      console.log('   Message sent!');
    }
  } else {
    console.log('❌ FAILED - No viewer count element found');
    console.log('\n🔍 Debugging info:');
    console.log('   Platform:', platform);
    console.log('   URL:', window.location.href);
    console.log('   Is tracking:', isTracking);
    
    console.log('\n💡 Suggestions:');
    console.log('   1. Make sure you\'re on a TikTok Live page');
    console.log('   2. Open DevTools and inspect the viewer count element');
    console.log('   3. Look for a number like "2.1K" near the text "Viewers"');
    console.log('   4. Check the console logs above for detailed search results');
  }
  
  console.log('='.repeat(60));
  return node;
};

// Run parser validation tests
validateParserFix();

// Stop timers cleanly on navigation to avoid context errors
window.addEventListener('pagehide', () => { try { stopTracking(); } catch (_) {} });
window.addEventListener('beforeunload', () => { try { stopTracking(); } catch (_) {} });

})(); // END OF IIFE - CRITICAL: This closes the (function(){ at the top
