// ============================================================================
// LVT PATCH R13: Production-Safe DOM LVT with Complete Message Chain
// ============================================================================

(function(){
  'use strict';
  
  // LVT PATCH R13: Guard against double injection
  try {
    if (window.__SPIKELY_CONTENT_ACTIVE__) {
      console.log('[VIEWER:PAGE] Already active, skipping re-injection');
      return;
    }
  } catch (initError) {
    console.log('[VIEWER:PAGE:ERROR] Init guard failed:', initError.message);
    return;
  }

  // LVT PATCH R13: Platform detection
  const platform = window.location.hostname.includes('tiktok.com') ? 'tiktok' : 'unknown';
  
  // LVT PATCH R13: State variables
  let isTracking = false;
  let viewerNode = null;
  let viewerObserver = null;
  let lastCount = 0;
  let lastEmittedCount = 0;
  let lastEmitTime = 0;
  let scanInterval = null;
  let navCheckInterval = null;
  let lastPathname = window.location.pathname;
  let detectionAttempts = 0;
  const MAX_DETECTION_ATTEMPTS = 10;
  
  // LVT PATCH R13: Mark as active after successful init
  window.__SPIKELY_CONTENT_ACTIVE__ = true;
  window.__spikelyLVT = { watcherId: null, initialized: Date.now() };

  // LVT PATCH R13: Robust viewer count parser with K/M scaling
  function parseViewerCount(text) {
    if (!text || typeof text !== 'string') return null;
    
    // LVT PATCH R13: Extract numeric token  
    const match = text.match(/(\d+(?:\.\d+)?[KkMm]?)/i);
    if (!match) return null;
    
    let num = parseFloat(match[1]);
    const token = match[1].toLowerCase();
    
    // LVT PATCH R13: Apply K/M scaling
    if (token.includes('k')) num *= 1000;
    if (token.includes('m')) num *= 1000000;
    
    const result = Math.round(num);
    
    // LVT PATCH R13: Sanity constraints
    if (result < 0 || result > 200000) {
      console.log(`[VIEWER:PAGE:SANITY_BLOCKED] previous=${lastCount} candidate=${result}`);
      return null;
    }
    
    return result;
  }

  // LVT PATCH R13: Find TikTok authoritative viewer node 
  function findAuthoritativeViewerNode() {
    const allElements = Array.from(document.querySelectorAll('*'));
    
    // LVT PATCH R13: Primary - exact "Viewers · X" pattern in header
    for (const element of allElements) {
      const text = element.textContent?.trim() || '';
      
      // LVT PATCH R13: Look for TikTok viewer header pattern
      if (/^Viewers?\s*[·•]\s*\d+/i.test(text)) {
        const match = text.match(/^Viewers?\s*[·•]\s*(\d+(?:\.\d+)?[KkMm]?)/i);
        if (match) {
          const expectedNumber = match[1];
          
          // LVT PATCH R13: Find element containing just this number
          const container = element.closest('div, section, header');
          if (container) {
            const numberElements = container.querySelectorAll('span, div, strong');
            for (const numEl of numberElements) {
              const numText = numEl.textContent?.trim();
              if (numText === expectedNumber && numEl.offsetParent !== null && numEl.isConnected) {
                const count = parseViewerCount(numText);
                if (count !== null) {
                  console.log(`[VIEWER:PAGE:FOUND] selector="${numEl.tagName}", text="${numText}", value=${count}`);
                  return numEl;
                }
              }
            }
          }
        }
      }
    }
    
    // LVT PATCH R13: Secondary - ARIA/role header search
    const headerRegions = document.querySelectorAll('[role="region"], [role="heading"], header');
    for (const region of headerRegions) {
      const regionText = region.textContent?.toLowerCase();
      if (regionText && regionText.includes('viewer')) {
        const numbers = region.querySelectorAll('span, div');
        for (const numEl of numbers) {
          const numText = numEl.textContent?.trim();
          if (numText && /^\d+(?:\.\d+)?[KkMm]?$/.test(numText)) {
            const count = parseViewerCount(numText);
            if (count !== null && numEl.offsetParent !== null) {
              console.log(`[VIEWER:PAGE:FOUND] selector="header>${numEl.tagName}", text="${numText}", value=${count}`);
              return numEl;
            }
          }
        }
      }
    }
    
    return null;
  }

  // LVT PATCH R13: Emit update with schema v2
  function emitViewerUpdate(newCount) {
    const now = Date.now();
    const delta = lastEmittedCount > 0 ? newCount - lastEmittedCount : 0;
    
    // LVT PATCH R13: Skip if no change or too recent
    if (newCount === lastEmittedCount || (now - lastEmitTime < 250)) {
      return;
    }
    
    lastEmittedCount = newCount;
    lastEmitTime = now;
    
    console.log(`[VIEWER:PAGE] value=${newCount}`);
    if (delta !== 0) {
      console.log(`[VIEWER:PAGE:UPDATE] value=${newCount} delta=${delta}`);
    }
    
    // LVT PATCH R13: Content → Background messaging with schema v2
    if (chrome?.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage({
          type: 'VIEWER_COUNT_UPDATE',
          schemaVersion: 2,
          source: 'dom',
          platform: 'tiktok',
          value: newCount,
          ts: now,
          tabIdHint: null
        });
      } catch (error) {
        console.log('[VIEWER:PAGE] Send error:', error.message);
      }
    }
  }

  // LVT PATCH R13: Attach single MutationObserver with debouncing
  function attachSingleObserver(element) {
    if (!element || !element.isConnected) return;
    
    // LVT PATCH R13: Prevent duplicate observers
    if (window.__spikelyLVT.watcherId) {
      try {
        if (viewerObserver) viewerObserver.disconnect();
      } catch (_) {}
    }
    
    try {
      viewerNode = element;
      window.__spikelyLVT.watcherId = Date.now();
      
      let debounceTimer = null;
      
      viewerObserver = new MutationObserver(() => {
        // LVT PATCH R13: Debounce 150-250ms  
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (viewerNode && viewerNode.isConnected) {
            const text = viewerNode.textContent?.trim();
            if (text) {
              const count = parseViewerCount(text);
              if (count !== null) {
                emitViewerUpdate(count);
              }
            }
          } else {
            console.log('[VIEWER:PAGE:REATTACH] Node disconnected');
            viewerNode = null;
            window.__spikelyLVT.watcherId = null;
          }
        }, 200);
      });
      
      viewerObserver.observe(element, {
        childList: true,
        subtree: true,
        characterData: true
      });
      
      console.log('[VIEWER:PAGE] Observer attached');
      
      // LVT PATCH R13: Emit initial value
      const initialText = element.textContent?.trim();
      if (initialText) {
        const initialCount = parseViewerCount(initialText);
        if (initialCount !== null) {
          emitViewerUpdate(initialCount);
        }
      }
      
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] Observer failed:', error.message);
    }
  }

  // LVT PATCH R13: SPA navigation detection with history API hooks
  function setupSPADetection() {
    try {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      function handleNavigation() {
        const newPathname = window.location.pathname;
        if (newPathname !== lastPathname) {
          console.log(`[VIEWER:PAGE:NAV] from=${lastPathname} to=${newPathname}`);
          lastPathname = newPathname;
          
          // LVT PATCH R13: Clean teardown and restart
          if (viewerObserver) {
            try { viewerObserver.disconnect(); } catch (_) {}
          }
          viewerNode = null;
          window.__spikelyLVT.watcherId = null;
          
          // LVT PATCH R13: Restart after SPA settle
          setTimeout(() => {
            if (isTracking && newPathname.includes('live')) {
              startDetectionLoop();
            }
          }, 500);
        }
      }
      
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        handleNavigation();
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        handleNavigation();
      };
      
      window.addEventListener('popstate', handleNavigation);
      
      // LVT PATCH R13: Periodic URL check for silent changes
      navCheckInterval = setInterval(() => {
        if (window.location.pathname !== lastPathname) {
          handleNavigation();
        }
      }, 1000);
      
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] SPA setup failed:', error.message);
    }
  }

  // LVT PATCH R13: Detection loop with exponential backoff
  function startDetectionLoop() {
    const node = findAuthoritativeViewerNode();
    if (node) {
      attachSingleObserver(node);
      detectionAttempts = 0;
    } else {
      detectionAttempts++;
      if (detectionAttempts <= MAX_DETECTION_ATTEMPTS) {
        const delay = Math.min(500 * Math.pow(1.5, detectionAttempts), 5000);
        console.log(`[VIEWER:PAGE] Detection attempt #${detectionAttempts}/${MAX_DETECTION_ATTEMPTS}, retry in ${delay}ms`);
        setTimeout(startDetectionLoop, delay);
      } else {
        console.log('[VIEWER:PAGE:WARN] Max detection attempts reached');
      }
    }
  }

  // LVT PATCH R13: Main tracking function
  function startTracking() {
    if (isTracking) {
      console.log('[VIEWER:PAGE] Already tracking');
      return;
    }
    
    isTracking = true;
    console.log('[VIEWER:PAGE] R13 tracking started');
    
    if (platform === 'tiktok') {
      setupSPADetection();
      
      // LVT PATCH R13: Wait for DOM completion then start detection
      if (document.readyState === 'complete') {
        setTimeout(startDetectionLoop, 100);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(startDetectionLoop, 100);
        });
      }
      
      // LVT PATCH R13: Health monitoring
      scanInterval = setInterval(() => {
        const now = Date.now();
        if (!viewerNode || (now - lastEmitTime > 10000 && lastEmitTime > 0)) {
          console.log('[VIEWER:PAGE:RESCAN] Health check triggered');
          startDetectionLoop();
        }
      }, 5000);
    }
  }

  function stopTracking() {
    if (!isTracking) return;
    isTracking = false;
    
    console.log('[VIEWER:PAGE] Tracking stopped');
    
    try {
      if (viewerObserver) viewerObserver.disconnect();
      if (scanInterval) clearInterval(scanInterval);
      if (navCheckInterval) clearInterval(navCheckInterval);
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] Stop cleanup failed:', error.message);
    }
    
    viewerNode = null;
    if (window.__spikelyLVT) window.__spikelyLVT.watcherId = null;
  }

  // LVT PATCH R13: Message listeners
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.type === 'START_TRACKING') {
        startTracking();
        sendResponse({ success: true, platform });
      } else if (message.type === 'STOP_TRACKING') {
        stopTracking();
        sendResponse({ success: true });
      } else if (message.type === 'PING') {
        sendResponse({ type: 'PONG', platform, isReady: true });
      }
    } catch (error) {
      console.log('[VIEWER:PAGE:ERROR] Message handler failed:', error.message);
      sendResponse({ success: false, error: error.message });
    }
  });

  // LVT PATCH R13: Initialize with error handling
  try {
    console.log(`[VIEWER:PAGE] R13 loaded (${platform})`);
    
    // LVT PATCH R13: Cleanup on page unload
    window.addEventListener('beforeunload', stopTracking);
    window.addEventListener('pagehide', stopTracking);
    
  } catch (error) {
    console.log('[VIEWER:PAGE:ERROR] R13 initialization failed:', error.message);
  }

})();
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
