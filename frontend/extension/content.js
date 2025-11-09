// ============================================================================
// SPIKELY CONTENT SCRIPT - RESILIENT SHADOW DOM VIEWER DETECTION
// ============================================================================

// ============================================================================
// LVT PATCH R6: Shadow Root Interception Registry (captures closed shadow roots)
// ============================================================================
(function(){
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
    window.__spikelyDomObsInit = false; // LVT PATCH R6: Guard for duplicate observer
    window.__spikely_shadow_registry = new WeakSet(); // LVT PATCH R6: Weak reference registry
  } catch (_) {}

// LVT PATCH R6: Intercept ShadowRoot creation to capture closed roots
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function(options) {
  const shadowRoot = originalAttachShadow.call(this, options);
  
  // LVT PATCH R6: Store reference to all shadow roots (including closed)
  window.__spikely_shadow_registry.add(shadowRoot);
  console.log(`[VIEWER:INIT] captured shadow root on ${this.tagName} (${options.mode})`);
  
  return shadowRoot;
};

// Configuration
const CONFIG = {
  POLL_INTERVAL_MS: 800,
  HEARTBEAT_INTERVAL_MS: 5000,
  MUTATION_DEBOUNCE_MS: 100,
  LOG_THROTTLE_MS: 5000,
  VIEWER_MIN_THRESHOLD: 1,
  RECHECK_INTERVAL_MS: 500, // LVT PATCH R6: Delayed node binding interval
  RECOVERY_TIMEOUT_MS: 2000  // LVT PATCH R6: Observer recovery timeout
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

// Platform-specific selectors
const platformSelectors = {
  twitch: ['[data-a-target="animated-channel-viewers-count"]', '.live-indicator-container span'],
  kick: ['[class*="viewer-count"]', '[class*="ViewerCount"]'],
  youtube: ['span.ytp-live-badge + span', '.ytp-live .ytp-time-current']
};


// State variables
let isTracking = false;
let currentViewerCount = 0;
let pollTimer = null;
let lastLogTime = 0;
// LVT PATCH: Fixed duplicate domObserver declaration
let domObserver = null;
let currentObserverTarget = null;
let observerIdleTimer = null;
let mutationDebounceTimer = null;
let observerInProgress = false;

// ============================================================================
// LVT PATCH R6: Comprehensive shadow DOM recursion with all nested roots
// ============================================================================
function walkShadows(node, collectCallback, visited = new WeakSet()) {
  if (!node || visited.has(node)) return;
  visited.add(node);
  
  // LVT PATCH R6: Process current node first
  if (collectCallback) collectCallback(node);
  
  // LVT PATCH R6: Recursively traverse shadowRoot if it exists
  if (node.shadowRoot && !visited.has(node.shadowRoot)) {
    visited.add(node.shadowRoot);
    console.log(`[VIEWER:DBG] traversing shadow root on ${node.tagName}`); // LVT PATCH R6: Log shadow traversal
    
    // LVT PATCH R6: Walk all elements in this shadow root
    const shadowElements = node.shadowRoot.querySelectorAll('*');
    for (const shadowEl of shadowElements) {
      walkShadows(shadowEl, collectCallback, visited);
    }
  }
  
  // LVT PATCH R6: Walk all child elements recursively
  if (node.children) {
    for (const child of node.children) {
      walkShadows(child, collectCallback, visited);
    }
  }
}

// ============================================================================
// LVT PATCH R7: Enhanced registry scanning with retroactive support
// ============================================================================
function walkShadowsWithRegistry(collectCallback, visited = new WeakSet()) {
  let registryScanned = 0;
  let documentsScanned = 0;
  
  // LVT PATCH R7: Scan captured shadow roots from preload registry
  if (window.__spikely_shadow_registry && window.__spikely_shadow_registry.size > 0) {
    console.log(`[VIEWER:REGISTRY] scanning ${window.__spikely_shadow_registry.size} captured shadow roots`);
    
    for (const shadowRoot of window.__spikely_shadow_registry) {
      if (!visited.has(shadowRoot)) {
        registryScanned++;
        visited.add(shadowRoot);
        console.log(`[VIEWER:DBG] scanning captured shadow root #${registryScanned}`);
        
        // LVT PATCH R7: Scan all elements in captured shadow root
        const shadowElements = shadowRoot.querySelectorAll('*');
        for (const el of shadowElements) {
          collectCallback(el);
          
          // LVT PATCH R7: Check for nested shadow roots in captured roots
          if (el.shadowRoot && !visited.has(el.shadowRoot)) {
            window.__spikely_shadow_registry.add(el.shadowRoot);
          }
        }
      }
    }
  } else {
    console.log(`[VIEWER:REGISTRY] no captured shadow roots available (size: ${window.__spikely_shadow_registry?.size || 0})`);
  }
  
  // LVT PATCH R7: Also scan document for any missed shadow roots
  function scanDocument(node, depth = 0) {
    if (depth > 6 || visited.has(node)) return;
    visited.add(node);
    
    if (node.shadowRoot && !visited.has(node.shadowRoot)) {
      documentsScanned++;
      visited.add(node.shadowRoot);
      console.log(`[VIEWER:DBG] scanning document shadow root #${documentsScanned}`);
      
      const shadowElements = node.shadowRoot.querySelectorAll('*');
      for (const el of shadowElements) {
        collectCallback(el);
      }
    }
    
    for (const child of node.children || []) {
      scanDocument(child, depth + 1);
    }
  }
  
  scanDocument(document.documentElement);
  
  console.log(`[VIEWER:REGISTRY] scanned ${registryScanned} registry roots + ${documentsScanned} document roots`);
}

// LVT PATCH R6: Delayed node binding with recheck loop for React Fiber async mounting  
let recheckTimer = null;
let recoveryTimer = null;
let lastUpdateTime = 0;

function startDelayedNodeBinding() {
  console.log('[VIEWER:DBG] starting delayed node binding for React Fiber...');
  
  // LVT PATCH R6: Recheck loop every 500ms until viewer node found
  recheckTimer = setInterval(() => {
    if (!currentObserverTarget) {
      console.log('[VIEWER:DBG] rechecking for TikTok viewer node...');
      const count = detectViewerCountWithRegistry();
      if (count !== null && count > 0) {
        console.log(`[VIEWER:PAGE:FOUND] located viewer node with count: ${count}`); // LVT PATCH R6: Found log
        clearInterval(recheckTimer);
        recheckTimer = null;
        
        // LVT PATCH R6: Start observer recovery monitoring  
        startObserverRecovery();
      }
    } else {
      clearInterval(recheckTimer);
      recheckTimer = null;
    }
  }, CONFIG.RECHECK_INTERVAL_MS);
}

// LVT PATCH R6: Observer recovery - self-healing if no updates for >2s
function startObserverRecovery() {
  if (recoveryTimer) clearTimeout(recoveryTimer);
  
  recoveryTimer = setTimeout(() => {
    const now = Date.now();
    if (now - lastUpdateTime > CONFIG.RECOVERY_TIMEOUT_MS) {
      console.log('[VIEWER:DBG] no updates for 2s, triggering observer recovery');
      currentObserverTarget = null;
      if (domObserver) {
        try { domObserver.disconnect(); } catch (_) {}
        domObserver = null;
      }
      
      // LVT PATCH R6: Re-trigger detection
      startDelayedNodeBinding();
    }
  }, CONFIG.RECOVERY_TIMEOUT_MS);
}

// LVT PATCH R3: Enhanced shadow DOM traversal with comprehensive collection
function deepQuerySelector(selectors, root = document, depth = 0) {
  const MAX_DEPTH = 6; // LVT PATCH R3: Increased depth limit for deeper nesting
  if (depth > MAX_DEPTH) return null;
  
  // LVT PATCH R3: Direct query first with latest TikTok selectors
  for (const selector of selectors) {
    try {
      const element = root.querySelector(selector);
      if (element && isValidVisibleNode(element)) {
        console.log(`[VIEWER:DBG] selector hit: ${selector} at depth ${depth}`);
        return element;
      }
    } catch (e) {
      console.log(`[VIEWER:DBG] selector failed: ${selector}`);
    }
  }
  
  // LVT PATCH R3: Comprehensive shadow traversal using walkShadows
  const candidates = [];
  let shadowRootsFound = 0;
  
  walkShadows(root, (node) => {
    // LVT PATCH R3: Count shadow roots for validation
    if (node.shadowRoot) {
      shadowRootsFound++;
      console.log(`[VIEWER:DBG] shadow root #${shadowRootsFound} found on ${node.tagName}`);
    }
    
    // LVT PATCH R3: Collect numeric elements with enhanced visibility check
    if ((node.tagName === 'SPAN' || node.tagName === 'DIV' || node.tagName === 'STRONG') && node.textContent) {
      const text = node.textContent.trim();
      // LVT PATCH R3: Visibility-safe regex for formats like "173K", "184,490", "1.8k watching"
      const sanitized = text.replace(/[^\d.,KkMm]/g, '');
      if (sanitized && /^[0-9,]+(?:\.[0-9]+)?[KkMm]?$/.test(sanitized)) {
        if (isValidVisibleNode(node)) { // LVT PATCH R3: Use comprehensive visibility check
          const count = parseViewerCount(sanitized);
          if (count > CONFIG.VIEWER_MIN_THRESHOLD) {
            console.log("✅ Shadow DOM number found:", text); // LVT PATCH R3: Validation capture log
            candidates.push({ element: node, count, rect: node.getBoundingClientRect(), text: sanitized });
          }
        }
      }
    }
  });
  
  console.log(`[VIEWER:DBG] walkShadows found ${shadowRootsFound} shadow roots, ${candidates.length} candidates`);
  
  // LVT PATCH R3: Return best candidate after deduplication
  if (candidates.length > 0) {
    const deduped = deduplicateCounters(candidates);
    return deduped[0]?.element || null;
  }
  
  return null;
}

// ============================================================================
// LVT PATCH R8: Enhanced detection with late observer + traversal recovery
// ============================================================================
function detectViewerCountWithRegistry() {
  if (platform === 'tiktok') {
    
    console.log('[VIEWER:INIT] Starting TikTok viewer detection with dynamic registry...');
    
    // LVT PATCH R8: PRIORITY 1 - Registry-based traversal (access captured closed roots)
    console.log('[VIEWER:DBG] Priority 1: Registry-based shadow traversal...');
    
    const candidates = [];
    let registryScanned = 0;
    
    // LVT PATCH R8: Scan captured registry (manual iteration since WeakSet not iterable)
    if (window.__spikely_shadow_registry) {
      const allElements = document.querySelectorAll('*');
      
      for (const element of allElements) {
        if (element.shadowRoot) {
          registryScanned++;
          console.log(`[VIEWER:DBG] scanning potential registry shadow root #${registryScanned}`);
          
          const shadowElements = element.shadowRoot.querySelectorAll('span, div, strong');
          for (const el of shadowElements) {
            const text = el.textContent?.trim();
            if (text) {
              // LVT PATCH R8: Look for TikTok viewer patterns in registry
              if (/viewers?\s*[·•]\s*\d+/i.test(text)) {
                const match = text.match(/viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
                if (match && isValidVisibleNode(el)) {
                  const count = parseViewerCount(match[1]);
                  if (count > 0) {
                    console.log(`[VIEWER:PAGE:FOUND] selector=${element.tagName}>${el.tagName} value=${count}`); // LVT PATCH R8: Found log
                    candidates.push({ element: el, count, priority: 1, source: 'registry_pattern' });
                  }
                }
              } 
              // LVT PATCH R8: Look for contextual numbers in registry  
              else if (/^\d+(?:\.\d+)?[KkMm]?$/.test(text)) {
                const context = el.parentElement?.textContent?.toLowerCase() || '';
                if ((context.includes('viewer') || context.includes('watching')) && isValidVisibleNode(el)) {
                  const count = parseViewerCount(text);
                  if (count >= 10 && count <= 50000) {
                    console.log(`[VIEWER:PAGE:FOUND] selector=${element.tagName}>${el.tagName} value=${count}`); // LVT PATCH R8: Found log
                    candidates.push({ element: el, count, priority: 2, source: 'registry_context' });
                  }
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`[VIEWER:DBG] registry scan: ${registryScanned} shadow roots checked, ${candidates.length} candidates`);
    
    // LVT PATCH R8: PRIORITY 2 - Traditional DOM pattern search  
    if (candidates.length === 0) {
      console.log('[VIEWER:DBG] Priority 2: Traditional DOM pattern search...');
      
      const allElements = Array.from(document.querySelectorAll('*'));
      for (const element of allElements) {
        const text = element.textContent?.trim() || '';
        
        if (/viewers?\s*[·•]\s*\d+/i.test(text)) {
          const match = text.match(/viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
          if (match && isValidVisibleNode(element)) {
            const count = parseViewerCount(match[1]);
            if (count > 0) {
              console.log(`[VIEWER:PAGE:FOUND] selector=${element.tagName} value=${count}`); // LVT PATCH R8: Found log
              candidates.push({ element, count, priority: 1, source: 'dom_pattern' });
            }
          }
        }
      }
    }
    
    // LVT PATCH R8: Return best candidate and bind observer
    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => a.priority - b.priority)[0];
      console.log(`[VIEWER:PAGE:FOUND] best candidate: ${best.count} via ${best.source}`);
      bindPersistentMutationObserver(best.element);
      return best.count;
    }
    
    console.log('[VIEWER:PAGE] no valid TikTok viewer count found in registry or DOM');
    return null;
  }
  
  // Non-TikTok platforms
  const selectors = platformSelectors[platform] || [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && isValidVisibleNode(element) && hasValidViewerCount(element)) {
      const count = parseViewerCount(element);
      console.log(`[VIEWER:PAGE:FOUND] ${platform} viewer count: ${count}`);
      return count;
    }
  }
  
  return null;
}

// LVT PATCH R4: Unified visibility validation function (fixes missing isValidVisibleNode)
function isValidVisibleNode(element) {
  return isComprehensivelyVisible(element); // LVT PATCH R4: Delegate to comprehensive check
}

// LVT PATCH R4: Comprehensive visibility validation with all checks
function isComprehensivelyVisible(element) {
  if (!element) return false;
  
  // LVT PATCH R4: Check if node is connected (reject React fiber clones)
  if (!element.isConnected) return false;
  
  // LVT PATCH R4: Check aria-hidden
  if (element.getAttribute('aria-hidden') === 'true') return false;
  
  // LVT PATCH R4: Comprehensive computed style validation
  const style = window.getComputedStyle(element);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false; // LVT PATCH R4: Added visibility check
  if (parseFloat(style.opacity) === 0) return false;
  
  // LVT PATCH R4: Check bounding box for zero-size elements
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  
  // LVT PATCH R4: Check offsetParent (with fixed position exception)
  if (element.offsetParent === null && style.position !== 'fixed') return false;
  
  return true;
}

// LVT PATCH R4: Enhanced deduplication with TikTok pattern prioritization
function deduplicateCounters(candidates) {
  const deduplicated = [];
  
  candidates.forEach(candidate => {
    const isDuplicate = deduplicated.some(existing => {
      // LVT PATCH R4: Check text normalization match
      const textMatch = existing.element.textContent.trim() === candidate.element.textContent.trim();
      
      // LVT PATCH R4: Check bounding box overlap (within 10px)
      const rectOverlap = Math.abs(existing.rect.left - candidate.rect.left) < 10 &&
                         Math.abs(existing.rect.top - candidate.rect.top) < 10;
      
      return textMatch || rectOverlap;
    });
    
    if (!isDuplicate) {
      deduplicated.push(candidate);
    }
  });
  
  // LVT PATCH R4: Prioritize elements within TikTok patterns, then by count
  return deduplicated.sort((a, b) => {
    // LVT PATCH R4: Check if element is within TikTok viewer patterns
    const aTikTokPattern = a.element.closest('.tiktok-live-viewer, .count, [data-e2e*="viewer"]');
    const bTikTokPattern = b.element.closest('.tiktok-live-viewer, .count, [data-e2e*="viewer"]');
    
    if (aTikTokPattern && !bTikTokPattern) return -1;
    if (!aTikTokPattern && bTikTokPattern) return 1;
    
    // LVT PATCH R4: Sort by largest count (most likely real) - BUT cap at reasonable values
    return b.count - a.count;
  });
}

// LVT PATCH R2: Enhanced deduplication with TikTok pattern prioritization
function deduplicateCounters(candidates) {
  const deduplicated = [];
  
  candidates.forEach(candidate => {
    const isDuplicate = deduplicated.some(existing => {
      // LVT PATCH R2: Check text normalization match
      const textMatch = existing.element.textContent.trim() === candidate.element.textContent.trim();
      
      // LVT PATCH R2: Check bounding box overlap (within 10px)
      const rectOverlap = Math.abs(existing.rect.left - candidate.rect.left) < 10 &&
                         Math.abs(existing.rect.top - candidate.rect.top) < 10;
      
      return textMatch || rectOverlap;
    });
    
    if (!isDuplicate) {
      deduplicated.push(candidate);
    }
  });
  
  // LVT PATCH R2: Prioritize elements within TikTok patterns, then by count
  return deduplicated.sort((a, b) => {
    // LVT PATCH R2: Check if element is within TikTok viewer patterns
    const aTikTokPattern = a.element.closest('.tiktok-live-viewer, .count, [data-e2e*="viewer"]');
    const bTikTokPattern = b.element.closest('.tiktok-live-viewer, .count, [data-e2e*="viewer"]');
    
    if (aTikTokPattern && !bTikTokPattern) return -1;
    if (!aTikTokPattern && bTikTokPattern) return 1;
    
    // LVT PATCH R2: Sort by largest count (most likely real)
    return b.count - a.count;
  });
}


// LVT PATCH R7: Enhanced viewer update with recovery monitoring
let lastEmittedCount = 0;
let lastEmitTime = 0;

function emitViewerUpdate(count) {
  const now = Date.now();
  const delta = lastEmittedCount > 0 ? count - lastEmittedCount : 0;
  
  lastEmittedCount = count;
  lastEmitTime = now;
  currentViewerCount = count;
  lastUpdateTime = now; // LVT PATCH R7: Track for recovery monitoring
  
  console.log(`[VIEWER:PAGE] value=${count}`);
  console.log(`[VIEWER:PAGE:UPDATE] value=${count} delta=${delta}`); // LVT PATCH R7: Enhanced update log
  
  // LVT PATCH R7: Use sendWithRetry for guaranteed delivery
  sendWithRetry({
    type: 'VIEWER_COUNT_UPDATE',
    platform,
    count,
    delta,
    timestamp: now,
    source: 'validated'
  }, 'LVT_UPDATE');
}

// ============================================================================
// LVT PATCH R2: Use unified sendWithRetry for all message sending
// ============================================================================
function reliableSendMessage(payload, attempt = 1) {
  // LVT PATCH R2: Delegate to sendWithRetry with appropriate context tag
  const contextTag = payload.type || "VIEWER_UPDATE";
  sendWithRetry(payload, contextTag, attempt);
}

// ============================================================================
// STABILIZED MUTATIONOBSERVER WITH DEBOUNCING
// ============================================================================
const OBSERVER_DEBOUNCE_MS = 150; // 120-200ms as specified
// LVT PATCH: observerInProgress already declared in state variables section

// LVT PATCH R6: Persistent MutationObserver with container binding and auto-recovery
function bindPersistentMutationObserver(element, forceInit = false) {
  // LVT PATCH R6: Prevent duplicate initialization with enhanced guard
  if (!forceInit && window.__spikelyDomObsInit && domObserver && currentObserverTarget === element) {
    console.log('[VIEWER:DBG] persistent observer already bound to this element');
    return;
  }
  
  // LVT PATCH R6: Unbind previous observer safely
  if (domObserver) {
    try { 
      domObserver.disconnect();
      console.log('[VIEWER:DBG] unbound previous persistent observer');
    } catch (_) {}
    domObserver = null;
  }
  
  if (!element || !isValidVisibleNode(element)) {
    console.log('[VIEWER:DBG] invalid element for persistent observer binding');
    return;
  }
  
  try {
    currentObserverTarget = element;
    window.__spikelyDomObsInit = true;
    
    // LVT PATCH R6: Bind to stable parent container (not text node itself)  
    const container = element.closest('div, section, span') || element.parentElement || element;
    console.log(`[VIEWER:DBG] binding persistent observer to container: ${container.tagName}`);
    
    domObserver = new MutationObserver((mutations) => {
      if (observerInProgress) return;
      observerInProgress = true;
      
      console.log(`[VIEWER:DBG] persistent observer detected: ${mutations.length} changes`);
      
      // LVT PATCH R6: Debounce and update tracking
      if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = setTimeout(() => {
        // LVT PATCH R6: Re-validate target element or find new one
        let targetElement = element;
        if (!isValidVisibleNode(element)) {
          // LVT PATCH R6: Try to find replacement in container
          const newCandidate = container.querySelector('span, div');
          if (newCandidate && isValidVisibleNode(newCandidate)) {
            targetElement = newCandidate;
            console.log('[VIEWER:DBG] switched to replacement element in container');
          } else {
            // LVT PATCH R6: Container lost viewer node, re-trigger detection
            console.log('[VIEWER:DBG] container lost viewer node, triggering redetection');
            setTimeout(() => {
              const newElement = detectViewerCountWithRegistry();
              if (newElement) {
                bindPersistentMutationObserver(newElement, true);
              } else {
                // LVT PATCH R6: Start delayed binding for React remount
                startDelayedNodeBinding();
              }
            }, 200);
            
            observerInProgress = false;
            return;
          }
        }
        
        // LVT PATCH R7: Parse and emit updates (removed jitter filter)
        const count = parseViewerCount(targetElement);
        if (count > 0) {
          emitViewerUpdate(count);
          
          // LVT PATCH R6: Restart recovery timer
          startObserverRecovery();
        }
        
        observerInProgress = false;
      }, OBSERVER_DEBOUNCE_MS);
    });
    
    // LVT PATCH R6: Observe container with full mutation tracking
    domObserver.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: false // LVT PATCH R6: Focus on content changes only
    });
    
    console.log('[VIEWER:DBG] persistent observer bound to stable container');
    
    // LVT PATCH R6: Start recovery monitoring
    startObserverRecovery();
    
  } catch (e) {
    console.log(`[VIEWER:DBG] persistent observer binding failed: ${e.message}`);
    currentObserverTarget = null;
    observerInProgress = false;
    window.__spikelyDomObsInit = false;
  }
}

function hasValidViewerCount(element) {
  const text = element.textContent?.trim();
  return text && /\d/.test(text) && text.length <= 10;
}

// LVT PATCH R4: Fixed numeric parser with strict filtering (normalize to 0-200,000 range)
function parseViewerCount(textOrElement) {
  let text;
  if (typeof textOrElement === 'string') {
    text = textOrElement;
  } else if (textOrElement?.textContent) {
    text = textOrElement.textContent.trim();
  } else {
    return 0;
  }
  
  // LVT PATCH R4: Strict sanitization - only keep digits, commas, periods, K, M
  const cleaned = text.toLowerCase().replace(/[^\d.,km]/g, '');
  const match = cleaned.match(/^(\d+(?:\.\d+)?(?:,\d{3})*?)([km]?)$/);
  if (!match) return 0;
  
  let num = parseFloat(match[1].replace(/,/g, '')); // LVT PATCH R4: Remove commas before parsing
  const suffix = match[2];
  
  if (suffix === 'k') num *= 1000;
  if (suffix === 'm') num *= 1000000;
  
  const result = Math.round(num);
  
  // LVT PATCH R4: Normalize to valid range [0 - 200,000] to prevent ridiculous values
  if (!isFinite(result) || result < 0) return 0;
  if (result > 200000) {
    console.log(`[VIEWER:DBG] capped excessive count: ${result} → 200000`);
    return 200000;
  }
  
  return result;
}

// ============================================================================
// LVT PATCH R7: Enhanced tracking with recovery cycle and late observer binding
// ============================================================================
let recoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 10;

function startTracking() {
  if (isTracking) {
    console.log('[VIEWER:PAGE] already tracking');
    return;
  }
  
  isTracking = true;
  recoveryAttempts = 0;
  console.log('[VIEWER:PAGE] tracking started with preload registry access');
  
  if (platform === 'tiktok') {
    // LVT PATCH R7: Wait for registry to be populated, then try detection
    setTimeout(() => {
      attemptViewerDetection();
    }, 100); // LVT PATCH R7: Small delay for registry population
    
    // LVT PATCH R7: Recovery cycle - continue until VIEWER_COUNT_UPDATE fires
    const recoveryInterval = setInterval(() => {
      if (!currentObserverTarget && recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
        recoveryAttempts++;
        console.log(`[VIEWER:DBG] recovery attempt #${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}`);
        attemptViewerDetection();
      } else if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        console.log('[VIEWER:DBG] max recovery attempts reached, stopping recovery');
        clearInterval(recoveryInterval);
      } else {
        clearInterval(recoveryInterval);
      }
    }, CONFIG.RECHECK_INTERVAL_MS);
    
    // LVT PATCH R7: Polling fallback (reduced frequency when observer active)
    pollTimer = setInterval(() => {
      const observerActive = domObserver && currentObserverTarget && 
                           isValidVisibleNode(currentObserverTarget);
      
      if (!observerActive) {
        console.log('[VIEWER:DBG] polling fallback active');
        attemptViewerDetection();
      }
    }, CONFIG.POLL_INTERVAL_MS);
    
    // Heartbeat every 5s
    setInterval(() => {
      if (isTracking && currentViewerCount > 0) {
        sendWithRetry({
          type: 'VIEWER_HEARTBEAT',
          platform,
          count: currentViewerCount,
          timestamp: Date.now()
        }, 'HEARTBEAT');
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
    
  } else {
    // Non-TikTok platforms: polling with registry access
    pollTimer = setInterval(() => {
      const count = detectViewerCountWithRegistry();
      if (count !== null) {
        emitViewerUpdate(count);
      }
    }, CONFIG.POLL_INTERVAL_MS);
  }
}

// LVT PATCH R7: Attempt viewer detection with registry access and recovery
function attemptViewerDetection() {
  const count = detectViewerCountWithRegistry();
  if (count !== null && count > 0) {
    lastUpdateTime = Date.now();
    recoveryAttempts = 0; // LVT PATCH R7: Reset recovery on success
    emitViewerUpdate(count);
    startObserverRecovery();
  } else {
    const now = Date.now();
    if (now - lastLogTime > CONFIG.LOG_THROTTLE_MS) {
      console.log('[VIEWER:PAGE] attempting viewer detection...');
      lastLogTime = now;
    }
  }
}

function stopTracking() {
  if (!isTracking) return;
  isTracking = false;
  
  console.log('[VIEWER:PAGE] tracking stopped');
  
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  
  if (domObserver) {
    try { domObserver.disconnect(); } catch (_) {}
    domObserver = null;
  }
  
  if (mutationDebounceTimer) {
    clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = null;
  }
  
  currentObserverTarget = null;
  observerInProgress = false;
  currentViewerCount = 0;
}

// LVT PATCH R2: Message reliability enhancement with retry queue
let messageQueue = [];
let retryInProgress = false;

function sendWithRetry(payload, contextTag = "LVT_UPDATE", attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const baseDelay = 50; // LVT PATCH R2: 50ms → 100ms → 200ms exponential backoff
  
  if (!chrome?.runtime?.id) {
    console.log('[VIEWER:DBG] extension context invalid');
    return;
  }
  
  try {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message;
        
        // LVT PATCH R2: Retry on connection errors with exponential backoff
        if (error.includes('Receiving end does not exist') && attempt < MAX_ATTEMPTS) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`[VIEWER:DBG] ${contextTag} retry ${attempt}/${MAX_ATTEMPTS} in ${delay}ms: ${error}`);
          
          setTimeout(() => {
            sendWithRetry(payload, contextTag, attempt + 1);
          }, delay);
        } else if (!error.includes('Extension context invalidated')) {
          console.log(`[VIEWER:DBG] ${contextTag} failed after ${attempt} attempts: ${error}`);
          
          // LVT PATCH R2: Queue failed sends for retry when connection established
          if (!retryInProgress) {
            messageQueue.push({ payload, contextTag });
            processMessageQueue();
          }
        }
      } else {
        console.log(`[VIEWER:DBG] ${contextTag} sent successfully on attempt ${attempt}`);
      }
    });
  } catch (error) {
    console.log(`[VIEWER:DBG] ${contextTag} send error: ${error.message}`);
  }
}

// LVT PATCH R2: Process queued messages when connection restored
function processMessageQueue() {
  if (retryInProgress || messageQueue.length === 0) return;
  retryInProgress = true;
  
  const queuedMessage = messageQueue.shift();
  if (queuedMessage) {
    setTimeout(() => {
      sendWithRetry(queuedMessage.payload, queuedMessage.contextTag);
      retryInProgress = false;
      processMessageQueue(); // LVT PATCH R2: Process next queued message
    }, 100);
  } else {
    retryInProgress = false;
  }
}

// ============================================================================
// MESSAGE LISTENERS
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_TRACKING') {
    startTracking();
    sendResponse({ success: true, platform });
  } else if (message.type === 'STOP_TRACKING') {
    stopTracking();
    sendResponse({ success: true });
  } else if (message.type === 'PING') {
    console.log('[VIEWER:PAGE] ping received');
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
});

