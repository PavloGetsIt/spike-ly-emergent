// TikTok Live Chat Tracker
// Monitors chat activity, sentiment, and engagement metrics

class TikTokChatTracker {
  constructor() {
    this.isActive = false;
    this.observer = null;
    this.commentBuffer = []; // Last 100 comments for rate calculation
    this.commentRate = 0; // Comments per minute
    this.lastRateCalculation = 0;
    this.topCommenters = new Map(); // username -> count
    this.followerData = new Map(); // username -> {isFollowing, duration}
    this.sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    
    // Rate limiting
    this.maxCommentsPerMinute = 100;
    this.processingQueue = [];
    this.lastProcessTime = 0;
    
    console.log('[ChatTracker] Initialized for TikTok Live');
  }
  
  // Start tracking TikTok Live chat
  startTracking() {
    if (this.isActive) {
      console.log('[ChatTracker] Already tracking');
      return;
    }
    
    this.isActive = true;
    console.log('[ChatTracker] Starting TikTok Live chat tracking');
    
    // Find chat container
    const chatContainer = this.findChatContainer();
    if (!chatContainer) {
      console.warn('[ChatTracker] Chat container not found, retrying in 2s');
      setTimeout(() => this.startTracking(), 2000);
      return;
    }
    
    console.log('[ChatTracker] ✅ Chat container found, setting up observer');
    this.setupMutationObserver(chatContainer);
    
    // Start rate calculation interval (every 10 seconds)
    this.rateInterval = setInterval(() => {
      this.calculateCommentRate();
      this.updateEngagementMetrics();
    }, 10000);
  }
  
  // Stop tracking
  stopTracking() {
    this.isActive = false;
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.rateInterval) {
      clearInterval(this.rateInterval);
      this.rateInterval = null;
    }
    
