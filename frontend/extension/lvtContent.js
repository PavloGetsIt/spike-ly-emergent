// ============================================================================
// LVT PATCH R15: Authoritative TikTok DOM LVT Content Script
// ============================================================================

(function() {
  'use strict';
  
  // LVT PATCH R16: Ensure we only run in the top frame when all_frames is enabled
  if (window.top !== window) {
    if (!window.__spikelyLVT_R15_FRAME_SKIP) {
      window.__spikelyLVT_R15_FRAME_SKIP = true;
      console.log('[LVT:R15] skip (non-top frame)');
    }
    return;
  }

  // LVT PATCH R15: Boot guard
  if (window.__spikelyLVT_R15) {
    return;
  }

  window.__spikelyLVT_R15 = true;
  console.log('[LVT:R15] booted');
  
  const HANDSHAKE_MESSAGE_TYPE = 'LVT_CONTENT_READY';
  const TARGETED_VIEWER_SELECTORS = [
    '[data-e2e="live-room-top-viewers"] strong',
    '[data-e2e="live-room-top-viewers"] span',
    '[data-e2e="live-room-top-viewer-count"]',
    '[data-e2e="live-room-top-viewers-count"]',
    '[data-e2e="live-viewers"] span',
    '[data-e2e="viewers-count"] span',
    '[aria-label*="Viewers"] span',
    '[aria-label*="viewers"] span'
  ];
  const VIEWER_LABEL_SELECTORS = [
    '[data-e2e="live-room-top-viewers"]',
    '[data-e2e="live-room-top"]',
    '[data-e2e="live-viewers"]',
    '[aria-label*="Viewers"]',
    '[aria-label*="viewers"]'
  ];
  const VIEWER_CONTAINER_SELECTOR = 'header, section, article, div';
  const VIEWER_NUMBER_SELECTOR = 'span, strong, div';
  const MAX_CONTAINER_SCAN = 800;
  const MAX_SHADOW_HOSTS = 25;

  console.log('[LVT:R15] init handshake stage=boot');
  sendHandshake('boot');

  // State
  let viewerNode = null;
  let observer = null;
  let lastValue = 0;
  let retryCount = 0;
  let viewerNodeStrategy = 'unknown';
  let rebindTimer = null;

  // LVT PATCH R15: Parser with K/M suffix support
  function parseViewerCount(text) {
    if (!text) return null;
    
    const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
    if (!match) return null;
    
    let num = parseFloat(match[1]);
    const token = match[1].toLowerCase();
    
    if (token.includes('k')) num *= 1000;
    if (token.includes('m')) num *= 1000000;
    
    const result = Math.round(num);
    
    // LVT PATCH R15: Sanity bounds
    if (result <= 0 || result > 5000000) {
      console.log(`[LVT:R15] SANITY_BLOCKED candidate=${result}`);
      return null;
    }
    
    return result;
  }

  function sendHandshake(stage, extra = {}) {
    if (!chrome?.runtime?.sendMessage) {
      return;
    }

    const payload = {
      type: HANDSHAKE_MESSAGE_TYPE,
      stage,
      url: location.href,
      timestamp: Date.now(),
      ...extra
    };

    try {
      chrome.runtime.sendMessage(payload, () => {
        if (chrome.runtime.lastError) {
          console.log(`[LVT:R15] handshake stage=${stage} error: ${chrome.runtime.lastError.message}`);
        }
      });
    } catch (err) {
      console.log(`[LVT:R15] handshake stage=${stage} failed: ${err.message}`);
    }
  }

  function isNodeVisible(node) {
    if (!node || !node.isConnected || node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const rect = node.getBoundingClientRect();
    if ((rect.width === 0 && rect.height === 0)) {
      return false;
    }

    const style = window.getComputedStyle(node);
    if (!style) return false;

    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    if (parseFloat(style.opacity || '1') === 0) {
      return false;
    }

    return true;
  }

  function isValidViewerCandidate(node) {
    if (!node) return false;

    const text = node.textContent?.trim();
    if (!text) return false;

    const value = parseViewerCount(text);
    if (value === null) return false;

    return isNodeVisible(node);
  }

  function enumerateRoots() {
    const roots = [document];
    let inspected = 0;

    try {
      const walker = document.createTreeWalker(document, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode() && inspected < MAX_CONTAINER_SCAN) {
        inspected++;
        const el = walker.currentNode;
        if (el.shadowRoot) {
          roots.push(el.shadowRoot);
          if (roots.length >= MAX_SHADOW_HOSTS + 1) {
            break;
          }
        }
      }
    } catch (_) {
      // Ignore tree walker issues (rare in locked-down documents)
    }

    return roots;
  }

  function findUsingSelectors(root) {
    for (const selector of TARGETED_VIEWER_SELECTORS) {
      const node = root.querySelector(selector);
      if (isValidViewerCandidate(node)) {
        return node;
      }
    }
    return null;
  }

  function findUsingLabels(root) {
    for (const selector of VIEWER_LABEL_SELECTORS) {
      const label = root.querySelector(selector);
      if (!label) continue;

      const candidates = label.matches(VIEWER_NUMBER_SELECTOR)
        ? [label]
        : Array.from(label.querySelectorAll(VIEWER_NUMBER_SELECTOR));

      for (const candidate of candidates) {
        if (isValidViewerCandidate(candidate)) {
          return candidate;
        }
      }
    }

    const containers = root.querySelectorAll(VIEWER_CONTAINER_SELECTOR);
    let inspected = 0;

    for (const container of containers) {
      if (inspected++ >= MAX_CONTAINER_SCAN) break;
      const text = container.textContent?.trim();

      if (!text || !/Viewers?/i.test(text)) continue;

      const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
      if (!match) continue;

      const expectedNumber = match[1];
      const numberElements = container.querySelectorAll(VIEWER_NUMBER_SELECTOR);

      for (const numEl of numberElements) {
        if (numEl.textContent?.trim() === expectedNumber && isValidViewerCandidate(numEl)) {
          return numEl;
        }
      }
    }

    return null;
  }

  // LVT PATCH R16: Optimised viewer node discovery
  function findViewerNode() {
    const roots = enumerateRoots();

    for (const root of roots) {
      const direct = findUsingSelectors(root);
      if (direct) {
        return { node: direct, strategy: 'targeted' };
      }
    }

    for (const root of roots) {
      const viaLabel = findUsingLabels(root);
      if (viaLabel) {
        return { node: viaLabel, strategy: 'label' };
      }
    }

    return null;
  }

  // LVT PATCH R15: Emit viewer count update
  function emitUpdate(value) {
    if (value === lastValue) return;
    
    lastValue = value;
    console.log(`[LVT:R15] emit value=${value}`);
    
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'VIEWER_COUNT_UPDATE',
        value: value
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log(`[LVT:R15] send error: ${chrome.runtime.lastError.message}`);
        }
      });
    }
  }

  // LVT PATCH R15: Attach watcher
  function attachWatcher(node, strategy = 'unknown') {
    if (!node) return;
    
    viewerNode = node;
    viewerNodeStrategy = strategy || 'unknown';
    console.log(`[LVT:R15] viewer node detected (strategy=${viewerNodeStrategy})`);
    sendHandshake('viewer_node_detected', { strategy: viewerNodeStrategy });
    
    // Disconnect existing observer
    if (observer) {
      observer.disconnect();
    }
    
    // Emit initial value
    const initialText = node.textContent?.trim();
    if (initialText) {
      const initialValue = parseViewerCount(initialText);
      if (initialValue !== null) {
        emitUpdate(initialValue);
      }
    }
    
    // LVT PATCH R15: MutationObserver with debounce
    let debounceTimer = null;
    
    observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (viewerNode && viewerNode.isConnected) {
          const text = viewerNode.textContent?.trim();
          if (text) {
            const value = parseViewerCount(text);
            if (value !== null) {
              emitUpdate(value);
            }
          }
        } else {
          handleNavigation('node_disconnect');
        }
      }, 250);
    });
    
    observer.observe(node, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  // LVT PATCH R15: Detection with retry
  function startDetection() {
    const discovery = findViewerNode();
    
    if (discovery?.node) {
      attachWatcher(discovery.node, discovery.strategy);
      retryCount = 0;
    } else {
      retryCount++;
      if (retryCount <= 15) {
        setTimeout(startDetection, 1000);
      }
    }
  }

  // LVT PATCH R15: SPA navigation handling
  function handleNavigation(reasonOrEvent = 'spa_navigation') {
    const reason = typeof reasonOrEvent === 'string' ? reasonOrEvent : 'spa_navigation';
    console.log(`[LVT:R15] rebinding... reason=${reason}`);
    sendHandshake('rebinding', { reason, strategy: viewerNodeStrategy });
    
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    viewerNode = null;
    viewerNodeStrategy = 'unknown';
    retryCount = 0;
    
    if (rebindTimer) {
      clearTimeout(rebindTimer);
    }

    rebindTimer = setTimeout(() => {
      startDetection();
      rebindTimer = null;
    }, 1000);
  }

  // LVT PATCH R15: Hook SPA navigation
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    handleNavigation('spa_pushstate');
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    handleNavigation('spa_replacestate');
  };
  
  window.addEventListener('popstate', () => handleNavigation('history_popstate'));

  // LVT PATCH R15: Start detection
  if (document.readyState === 'complete') {
    setTimeout(startDetection, 100);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(startDetection, 100);
    });
  }

  // LVT PATCH R15: Cleanup
  window.addEventListener('beforeunload', () => {
    if (observer) observer.disconnect();
    if (rebindTimer) {
      clearTimeout(rebindTimer);
      rebindTimer = null;
    }
  });

})();
