// ============================================================================
// SPIKELY CHROME EXTENSION - SHARED CONSTANTS & PROTOCOL
// ============================================================================

// Message Protocol Constants
const MESSAGE_TYPES = {
  VIEWER_UPDATE: 'VIEWER_UPDATE',
  VIEWER_HEARTBEAT: 'VIEWER_HEARTBEAT', 
  VIEWER_MISSING: 'VIEWER_MISSING',
  ENGINE_STATUS: 'ENGINE_STATUS',
  SIDE_PANEL_READY: 'SIDE_PANEL_READY',
  CACHE_FLUSH: 'CACHE_FLUSH',
  AUDIO_READY: 'AUDIO_READY',
  AUDIO_FAIL: 'AUDIO_FAIL',
  START_TRACKING: 'START_TRACKING',
  STOP_TRACKING: 'STOP_TRACKING',
  PING: 'PING'
};

// Protocol Shapes
const PROTOCOL = {
  ViewerUpdate: {
    type: MESSAGE_TYPES.VIEWER_UPDATE,
    platform: 'string',
    count: 'number', 
    delta: 'number',
    timestamp: 'number',
    source: 'string'
  },
  ViewerHeartbeat: {
    type: MESSAGE_TYPES.VIEWER_HEARTBEAT,
    platform: 'string',
    count: 'number',
    timestamp: 'number'
  }
};

// Configuration Constants
const CONFIG = {
  POLL_INTERVAL_MS: 800,
  HEARTBEAT_INTERVAL_MS: 5000,
  MUTATION_DEBOUNCE_MS: 100,
  PORT_RETRY_MAX: 5,
  PORT_RETRY_DELAY_BASE: 1000,
  PORT_RETRY_DELAY_MAX: 8000,
  LOG_THROTTLE_MS: 15000,
  VIEWER_MIN_THRESHOLD: 100
};

// ============================================================================
// BREADCRUMB LOGGER MODULE
// ============================================================================
class BreadcrumbLogger {
  constructor(prefix) {
    this.prefix = prefix;
    this.throttleMap = new Map();
  }
  
  log(message, throttleKey = null) {
    if (throttleKey) {
      const now = Date.now();
      const lastLog = this.throttleMap.get(throttleKey);
      if (lastLog && now - lastLog < CONFIG.LOG_THROTTLE_MS) {
        return; // Throttled
      }
      this.throttleMap.set(throttleKey, now);
    }
    console.log(`${this.prefix} ${message}`);
  }
  
  value(count) {
    this.log(`value=${count}`);
  }
  
  missing() {
    this.log('missing', 'missing-node');
  }
  
  error(message) {
    this.log(`error: ${message}`);
  }
}

// ============================================================================
// CONTENT SCRIPT - MODULAR VIEWER DETECTION SYSTEM
// ============================================================================

(function(){
  // Prevent duplicate injection
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      return;
    }
    window.__SPIKELY_CONTENT_ACTIVE__ = true;
  } catch (_) {}

// Initialize logger
const logger = new BreadcrumbLogger('[VIEWER:PAGE]');

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

// ============================================================================
// DOM SHADOW UTILS MODULE
// ============================================================================
class DomShadowUtils {
  static traverseShadowRoots(rootElement, callback) {
    const visited = new WeakSet();
    
    function traverse(element) {
      if (!element || visited.has(element)) return;
      visited.add(element);
      
      // Process current element
      if (callback(element)) return true;
      
      // Check shadow root
      if (element.shadowRoot) {
        const shadowElements = element.shadowRoot.querySelectorAll('*');
        for (const shadowEl of shadowElements) {
          if (traverse(shadowEl)) return true;
        }
      }
      
      // Check children
      for (const child of element.children) {
        if (traverse(child)) return true;
      }
      
      return false;
    }
    
    return traverse(rootElement);
  }
  
  static findByAriaPattern(pattern) {
    const elements = document.querySelectorAll('[aria-label]');
    for (const element of elements) {
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel && pattern.test(ariaLabel)) {
        return element;
      }
    }
    return null;
  }
}

// ============================================================================
// VIEWER COUNT DETECTOR MODULE  
// ============================================================================
class ViewerCountDetector {
  constructor() {
    this.selectors = this.getSelectorsForPlatform(platform);
    this.lastFoundElement = null;
    this.lastContainer = null;
  }
  
  getSelectorsForPlatform(platform) {
    const selectors = {
      tiktok: [
        '[data-e2e="live-room-viewers"]',
        '[data-testid="live-room-viewers"]', 
        '[data-e2e*="live-audience"]',
        '[data-e2e*="viewer-count"]',
        '[data-testid*="viewer"]',
        '[class*="LiveViewerCount"]',
        '[class*="AudienceCount"]'
      ],
      twitch: [
        '[data-a-target="animated-channel-viewers-count"]',
        '.live-indicator-container span',
        'p[data-test-selector="viewer-count"]'
      ],
      kick: [
        '[class*="viewer-count"]',
        '[class*="ViewerCount"]', 
        'div[class*="stats"] span:first-child'
      ],
      youtube: [
        'span.ytp-live-badge + span',
        '.ytp-live .ytp-time-current',
        'ytd-video-primary-info-renderer #count'
      ]
    };
    return selectors[platform] || [];
  }
  
