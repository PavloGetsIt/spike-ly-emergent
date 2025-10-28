// TikTok Live Engagement Events Tracker
// Monitors hearts, gifts, follows, and other engagement signals

class TikTokEngagementTracker {
  constructor() {
    this.isActive = false;
    this.heartCount = 0;
    this.heartRate = 0; // Hearts per minute
    this.giftEvents = []; // Last 20 gifts
    this.followEvents = []; // Last 20 follows
    this.heartBuffer = []; // Last minute of hearts for rate calc
    
    // Metrics calculation
    this.lastMetricsUpdate = 0;
    this.metricsInterval = 10000; // Update every 10s
    
    console.log('[EngagementTracker] Initialized for TikTok Live');
  }
  
  // Start tracking engagement events
  startTracking() {
    if (this.isActive) return;
    
    this.isActive = true;
    console.log('[EngagementTracker] Starting TikTok engagement tracking');
    
    // Setup heart tracking
    this.setupHeartTracking();
    
    // Setup gift tracking
    this.setupGiftTracking();
    
    // Setup follow tracking
    this.setupFollowTracking();
    
    // Start metrics calculation interval
    this.metricsInterval = setInterval(() => {
      this.calculateMetrics();
    }, 10000);
  }
  
  // Stop tracking
  stopTracking() {
    this.isActive = false;
    
    if (this.heartObserver) {
      this.heartObserver.disconnect();
      this.heartObserver = null;
    }
    
    if (this.giftObserver) {
      this.giftObserver.disconnect();
      this.giftObserver = null;
    }
    
    if (this.followObserver) {
      this.followObserver.disconnect();
      this.followObserver = null;
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    console.log('[EngagementTracker] Stopped tracking');
  }
  
  // Setup heart/like tracking
  setupHeartTracking() {
    // Common TikTok heart button selectors
    const heartSelectors = [
      '[data-e2e="browse-like-icon"]',
      '[data-e2e="like-icon"]',
      '[class*="heart"]',
      '[class*="like"]',
      '[aria-label*="like"]',
      'button[class*="heart"]'
    ];
    
    let heartButton = null;
    for (const selector of heartSelectors) {
      heartButton = document.querySelector(selector);
      if (heartButton) {
        console.log('[EngagementTracker] Found heart button:', selector);
        break;
      }
    }
    
    if (!heartButton) {
      console.warn('[EngagementTracker] Heart button not found');
      return;
    }
    
    // Monitor heart count changes
    const heartCountEl = this.findHeartCountElement(heartButton);
    if (heartCountEl) {
      this.heartObserver = new MutationObserver(() => {
        this.onHeartCountChange(heartCountEl);
      });
      
      this.heartObserver.observe(heartCountEl, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    
    // Also listen for click events on heart area
    const heartArea = heartButton.closest('[class*="interaction"], [class*="action"], [class*="bottom"]');
    if (heartArea) {
      heartArea.addEventListener('click', () => {
        this.onHeartActivity();
      });
    }
  }
  
  // Find heart count element
  findHeartCountElement(heartButton) {
    // Look for count near heart button
    const parent = heartButton.parentElement;
    if (!parent) return null;
    
    // Common patterns for like counts
    const countSelectors = [
      '[class*="count"]',
      '[class*="number"]', 
      'span',
      'div'
    ];
    
    for (const selector of countSelectors) {
      const countEl = parent.querySelector(selector);
      if (countEl && /^\d+[KM]?$/.test(countEl.textContent?.trim())) {
        return countEl;
      }
    }
    
    return null;
  }
  
  // Setup gift/tip tracking
  setupGiftTracking() {
    // Look for gift notifications or animations
    const giftSelectors = [
      '[class*="gift"]',
      '[class*="present"]',
      '[class*="tip"]',
      '[data-e2e*="gift"]'
    ];
    
    let giftContainer = document.body; // Monitor whole page for gift notifications
    
    this.giftObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.checkForGiftEvent(node);
          }
        });
      });
    });
    
    this.giftObserver.observe(giftContainer, {
      childList: true,
      subtree: true
    });
    
    console.log('[EngagementTracker] Gift tracking active');
  }
  
  // Setup follow event tracking
  setupFollowTracking() {
    // Monitor for follow button changes or follow notifications
    const followSelectors = [
      '[data-e2e="follow-button"]',
      '[class*="follow"]',
      'button[class*="follow"]'
    ];
    
    for (const selector of followSelectors) {
      const followBtn = document.querySelector(selector);
      if (followBtn) {
        this.followObserver = new MutationObserver(() => {
          this.onFollowEvent(followBtn);
        });
        
        this.followObserver.observe(followBtn, {
          attributes: true,
          childList: true,
          characterData: true
        });
        
        console.log('[EngagementTracker] Follow tracking active');
        break;
      }
    }
  }
  
  // Handle heart count changes
  onHeartCountChange(countElement) {
    const countText = countElement.textContent?.trim();
    if (!countText) return;
    
    // Parse count (handle K, M suffixes)
    let count = parseInt(countText);
    if (countText.includes('K')) count *= 1000;
    if (countText.includes('M')) count *= 1000000;
    
    if (count > this.heartCount) {
      const increase = count - this.heartCount;
      this.heartCount = count;
      this.onHeartActivity(increase);
    }
  }
  
  // Handle heart activity
  onHeartActivity(increase = 1) {
    const now = Date.now();
    
    // Add to heart buffer for rate calculation
    for (let i = 0; i < increase; i++) {
      this.heartBuffer.push(now);
    }
    
    // Keep last minute of hearts
    const oneMinuteAgo = now - 60000;
    this.heartBuffer = this.heartBuffer.filter(t => t > oneMinuteAgo);
    
    // Update heart rate
    this.heartRate = this.heartBuffer.length; // Hearts per minute
    
    console.log('[EngagementTracker] 💖 Heart activity +', increase, '| Rate:', this.heartRate, '/min');
  }
  
  // Check for gift events in new DOM nodes
  checkForGiftEvent(node) {
    // Look for gift-related text or animations
    const giftKeywords = ['gift', 'present', 'tip', 'diamond', 'rose', 'car', 'mansion'];
    const text = node.textContent?.toLowerCase() || '';
    
    for (const keyword of giftKeywords) {
      if (text.includes(keyword)) {
        this.onGiftEvent(text, node);
        break;
      }
    }
  }
  
  // Handle gift event
  onGiftEvent(giftText, element) {
    const now = Date.now();
    
    // Extract gift value/type if possible
    const giftData = {
      text: giftText.substring(0, 100),
      timestamp: now,
      element: element.className
    };
    
    this.giftEvents.push(giftData);
    if (this.giftEvents.length > 20) {
      this.giftEvents.shift();
    }
    
    console.log('[EngagementTracker] 🎁 Gift event detected:', giftText.substring(0, 50));
  }
  
  // Handle follow events
  onFollowEvent(followButton) {
    // Check if follow count increased or button state changed
    const now = Date.now();
    
    // Avoid duplicate events
    if (now - this.lastFollowEvent < 2000) return;
    this.lastFollowEvent = now;
    
    this.followEvents.push({
      timestamp: now,
      buttonState: followButton.textContent?.trim()
    });
    
    if (this.followEvents.length > 20) {
      this.followEvents.shift();
    }
    
    console.log('[EngagementTracker] 👥 Follow event detected');
  }
  
  // Calculate and send metrics
  calculateMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Calculate rates
    const recentGifts = this.giftEvents.filter(g => g.timestamp > oneMinuteAgo);
    const recentFollows = this.followEvents.filter(f => f.timestamp > oneMinuteAgo);
    
    const metrics = {
      heartRate: this.heartRate,
      giftRate: recentGifts.length, // Gifts per minute
      followRate: recentFollows.length, // Follows per minute
      totalHearts: this.heartCount,
      totalGifts: this.giftEvents.length,
      totalFollows: this.followEvents.length,
      engagementScore: this.calculateEngagementScore()
    };
    
    // Send to background
    chrome.runtime.sendMessage({
      type: 'ENGAGEMENT_METRICS',
      metrics: metrics,
      timestamp: now
    });
    
    console.log('[EngagementTracker] 📈 Engagement metrics:', metrics);
  }
  
  // Calculate overall engagement score
  calculateEngagementScore() {
    // Weighted score: hearts (1x) + comments (3x) + gifts (10x) + follows (5x)
    const score = this.heartRate + (this.commentRate * 3) + (this.giftEvents.length * 10) + (this.followEvents.length * 5);
    return Math.round(score);
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.TikTokEngagementTracker = TikTokEngagementTracker;
}

export { TikTokEngagementTracker };