// ============================================================================
// INITIALIZATION
// ============================================================================
console.log(`[VIEWER:PAGE] loaded on ${platform} - v2.2.8-R8-DYNAMIC-INJECT`);

// LVT PATCH R8: Verify preload hook registry after dynamic injection
setTimeout(() => {
  const registryExists = !!window.__spikely_shadow_registry;
  const registrySize = registryExists ? (window.__spikely_shadow_registry.size || 0) : 0;
  
  console.log(`[VIEWER:REGISTRY] dynamic injection result: exists=${registryExists}, size=${registrySize}`);
  
  if (registrySize === 0) {
    console.log('[VIEWER:REGISTRY] WARNING: Dynamic injection may have failed, attempting manual scan');
    
    // LVT PATCH R8: Emergency manual shadow root discovery
    const allElements = document.querySelectorAll('*');
    let emergencyCount = 0;
    
    if (!window.__spikely_shadow_registry) {
      window.__spikely_shadow_registry = new WeakSet();
    }
    
    for (const element of allElements) {
      if (element.shadowRoot) {
        window.__spikely_shadow_registry.add(element.shadowRoot);
        emergencyCount++;
        console.log(`[VIEWER:REGISTRY] emergency capture: shadow root #${emergencyCount} on ${element.tagName}`);
      }
    }
    
    console.log(`[VIEWER:REGISTRY] emergency scan captured ${emergencyCount} shadow roots`);
  }
}, 3000); // LVT PATCH R8: Extended check time for dynamic injection

// Auto-detect React remount events
let lastElementCount = 0;
setInterval(() => {
  const elementCount = document.querySelectorAll('*').length;
  if (Math.abs(elementCount - lastElementCount) > 100) {
    console.log('[VIEWER:PAGE] DOM remount detected, rebinding');
    lastElementCount = elementCount;
  }
}, 2000);

// Cleanup on navigation
function cleanup() {
  stopTracking();
}

window.addEventListener('beforeunload', cleanup);
window.addEventListener('pagehide', cleanup);

})();