  // Always re-query node (React remounts frequently)
  detectViewerCount() {
    this.lastFoundElement = null;
    this.lastContainer = null;
    
    if (platform !== 'tiktok') {
      return this.detectGenericPlatform();
    }
    
    // TIER 1: Modern selectors
    for (const selector of this.selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const parsed = this.parseCount(element);
        if (parsed !== null && parsed > 0) {
          this.lastFoundElement = element;
          this.lastContainer = element.closest('div[data-e2e*="live"], section, [class*="live"]') || element.parentElement;
          return parsed;
        }
      }
    }
    
    // TIER 2: Aria-label parsing with [0-9,.KM]+ regex
    const ariaElement = DomShadowUtils.findByAriaPattern(/[0-9,\.KM]+/);
    if (ariaElement) {
      const ariaLabel = ariaElement.getAttribute('aria-label');
      const match = ariaLabel.match(/([0-9,]+(?:\.[0-9]+)?[KkMm]?)/);
      if (match) {
        const parsed = this.parseCount(match[1].replace(/,/g, ''));
        if (parsed !== null && parsed > 0) {
          this.lastFoundElement = ariaElement;
          this.lastContainer = ariaElement.closest('div[data-e2e*="live"], section') || ariaElement.parentElement;
          return parsed;
        }
      }
    }
    
    // TIER 3: Shadow DOM traversal for viewer badge
    let shadowResult = null;
    DomShadowUtils.traverseShadowRoots(document.documentElement, (element) => {
      const text = element.textContent?.trim() || element.getAttribute('aria-label');
      if (text && /^[0-9,]+(?:\.[0-9]+)?[KkMm]?$/.test(text)) {
        const parsed = this.parseCount(text);
        if (parsed !== null && parsed > CONFIG.VIEWER_MIN_THRESHOLD) {
          shadowResult = parsed;
          this.lastFoundElement = element;
          this.lastContainer = element.parentElement;
          return true;
        }
      }
      return false;
    });
    
    return shadowResult;
  }
  
  detectGenericPlatform() {
    for (const selector of this.selectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent?.trim()) {
        const parsed = this.parseCount(element);
        if (parsed !== null && parsed > 0) {
          this.lastFoundElement = element;
          this.lastContainer = element.parentElement;
          return parsed;
        }
      }
    }
    return null;
  }
  
  parseCount(textOrElement) {
    if (!textOrElement) return null;
    
    let text;
    if (typeof textOrElement === 'string') {
      text = textOrElement;
    } else if (textOrElement.textContent) {
      text = textOrElement.textContent.trim();
    } else {
      return null;
    }
    
    const cleaned = text.toLowerCase().replace(/[\s,]/g, '');
    const match = cleaned.match(/([\d.]+)([km])?/);
    if (!match) return null;
    
    let num = parseFloat(match[1]);
    const suffix = match[2];
    
    if (suffix === 'k') num *= 1000;
    if (suffix === 'm') num *= 1000000;
    
    const result = Math.round(num);
    return isFinite(result) && result >= 0 ? result : null;
  }
  
  getLastContainer() {
    return this.lastContainer;
  }
}

// ============================================================================
// MUTATION BINDING MODULE
// ============================================================================
class MutationBinding {
  constructor(detector, onUpdate) {
    this.detector = detector;
    this.onUpdate = onUpdate;
    this.observer = null;
    this.retryCount = 0;
    this.retryTimer = null;
    this.debounceTimer = null;
  }
  
  bind() {
    this.unbind();
    
    const container = this.detector.getLastContainer();
    if (!container) {
      if (this.retryCount < 5) {
        this.retryCount++;
        this.retryTimer = setTimeout(() => this.bind(), 1000);
      }
      return false;
    }
    
    try {
      this.observer = new MutationObserver((mutations) => {
        // Rebind if container disappears
        if (!document.contains(container)) {
          logger.log('container disappeared, rebinding');
          this.bind();
          return;
        }
        
        // Debounced update
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.onUpdate();
        }, CONFIG.MUTATION_DEBOUNCE_MS);
      });
      