    // Reset data
    this.commentBuffer = [];
    this.topCommenters.clear();
    this.followerData.clear();
    this.sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    
    console.log('[ChatTracker] Stopped tracking');
  }
  
  // Find TikTok Live chat container
  findChatContainer() {
    // TikTok Live chat selectors (common patterns)
    const selectors = [
      '[data-e2e="comment-list"]',
      '[class*="chat-list"]',
      '[class*="comment-list"]',
      '[class*="live-comment"]',
      '[data-testid="chat-list"]'
    ];
    
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container) {
        console.log('[ChatTracker] Found chat via selector:', selector);
        return container;
      }
    }
    
    // Fallback: Look for elements with "comment" in class name
    const commentElements = document.querySelectorAll('[class*="comment"]');
    if (commentElements.length > 0) {
      const parent = commentElements[0].closest('[class*="list"], [class*="container"], [class*="wrapper"]');
      if (parent) {
        console.log('[ChatTracker] Found chat via fallback method');
        return parent;
      }
    }
    
    return null;
  }
  
  // Setup mutation observer for new comments
  setupMutationObserver(container) {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNewComment(node);
          }
        });
      });
    });
    
    this.observer.observe(container, {
      childList: true,
      subtree: true
    });
    
    console.log('[ChatTracker] Mutation observer active');
  }
  
  // Process newly detected comment
  processNewComment(element) {
    try {
      // Rate limiting check
      const now = Date.now();
      if (now - this.lastProcessTime < 600) { // Max ~100/min
        return;
      }
      this.lastProcessTime = now;
      
      // Extract comment data
      const commentData = this.extractCommentData(element);
      if (!commentData) return;
      
      // Add to buffer
      this.commentBuffer.push({
        ...commentData,
        timestamp: now
      });
      
      // Keep last 100 comments
      if (this.commentBuffer.length > 100) {
        this.commentBuffer.shift();
      }
      
      // Update metrics
      this.updateCommentMetrics(commentData);
      
      // Send to background for correlation
      chrome.runtime.sendMessage({
        type: 'CHAT_ACTIVITY',
        comment: {
          length: commentData.text.length,
          sentiment: commentData.sentiment,
          username: commentData.username,
          isFollower: commentData.isFollower,
          followerDuration: commentData.followerDuration
        },
        metrics: {
          commentRate: this.commentRate,
          topCommenter: this.getTopCommenter(),
          sentimentRatio: this.getSentimentRatio(),
          engagementLevel: this.getEngagementLevel()
        },
        timestamp: now
      });
      
    } catch (error) {
      console.error('[ChatTracker] Error processing comment:', error);
    }
  }
  
  // Extract comment data from DOM element
  extractCommentData(element) {
    // Find comment text
    const textEl = element.querySelector('[class*="text"], [class*="content"], span, div');
    const text = textEl?.textContent?.trim();
    
    if (!text || text.length === 0) return null;
    
    // Limit to 150 chars (TikTok Live limit)
    const limitedText = text.substring(0, 150);
    
    // Find username
    const usernameEl = element.querySelector('[class*="username"], [class*="user"], [class*="name"]');
    const username = usernameEl?.textContent?.trim() || 'anonymous';
    
    // Detect follower status (look for follower badge/indicator)
    const isFollower = this.detectFollowerStatus(element);
    const followerDuration = isFollower ? this.estimateFollowerDuration(element, username) : null;
    
    // Simple sentiment analysis
    const sentiment = this.analyzeSentiment(limitedText);
    
    return {
      text: limitedText,
      username,
      isFollower,
      followerDuration,
      sentiment,
      length: limitedText.length
    };
  }
  
  // Detect if commenter is a follower
  detectFollowerStatus(element) {
    // Look for common follower indicators in TikTok
    const followers = [
      element.querySelector('[class*="follow"]'),
      element.querySelector('[data-e2e*="follow"]'),
      element.querySelector('[class*="badge"]'),
      element.querySelector('[class*="verified"]')
    ];
    
    return followers.some(el => el !== null);
  }
  
  // Estimate follower duration (simplified)
  estimateFollowerDuration(element, username) {
    // Look for follower badge text or duration indicators
    const badgeEl = element.querySelector('[class*="badge"], [class*="duration"]');
    if (badgeEl) {
      const text = badgeEl.textContent?.toLowerCase();
      
      // Extract duration patterns
      if (text.includes('new')) return 'new'; // New follower
      if (text.includes('day')) return 'days';
      if (text.includes('week')) return 'weeks';
      if (text.includes('month')) return 'months';
      if (text.includes('year')) return 'years';
    }
    
    // Fallback: Check if we've seen this username before
    const existingData = this.followerData.get(username);
    if (existingData) {
      return existingData.duration;
    }
    
    return 'unknown';
  }
  
  // Simple sentiment analysis
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();
    
    // Positive indicators
    const positive = ['love', 'amazing', 'great', 'awesome', 'best', 'good', 'nice', 'cool', 'wow', '❤️', '🔥', '😍', '👍', '✨'];
    const negative = ['hate', 'bad', 'terrible', 'awful', 'worst', 'sucks', 'boring', 'stupid', '💩', '👎', '😡', '😤'];
    
    let positiveCount = positive.filter(word => lowerText.includes(word)).length;
    let negativeCount = negative.filter(word => lowerText.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }
  
  // Update comment metrics
  updateCommentMetrics(commentData) {
    // Update top commenters
    const currentCount = this.topCommenters.get(commentData.username) || 0;
    this.topCommenters.set(commentData.username, currentCount + 1);
    
    // Update follower data
    if (commentData.isFollower) {
      this.followerData.set(commentData.username, {
        isFollowing: true,
        duration: commentData.followerDuration,
        lastSeen: Date.now()
      });
    }
    
    // Update sentiment counts
    this.sentimentCounts[commentData.sentiment]++;
  }
  
  // Calculate comments per minute
  calculateCommentRate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Count comments in last minute
    const recentComments = this.commentBuffer.filter(c => c.timestamp > oneMinuteAgo);
    this.commentRate = recentComments.length;
    
    console.log('[ChatTracker] Comment rate:', this.commentRate, '/min');
    this.lastRateCalculation = now;
  }
  
  // Get top commenter
  getTopCommenter() {
    if (this.topCommenters.size === 0) return null;
    
    const sorted = Array.from(this.topCommenters.entries())
      .sort((a, b) => b[1] - a[1]);
    
    return {
      username: sorted[0][0],
      count: sorted[0][1]
    };
  }
  
  // Get sentiment ratio
  getSentimentRatio() {
    const total = this.sentimentCounts.positive + this.sentimentCounts.negative + this.sentimentCounts.neutral;
    if (total === 0) return { positive: 0, negative: 0, neutral: 0 };
    
    return {
      positive: (this.sentimentCounts.positive / total * 100).toFixed(1),
      negative: (this.sentimentCounts.negative / total * 100).toFixed(1),
      neutral: (this.sentimentCounts.neutral / total * 100).toFixed(1)
    };
  }
  
  // Calculate engagement level
  getEngagementLevel() {
    if (this.commentRate >= 20) return 'HIGH';
    if (this.commentRate >= 10) return 'MEDIUM';
    return 'LOW';
  }
  
  // Update engagement metrics and send to correlation engine
  updateEngagementMetrics() {
    const metrics = {
      commentRate: this.commentRate,
      engagementLevel: this.getEngagementLevel(),
      topCommenter: this.getTopCommenter(),
      sentimentRatio: this.getSentimentRatio(),
      totalComments: this.commentBuffer.length,
      activeCommenters: this.topCommenters.size
    };
    
    // Send to background for correlation
    chrome.runtime.sendMessage({
      type: 'CHAT_METRICS',
      metrics: metrics,
      timestamp: Date.now()
    });
    
    console.log('[ChatTracker] 📊 Chat metrics updated:', metrics);
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.TikTokChatTracker = TikTokChatTracker;
}

export { TikTokChatTracker };