      this.observer.observe(container, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label']
      });
      
      this.retryCount = 0;
      return true;
    } catch (e) {
      logger.error(`mutation binding failed: ${e.message}`);
      return false;
    }
  }
  
  unbind() {
    if (this.observer) {
      try { this.observer.disconnect(); } catch (_) {}
      this.observer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

// ============================================================================
// OBSERVE ROOT MODULE
// ============================================================================
class ObserveRoot {
  constructor() {
    this.detector = new ViewerCountDetector();
    this.mutationBinding = new MutationBinding(this.detector, () => this.handleUpdate());
    this.portManager = new PortManager();
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.isTracking = false;
    this.lastCount = 0;
    this.lastEmitTime = 0;
  }
  
  startTracking() {
    if (this.isTracking) return;
    this.isTracking = true;
    
    logger.log('tracking started');
    
    // Initialize port connection
    this.portManager.connect();
    
    // Start polling cycle (800ms)
    this.pollTimer = setInterval(() => {
      this.handleUpdate();
    }, CONFIG.POLL_INTERVAL_MS);
    
    // Start heartbeat (5s even if unchanged)
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
    
    // Try to bind mutation observer
    this.handleUpdate();
    this.mutationBinding.bind();
  }
  
  stopTracking() {
    if (!this.isTracking) return;
    this.isTracking = false;
    
    logger.log('tracking stopped');
    
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    
    this.mutationBinding.unbind();
    this.portManager.disconnect();
  }
  
  handleUpdate() {
    const count = this.detector.detectViewerCount();
    
    if (count === null) {
      // Throttled missing log
      logger.missing();
      return;
    }
    
    logger.value(count);
    
    const now = Date.now();
    const delta = this.lastCount > 0 ? count - this.lastCount : 0;
    
    // Send update if count changed or first detection
    if (count !== this.lastCount || this.lastCount === 0) {
      this.portManager.sendMessage({
        type: MESSAGE_TYPES.VIEWER_UPDATE,
        platform,
        count,
        delta,
        timestamp: now,
        source: this.lastCount === 0 ? 'initial' : 'update'
      });
      
      this.lastCount = count;
      this.lastEmitTime = now;
    }
  }
  
  sendHeartbeat() {
    if (this.lastCount > 0) {
      this.portManager.sendMessage({
        type: MESSAGE_TYPES.VIEWER_HEARTBEAT,
        platform,
        count: this.lastCount,
        timestamp: Date.now()
      });
    }
  }
}

// ============================================================================
// PORT MANAGER MODULE  
// ============================================================================
class PortManager {
  constructor() {
    this.port = null;
    this.retryCount = 0;
    this.retryTimer = null;
    this.isConnected = false;
  }
  
  connect() {
    this.disconnect();
    
    try {
      this.port = chrome.runtime.connect({ name: 'viewer-count-port' });
      this.isConnected = true;
      this.retryCount = 0;
      
      this.port.onDisconnect.addListener(() => {
        logger.log('port disconnected');
        this.isConnected = false;
        this.port = null;
        this.scheduleReconnect();
      });
      
      logger.log('port connected');
    } catch (error) {
      logger.error(`port connection failed: ${error.message}`);
      this.isConnected = false;
      this.port = null;
      this.scheduleReconnect();
    }
  }
  
  disconnect() {
    this.isConnected = false;
    if (this.port) {
      try { this.port.disconnect(); } catch (_) {}
      this.port = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
  
  scheduleReconnect() {
    if (this.retryCount >= CONFIG.PORT_RETRY_MAX) {
      logger.error('max port retries reached');
      this.retryCount = 0;
      return;
    }
    
    this.retryCount++;
    const delay = Math.min(
      CONFIG.PORT_RETRY_DELAY_BASE * Math.pow(2, this.retryCount - 1),
      CONFIG.PORT_RETRY_DELAY_MAX
    );
    
    this.retryTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  sendMessage(message) {
    // Try port first
    if (this.isConnected && this.port) {
      try {
        this.port.postMessage(message);
        return;
      } catch (error) {
        logger.error(`port send failed: ${error.message}`);
        this.isConnected = false;
        this.port = null;
      }
    }
    
    // Fallback to runtime message
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage(message, () => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message;
          if (!errorMsg.includes('Extension context invalidated')) {
            logger.error(`runtime message failed: ${errorMsg}`);
          }
        }
      });
    }
  }
}

// ============================================================================
// MESSAGE LISTENERS
// ============================================================================
const observeRoot = new ObserveRoot();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.START_TRACKING) {
    observeRoot.startTracking();
    sendResponse({ success: true, platform });
  } else if (message.type === MESSAGE_TYPES.STOP_TRACKING) {
    observeRoot.stopTracking();
    sendResponse({ success: true });
  } else if (message.type === MESSAGE_TYPES.PING) {
    sendResponse({ type: 'PONG', platform, isReady: true });
  }
});

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================
logger.log('content script loaded - v2.2.0-REFACTORED');

// Enhanced cleanup on navigation
function cleanup() {
  try {
    observeRoot.stopTracking();
  } catch (_) {}
}

window.addEventListener('pagehide', cleanup);
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);

})();