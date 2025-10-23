// Correlation engine for matching viewer changes with transcript + tone
// VERSION: 2025-06-22-021 - CLAUDE QUALITY ONLY MODE
// Removed ALL fallback logic - only Claude Sonnet 4.5 insights shown

// ==================== DEBUG CONFIGURATION ====================
// Import from background.js or set locally
const DEBUG_HUME = true;
// =============================================================

// Feature flag: disable extension AI calls (web app handles this)
const ENABLE_EXTENSION_AI = true;  // ENABLED for Claude Sonnet 4.5
const AI_MAX_LATENCY_MS = 1500; // 1.5s deadline for AI response

class CorrelationEngine {
  constructor() {
    this.transcriptBuffer = []; // Last 50 transcript lines
    this.viewerBuffer = []; // Last 2000 viewer samples
    this.currentSegment = null;
    this.lastInsightTime = 0;
    this.minInsightInterval = 20000; // 20 seconds between insights
    this.analysisCache = new Map(); // Cache Hume AI results
    this.prosodyHistory = []; // Last 10 prosody samples
    this.minDelta = 3; // Default trigger threshold (updated by slider)
    this.autoInsightTimer = null; // 20-second auto-insight timer
    this.winningActions = []; // Track high-performing actions for reminders
    this.isSystemActive = false; // Track if system is running
    
    // NEW: Dynamic insights tracking
    this.recentInsights = []; // Last 5 insights for anti-repetition
    this.winningTopics = []; // Topics that caused +10 spikes
    this.keywordLibrary = this.initializeKeywordLibrary();
    
    console.log('[Correlation] 🎯 Engine initialized with default threshold:', this.minDelta);
    console.log('[Correlation] 🎯 Dynamic insights mode enabled');
  }
  
  // Initialize keyword library for topic detection
  initializeKeywordLibrary() {
    return {
      gaming: ['game', 'gaming', 'play', 'playing', 'level', 'controller', 'setup', 'fps', 'strategy', 'rpg', 'mmorpg', 'valorant', 'fortnite', 'minecraft', 'cod', 'elden ring', 'boss', 'raid', 'quest', 'loot', 'rank', 'ranked', 'competitive', 'esports', 'pro', 'graphics card', 'gpu', 'cpu', 'pc', 'console', 'ps5', 'xbox'],
      makeup: ['makeup', 'lipstick', 'foundation', 'contour', 'blend', 'blending', 'palette', 'eyeshadow', 'mascara', 'eyeliner', 'highlighter', 'bronzer', 'concealer', 'primer', 'beauty', 'cosmetic', 'glam', 'tutorial', 'brush', 'sponge', 'skincare', 'skin'],
      cooking: ['cook', 'cooking', 'recipe', 'ingredient', 'taste', 'bake', 'baking', 'flavor', 'dish', 'meal', 'food', 'chef', 'kitchen', 'oven', 'stove', 'pan', 'sauce', 'spice', 'seasoning', 'pasta', 'chicken', 'beef', 'vegetable', 'dessert', 'dinner'],
      personal: ['story', 'life', 'family', 'friend', 'relationship', 'feel', 'feeling', 'emotion', 'personal', 'experience', 'happened', 'childhood', 'growing up', 'parents', 'sibling', 'memory', 'remember', 'funny', 'crazy', 'wild', 'believe', 'true'],
      tech: ['tech', 'technology', 'phone', 'computer', 'app', 'software', 'code', 'coding', 'programming', 'developer', 'iphone', 'android', 'laptop', 'tablet', 'gadget', 'device', 'camera', 'video', 'audio', 'review', 'specs', 'feature'],
      fitness: ['workout', 'exercise', 'gym', 'muscle', 'cardio', 'reps', 'sets', 'lifting', 'weights', 'training', 'fitness', 'health', 'diet', 'protein', 'gains', 'shredded', 'bulk', 'cut', 'squat', 'bench', 'deadlift', 'yoga', 'running'],
      interaction: ['chat', 'question', 'ask', 'asking', 'answer', 'comment', 'viewers', 'audience', 'everyone', 'guys', 'yall', 'community', 'follow', 'subscribe', 'like', 'share', 'giveaway', 'prize', 'winner', 'poll'],
      product: ['product', 'brand', 'sponsored', 'link', 'buy', 'purchase', 'discount', 'code', 'promo', 'deal', 'unbox', 'unboxing', 'review', 'recommend', 'worth', 'price', 'cost', 'expensive', 'cheap', 'quality']
    };
  }
  
  // Filter filler words from transcript
  filterFillerWords(text) {
    const fillerWords = ['um', 'uh', 'like', 'you know', 'i mean', 'basically', 'literally', 'actually', 'honestly', 'yeah', 'yep', 'okay', 'ok', 'so', 'well', 'right'];
    let filtered = text.toLowerCase();
    
    // Remove filler phrases first
    fillerWords.forEach(filler => {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      filtered = filtered.replace(regex, ' ');
    });
    
    // Clean up multiple spaces
    filtered = filtered.replace(/\s+/g, ' ').trim();
    
    return filtered;
  }
  
  // Extract keywords from transcript
  extractKeywords(text) {
    const textLower = text.toLowerCase();
    const foundKeywords = new Set();
    
    // Check each category
    for (const [category, keywords] of Object.entries(this.keywordLibrary)) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          foundKeywords.add(category);
          break; // One keyword per category is enough
        }
      }
    }
    
    return Array.from(foundKeywords);
  }
  
  // Calculate transcript quality metrics
  analyzeTranscriptQuality(text) {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    if (wordCount < 10) {
      return { quality: 'LOW', uniqueWordRatio: 0, wordCount };
    }
    
    // Calculate unique word ratio
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const uniqueWordRatio = uniqueWords.size / wordCount;
    
    // Determine quality
    let quality = 'LOW';
    if (wordCount >= 30 && uniqueWordRatio > 0.5) {
      quality = 'HIGH';
    } else if (wordCount >= 20 || uniqueWordRatio > 0.4) {
      quality = 'MEDIUM';
    }
    
    return { quality, uniqueWordRatio, wordCount };
  }
  
  // Track insight for anti-repetition
  trackInsight(insight) {
    if (insight && insight.nextMove) {
      this.recentInsights.push(insight.nextMove);
      // Keep only last 5
      if (this.recentInsights.length > 5) {
        this.recentInsights.shift();
      }
      console.log('[Correlation] 📝 Tracked insight. Recent:', this.recentInsights.length);
    }
  }
  
  // Track winning topics
  trackWinningTopic(topic, delta, keywords) {
    if (delta >= 10 && keywords && keywords.length > 0) {
      const topicStr = `${keywords[0]} ${delta >= 20 ? '+' + delta : 'works'}`;
      this.winningTopics.push(topicStr);
      // Keep only last 5
      if (this.winningTopics.length > 5) {
        this.winningTopics.shift();
      }
      console.log('[Correlation] ✅ Tracked winning topic:', topicStr);
    }
  }
  
  // Start auto-insight timer (generates insights every 20s)
  startAutoInsightTimer() {
    this.stopAutoInsightTimer(); // Clear any existing timer
    this.isSystemActive = true;
    
    console.log('[Correlation] ⏰ Starting 20-second auto-insight timer');
    console.log('[Correlation] ⏰ Timer will emit countdown and generate insights every 20s');
    
    // Emit initial countdown
    this.emitCountdown(20);
    
    this.autoInsightTimer = setInterval(() => {
      console.log('[Correlation] ⏰ 20-second timer triggered - generating auto-insight');
      this.generateTimedInsight();
    }, 20000); // 20 seconds
    
    console.log('[Correlation] ⏰ Timer started successfully, interval ID:', this.autoInsightTimer);
  }
  
  // Stop auto-insight timer
  stopAutoInsightTimer() {
    if (this.autoInsightTimer) {
      clearInterval(this.autoInsightTimer);
      this.autoInsightTimer = null;
      this.isSystemActive = false;
      console.log('[Correlation] ⏰ Auto-insight timer stopped');
    }
  }
  
  // Reset countdown (called when new insight is generated)
  resetCountdown() {
    console.log('[Correlation] ⏰ Countdown reset to 20 seconds');
    this.emitCountdown(20);
  }
  
  // Emit countdown update
  emitCountdown(seconds) {
    console.log('[Correlation] ⏰ Emitting countdown update:', seconds + 's');
    
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'COUNTDOWN_UPDATE',
        seconds: seconds,
        timestamp: Date.now()
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[Correlation] ⏰ Countdown message error (side panel may not be open):', chrome.runtime.lastError.message);
        } else {
          console.log('[Correlation] ⏰ Countdown message sent successfully');
        }
      });
    } else {
      console.warn('[Correlation] ⏰ Chrome runtime not available for countdown');
    }
  }
  
  // Generate timed insight (called by 20s timer)
  async generateTimedInsight() {
    const now = Date.now();
    
    // Get most recent viewer data
    const latestViewer = this.viewerBuffer[this.viewerBuffer.length - 1];
    if (!latestViewer) {
      console.log('[Correlation] ⏰ No viewer data, skipping timed insight');
      return;
    }
    
    // Get transcript from last 40 seconds (increased from 20s for better context)
    const segment = this.getRecentSegment(now, 40000);
    
    // If no meaningful data, send reminder of winning actions
    if (!segment || segment.wordCount < 30) {
      console.log('[Correlation] ⏰ No recent transcript or too short (<30 words) - sending reminder');
      this.sendReminderInsight(latestViewer.count, latestViewer.delta);
      this.resetCountdown();
      return;
    }
    
    // Generate normal insight with delta = 0 (timer-triggered)
    console.log('[Correlation] ⏰ Generating timed insight with data');
    const tone = await this.analyzeTone(segment.text);
    const insight = await this.generateInsight(0, latestViewer.count, segment, tone, true); // true = timed mode
    
    // Handle case where Claude fails and returns null
    if (!insight) {
      console.log('[Correlation] ⏰ Timed insight generation failed (Claude unavailable) - sending reminder');
      this.sendReminderInsight(latestViewer.count, latestViewer.delta);
      this.resetCountdown();
      return;
    }
    
    console.log('[Correlation] 🎯 Timed insight generated:', {
      emotionalLabel: insight.emotionalLabel,
      nextMove: insight.nextMove
    });
    
    // Send insight
    chrome.runtime.sendMessage({
      type: 'INSIGHT',
      ...insight,
      isTimedInsight: true
    });
    
    this.resetCountdown();
  }
  
  // Send reminder of winning actions
  sendReminderInsight(count, delta) {
    if (this.winningActions.length === 0) {
      // No winning actions yet, send generic reminder
      chrome.runtime.sendMessage({
        type: 'INSIGHT',
        delta: 0,
        emotionalLabel: 'Keep engaging',
        nextMove: 'Ask viewers a question. Create buzz',
        text: '',
        isReminder: true,
        source: 'reminder'
      });
      return;
    }
    
    // Get top winning action
    const topAction = this.winningActions[0];
    
    chrome.runtime.sendMessage({
      type: 'INSIGHT',
      delta: 0,
      emotionalLabel: `${topAction.topic} worked`,
      nextMove: `Try ${topAction.topic} again. ${topAction.tone}`,
      text: topAction.text || '',
      isReminder: true,
      source: 'reminder',
      originalDelta: topAction.delta
    });
    
    console.log('[Correlation] 📌 Sent reminder of winning action:', topAction.topic);
  }

  // Update thresholds from settings
  setThresholds(thresholds) {
    const oldMinDelta = this.minDelta;
    
    if (thresholds.minTrigger !== undefined) {
      this.minDelta = thresholds.minTrigger;
      
      // ==================== INSTRUMENTATION ====================
      const timestamp = new Date().toISOString();
      console.log(
        `SLIDER_CHANGE ts=${timestamp} value=${this.minDelta} (previous: ${oldMinDelta})`
      );
      // ==========================================================
    } else {
      console.warn('[Correlation] setThresholds called with invalid structure:', thresholds);
      console.warn('[Correlation] Expected: { minTrigger: number }, got:', typeof thresholds, thresholds);
    }
  }

  // Add prosody metrics to history
  addProsodyMetrics(metrics) {
    this.prosodyHistory.push(metrics);
    if (this.prosodyHistory.length > 10) {
      this.prosodyHistory.shift();
    }
    
    console.log('[Correlation] Prosody added:', {
      excitement: (metrics.excitement * 100).toFixed(1) + '%',
      dominantSignal: metrics.dominantSignal,
      quality: metrics.correlationQuality
    });
    
    // ==================== EXTENDED DEBUG LOGGING ====================
    if (DEBUG_HUME) {
      console.log('[DEBUG_HUME] [Correlation] Full metrics received:', {
        timestamp: new Date(metrics.timestamp).toISOString(),
        excitement: metrics.excitement,
        confidence: metrics.confidence,
        energy: metrics.energy,
        topEmotions: metrics.topEmotions,
        topBursts: metrics.topBursts,
        topLanguageEmotions: metrics.topLanguageEmotions,
        dominantSignal: metrics.dominantSignal,
        avgSignalStrength: metrics.avgSignalStrength,
        correlationQuality: metrics.correlationQuality
      });
      
      if (metrics.topBursts && metrics.topBursts.length > 0) {
        console.log('[DEBUG_HUME] 💥 Correlation received BURSTS:', metrics.topBursts);
      }
      
      if (metrics.topLanguageEmotions && metrics.topLanguageEmotions.length > 0) {
        console.log('[DEBUG_HUME] 📝 Correlation received LANGUAGE EMOTIONS:', metrics.topLanguageEmotions);
      }
    }
    // ================================================================
  }

  // Add transcript line to buffer
  addTranscript(text, timestamp, confidence) {
    const line = {
      text: text.trim(),
      timestamp: new Date(timestamp).getTime(),
      confidence: confidence || 0
    };

    this.transcriptBuffer.push(line);
    
    // Keep last 50 lines
    if (this.transcriptBuffer.length > 50) {
      this.transcriptBuffer.shift();
    }

    console.log('[Correlation] Added transcript:', text.substring(0, 50));
    this.emitEngineStatus('COLLECTING');
  }

  // Add viewer count to buffer
  addViewerCount(count, delta, timestamp) {
    const sample = {
      count,
      delta,
      timestamp: new Date(timestamp).getTime()
    };

    this.viewerBuffer.push(sample);
    
    // Keep last 2000 samples
    if (this.viewerBuffer.length > 2000) {
      this.viewerBuffer.shift();
    }

    // Emit observing status
    this.emitStatus('OBSERVING');

    // ==================== INSTRUMENTATION ====================
    const tsISO = new Date().toISOString();
    const previousCount = this.viewerBuffer.length >= 2 ? this.viewerBuffer[this.viewerBuffer.length - 2].count : count;
    const willEmit = Math.abs(delta) >= this.minDelta;
    
    if (DEBUG_HUME) {
      console.log(
        `CORR_CHECK ts=${tsISO} threshold=${this.minDelta} prev=${previousCount} curr=${count} delta=${delta} willEmit=${willEmit}`
      );
    }
    
    // ==================== DEBUGGER HOOK ====================
    // Enable via: window.__SPIKELY_DEBUG__ = true in console
    if (typeof window !== 'undefined' && window.__SPIKELY_DEBUG__ === true) {
      if (Math.abs(delta) >= Math.abs(this.minDelta)) {
        console.debug(
          `[DEBUG HOOK] Threshold met: delta=${delta}, threshold=${this.minDelta}. ` +
          `Pausing at debugger (if DevTools open)...`
        );
        debugger;  // Pause execution for inspection
      }
    }
    // =======================================================

    // Check if significant change
    if (Math.abs(delta) >= this.minDelta) {
      // Log insight emission
      console.log(
        `INSIGHT_EMIT ts=${tsISO} type="viewer-spike" delta=${delta} threshold=${this.minDelta}`
      );
      
      this.emitStatus('ANALYZING');
      this.emitEngineStatus('CORRELATING');
      // Handle async without blocking
      this.handleSignificantChange(count, delta, timestamp).catch(err => {
        console.error('[CorrelationEngine] Error handling significant change:', err);
        this.emitEngineStatus('FAILED', { reason: 'Processing error', error: err.message });
      });
    } else {
      this.emitEngineStatus('IDLE');
    }
  }

  // Handle significant viewer change
  async handleSignificantChange(count, delta, timestamp) {
    const now = Date.now();
    
    // Rate limit insights
    if (now - this.lastInsightTime < this.minInsightInterval) {
      console.log('[Correlation] Rate limited, skipping insight');
      this.emitEngineStatus('FAILED', { reason: 'Rate limited' });
      return;
    }

    console.log(`[Correlation] Significant change detected: ${delta > 0 ? '+' : ''}${delta}`);

    // Get recent transcript segment (last 40 seconds for better context)
    const segment = this.getRecentSegment(timestamp, 40000);
    
    if (!segment || segment.wordCount < 30) {
      console.log('[Correlation] Not enough transcript data for insight (<30 words)');
      this.emitEngineStatus('FAILED', { reason: 'Insufficient transcript' });
      return;
    }

    this.lastInsightTime = now;

    try {
      // Analyze tone with Hume AI
      console.log('[Correlation] 🔍 Step 1: Analyzing tone with Hume AI...');
      const tone = await this.analyzeTone(segment.text);
      console.log('[Correlation] 🔍 Step 2: Tone analysis complete:', tone?.emotion || 'none');
      
      // Generate insight (now async)
      console.log('[Correlation] 🔍 Step 3: Generating insight...');
      const insight = await this.generateInsight(delta, count, segment, tone);
      
      // Handle case where Claude fails and returns null
      if (!insight) {
        console.log('[Correlation] ❌ Insight generation failed (Claude unavailable) - skipping');
        this.emitEngineStatus('FAILED', { reason: 'Claude API unavailable' });
        return;
      }
      
      console.log('[Correlation] 🔍 Step 4: Insight generated!');
      
      console.log('[Correlation] 🎯 Generated insight to send:', {
        emotionalLabel: insight.emotionalLabel,
        nextMove: insight.nextMove,
        delta: insight.delta,
        source: insight.source || 'unknown'
      });
      
      // Track winning actions (delta >= +10)
      if (delta >= 10) {
        this.winningActions.push({
          topic: segment.topic || 'unknown',
          emotion: tone?.emotion || 'neutral',
          text: segment.text.substring(0, 100),
          delta: delta,
          tone: this.getToneCue(tone),
          timestamp: now
        });
        // Keep only top 10 winning actions
        this.winningActions.sort((a, b) => b.delta - a.delta);
        this.winningActions = this.winningActions.slice(0, 10);
        console.log('[Correlation] 📈 Tracked winning action:', segment.topic, '+' + delta);
      }
      
      // Send to background script
      console.log('[Correlation] 🔍 Step 5: Sending to background script...');
      chrome.runtime.sendMessage({
        type: 'INSIGHT',
        ...insight
      });
      console.log('[Correlation] 🔍 Step 6: Message sent successfully!');
      
      // Reset 20-second countdown
      this.resetCountdown();

      // Log as action
      chrome.runtime.sendMessage({
        type: 'ACTION',
        label: tone.emotion || segment.topic || 'Speech',
        delta: delta,
        text: segment.text,
        startTime: new Date(segment.startTime).toISOString(),
        endTime: new Date(segment.endTime).toISOString()
      });
      
    } catch (error) {
      console.error('[Correlation] ❌ ERROR in generateCorrelation:', error);
      console.error('[Correlation] ❌ Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 200)
      });
      this.emitEngineStatus('FAILED', { reason: error.message });
    }
  }

  // Get recent transcript segment
  getRecentSegment(timestamp, durationMs) {
    const targetTime = new Date(timestamp).getTime();
    const startTime = targetTime - durationMs;

    const relevantLines = this.transcriptBuffer.filter(
      line => line.timestamp >= startTime && line.timestamp <= targetTime
    );

    if (relevantLines.length === 0) {
      return null;
    }

    // Join and filter filler words
    const rawText = relevantLines.map(l => l.text).join(' ');
    const filteredText = this.filterFillerWords(rawText);
    
    // Use filtered text for word count and analysis
    const text = filteredText.length > 20 ? filteredText : rawText; // Fallback to raw if filtering removed too much
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

    return {
      text,
      wordCount,
      startTime: relevantLines[0].timestamp,
      endTime: relevantLines[relevantLines.length - 1].timestamp,
      topic: this.classifyTopic(text)
    };
  }

  // Analyze tone with Hume AI
  async analyzeTone(text) {
    // Check cache
    const cacheKey = text.substring(0, 100);
    if (this.analysisCache.has(cacheKey)) {
      console.log('[Correlation] Using cached tone analysis');
      return this.analysisCache.get(cacheKey);
    }

    try {
      console.log('[Correlation] Analyzing tone with Hume AI...');
      
      const response = await fetch('https://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/hume-analyze-text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`Hume AI error: ${response.status}`);
      }

      const data = await response.json();
      const result = {
        emotion: data.emotion || 'Neutral',
        score: data.score || 0.5,
        confidence: data.confidence || 50
      };

      // Cache result
      this.analysisCache.set(cacheKey, result);
      
      // Limit cache size
      if (this.analysisCache.size > 50) {
        const firstKey = this.analysisCache.keys().next().value;
        this.analysisCache.delete(firstKey);
      }

      console.log('[Correlation] Tone analysis:', result.emotion, result.confidence + '%');
      return result;
    } catch (error) {
      console.error('[Correlation] Tone analysis failed:', error);
      return { emotion: 'Unknown', score: 0.5, confidence: 0 };
    }
  }

  // Classify topic from text
  classifyTopic(text) {
    const lower = text.toLowerCase();
    
    // Topic keywords
    const topics = {
      'cooking': ['cook', 'recipe', 'food', 'eat', 'kitchen', 'chef', 'meal'],
      'gaming': ['game', 'play', 'level', 'win', 'lose', 'match', 'team'],
      'fitness': ['workout', 'exercise', 'gym', 'train', 'fitness', 'health'],
      'music': ['song', 'music', 'sing', 'dance', 'beat', 'rhythm'],
      'chat': ['chat', 'talk', 'question', 'answer', 'comment'],
      'personal': ['me', 'my', 'i am', 'feel', 'think', 'life']
    };

    for (const [topic, keywords] of Object.entries(topics)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        return topic;
      }
    }

    return 'general talk';
  }

  // Extract actual action from transcript
  extractAction(text) {
    const words = text.split(' ');
    
    // Look for "I'm [action]" or "I am [action]"
    const iAmPattern = text.match(/(?:i'm|i am) ([\w\s]{3,30})/i);
    if (iAmPattern) return iAmPattern[1].trim();
    
    // Look for verb phrases with -ing
    const verbPhrases = [];
    for (let i = 0; i < words.length - 2; i++) {
      if (words[i].match(/ing$/)) {
        verbPhrases.push(words.slice(i, Math.min(i + 3, words.length)).join(' '));
      }
    }
    
    // Return most recent verb phrase or last 3-4 words
    if (verbPhrases.length > 0) {
      return verbPhrases[verbPhrases.length - 1];
    }
    
    return words.slice(-4).join(' ');
  }

  // Get urgency level based on delta magnitude
  getUrgencyLevel(delta) {
    const abs = Math.abs(delta);
    if (abs >= 50) return 'CRITICAL';
    if (abs >= 30) return 'HIGH';
    if (abs >= 15) return 'MEDIUM';
    return 'LOW';
  }

  // Apply urgency styling to message
  applyUrgency(message, urgency) {
    switch(urgency) {
      case 'CRITICAL': return `🚨 ${message.toUpperCase()}`;
      case 'HIGH': return `⚠️ ${message}`;
      case 'MEDIUM': return message;
      case 'LOW': return message.toLowerCase();
      default: return message;
    }
  }

  // Generate spike feedback (positive reinforcement)
  generateSpikeFeedback(action, delta, prosody) {
    if (prosody && prosody.dominantSignal === 'Burst' && prosody.topBursts?.[0]) {
      const burstName = prosody.topBursts[0].name.toLowerCase();
      return `That ${burstName} energy is fire! Keep it going`;
    }
    
    if (prosody && prosody.dominantSignal === 'Language' && prosody.topLanguageEmotions?.[0]) {
      const emotion = prosody.topLanguageEmotions[0].name.toLowerCase();
      return `${emotion.charAt(0).toUpperCase() + emotion.slice(1)} vibes working. Double down`;
    }
    
    // NEVER use raw transcript - use safe template instead
    return `Keep doing this. Do more`;
  }

  // Generate drop feedback (corrective but calm)
  generateDropFeedback(action, delta, prosody, tone) {
    if (prosody && prosody.dominantSignal === 'Burst' && prosody.topBursts?.[0]) {
      const burstName = prosody.topBursts[0].name.toLowerCase();
      const opposite = this.getOppositeEmotion(burstName);
      return `${burstName.charAt(0).toUpperCase() + burstName.slice(1)} killed momentum. Switch to ${opposite}`;
    }
    
    if (tone && tone.emotion) {
      const emotion = tone.emotion.toLowerCase();
      const opposite = this.getOppositeEmotion(emotion);
      return `Chat lost interest in ${emotion}. Try ${opposite}`;
    }
    
    // NEVER use raw transcript - use safe template instead
    return `Try something different. Pivot to engaging content`;
  }

  // Generate dump feedback (urgent pivot)
  generateDumpFeedback(action, delta) {
    // NEVER use raw transcript - use safe template instead
    return `STOP! Change topic NOW. Jump into engaging content`;
  }

  // Generate insight based on delta, segment, and tone using AI
  async generateInsight(delta, count, segment, tone, isTimedMode = false) {
    console.log('[CorrelationEngine] 🎯 Generating AI insight', { 
      delta, 
      count, 
      segmentLength: segment?.text.length, 
      tone,
      isTimedMode 
    });
    
    const action = this.extractAction(segment.text);
    
    // Prepare sanitized transcript for logging (available throughout function)
    const words = segment.text.split(/\s+/);
    const truncatedTranscript = words.slice(-100).join(' ');
    const sanitizedTranscript = truncatedTranscript.slice(0, 100).replace(/\n/g, ' ');
    
    // [ACTION:EXTRACTED] Diagnostic log to trace potential bleed sources
    console.log('[ACTION:EXTRACTED]', {
      action: action?.slice(0, 50),
      transcriptPreview: segment.text.slice(0, 100).replace(/\n/g, ' '),
      extractionMethod: 'extractAction()'
    });
    
    const urgency = this.getUrgencyLevel(delta);
    const prosody = this.prosodyHistory[this.prosodyHistory.length - 1];
    const prevCount = count - delta;
    
    let nextMove = '';
    let emotionalLabel = 'analyzing';
    // Call AI for any significant events (based on user's sensitivity setting)
    // OR for timed insights (delta = 0 but isTimedMode = true)
    const isHighImpact = Math.abs(delta) >= this.minDelta || isTimedMode;
    
    // [AI:GATE] diagnostic log with sanitized preview
    const transcriptPreview = segment.text.slice(0, 100).replace(/\n/g, ' ');
    console.log('[AI:GATE] 🎯 Checking AI call threshold:', {
      delta,
      minDelta: this.minDelta,
      absDelta: Math.abs(delta),
      isTimedMode,
      isHighImpact,
      willCallAI: ENABLE_EXTENSION_AI && isHighImpact,
      calculation: isTimedMode ? 'Timed mode - always call AI' : `|${delta}| >= ${this.minDelta} = ${isHighImpact}`,
      transcriptPreview,
      topic: segment.topic,
      emotion: tone?.emotion
    });
    
    // Try AI-powered insight generation first (if enabled and high impact)
    if (ENABLE_EXTENSION_AI && isHighImpact) {
      console.log('[Extension AI] Enabled and high-impact event, calling AI...');
      this.emitEngineStatus('AI_CALLING');
      try {
        // Extract keywords and analyze transcript quality
        const keywords = this.extractKeywords(segment.text);
        const transcriptAnalysis = this.analyzeTranscriptQuality(segment.text);
        
        // Prepare payload for AI insight generation with ENHANCED CONTEXT
        const payload = {
          transcript: truncatedTranscript,
          viewerDelta: delta,
        viewerCount: count,
        prevCount: prevCount,
        prosody: prosody ? {
          topEmotion: prosody.top_emotion,
          topScore: prosody.top_score,
          energy: prosody.metrics?.energy,
          excitement: prosody.metrics?.excitement,
          confidence: prosody.confidence
        } : undefined,
        burst: prosody?.burst,
        language: tone ? { emotion: tone.emotion } : undefined,
        topic: segment.topic,
        quality: prosody?.correlationQuality || 'WEAK',
        recentHistory: this.prosodyHistory.slice(-7).map((h, i) => ({
          delta: this.viewerBuffer[this.viewerBuffer.length - 7 + i]?.delta || 0,
          emotion: h.top_emotion
        })),
        // NEW FIELDS for dynamic insights
        keywordsSaid: keywords,
        recentInsights: this.recentInsights,
        winningTopics: this.winningTopics,
        transcriptQuality: transcriptAnalysis.quality,
        uniqueWordRatio: transcriptAnalysis.uniqueWordRatio
      };

        console.log('🤖 ==========================================');
        console.log('🤖 CALLING CLAUDE API FOR INSIGHT (FastAPI Backend)');
        console.log('🤖 URL: https://project-continuity-5.preview.emergentagent.com/api/generate-insight');
        console.log('🤖 Viewer Delta:', payload.viewerDelta);
        console.log('🤖 Transcript:', payload.transcript.substring(0, 100) + '...');
        console.log('🤖 Keywords Detected:', keywords.join(', ') || 'none');
        console.log('🤖 Transcript Quality:', transcriptAnalysis.quality);
        console.log('🤖 Recent Insights:', this.recentInsights.length);
        console.log('🤖 Winning Topics:', this.winningTopics.length);
        console.log('🤖 Top Emotion:', payload.prosody?.topEmotion || 'none');
        console.log('🤖 Signal Quality:', payload.quality);
        console.log('🤖 ==========================================');
        
        // [AI:FETCH:STARTING] diagnostic log with sanitized payload
        console.log('[AI:FETCH:STARTING]', {
          url: 'https://project-continuity-5.preview.emergentagent.com/api/generate-insight',
          payloadSize: JSON.stringify(payload).length,
          transcriptPreview: sanitizedTranscript,
          delta: payload.viewerDelta,
          topic: payload.topic,
          timestamp: new Date().toISOString()
        });

        // Add AbortController with strict timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          console.warn(`[Extension AI] Timeout after ${AI_MAX_LATENCY_MS}ms → fallback`);
        }, AI_MAX_LATENCY_MS);

        const aiStartTime = performance.now();
        const backendUrl = 'https://project-continuity-5.preview.emergentagent.com/api/generate-insight';
        const response = await fetch(backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const aiDuration = performance.now() - aiStartTime;

        if (response.ok) {
          const aiInsight = await response.json();
          console.log('✅ ==========================================');
          console.log('✅ CLAUDE INSIGHT RECEIVED (Extension)');
          console.log('✅ Response Time:', Math.round(aiDuration), 'ms');
          console.log('✅ Emotional Label:', aiInsight.emotionalLabel);
          console.log('✅ Next Move:', aiInsight.nextMove);
          console.log('✅ ==========================================');
          
          if (aiInsight.emotionalLabel && aiInsight.nextMove) {
            emotionalLabel = aiInsight.emotionalLabel;
            nextMove = aiInsight.nextMove;
            console.log('[Correlation] ✅ Using Claude insight - Label:', emotionalLabel, 'Move:', nextMove);
          } else {
            throw new Error('Invalid AI response format');
          }
        } else {
          const errorText = await response.text();
          const errorPreview = errorText.slice(0, 100).replace(/\n/g, ' ');
          console.error('❌ ==========================================');
          console.error('❌ CLAUDE API FAILED (Extension)');
          console.error('❌ Status:', response.status);
          console.error('❌ Error:', errorPreview);
          console.error('❌ Duration:', Math.round(aiDuration), 'ms');
          console.error('❌ ==========================================');
          
          // [AI:FETCH:FAILED] diagnostic log
          console.error('[AI:FETCH:FAILED]', {
            errorName: 'HTTPError',
            errorPreview,
            status: response.status,
            delta,
            topic: segment.topic,
            transcriptPreview: sanitizedTranscript
          });
          
          throw new Error(`AI API error: ${response.status}`);
        }
      } catch (error) {
        // [AI:FETCH:FAILED] diagnostic log with error preview
        const errorPreview = error instanceof Error 
          ? (error.message || String(error)).slice(0, 100).replace(/\n/g, ' ')
          : String(error).slice(0, 100).replace(/\n/g, ' ');
        
        const isAbortError = error.name === 'AbortError';
        
        if (isAbortError) {
          console.warn('[AI:FETCH:FAILED]', {
            errorName: 'AbortError',
            errorPreview: 'Timeout exceeded',
            isAbortError: true,
            delta,
            topic: segment.topic,
            transcriptPreview: sanitizedTranscript
          });
        } else {
          console.error('[AI:FETCH:FAILED]', {
            errorName: error instanceof Error ? error.name : 'UnknownError',
            errorPreview,
            isAbortError: false,
            delta,
            topic: segment.topic,
            transcriptPreview: sanitizedTranscript
          });
        }
        
        if (error.name === 'AbortError') {
          console.warn(`⏱️ Extension AI timeout → fallback`);
          this.emitEngineStatus('AI_FALLBACK', { reason: 'AI timeout' });
        } else {
          console.warn('⚠️ Extension AI error:', error.message);
          this.emitEngineStatus('AI_FALLBACK', { reason: 'AI error', error: error.message });
        }
        // Don't re-throw, just continue to fallback logic
      }
    } else {
      console.log('[Extension AI] Disabled or low-impact event, using fallback');
      this.emitEngineStatus('AI_FALLBACK', { reason: 'AI disabled or low-impact' });
    }

    // Claude Quality Check - NO FALLBACK LOGIC
    console.log('[Correlation] 🔍 Quality Check - emotionalLabel:', emotionalLabel, 'nextMove:', nextMove ? nextMove.substring(0, 50) : 'null');
    
    if (!nextMove) {
      console.warn('⚠️ ==========================================');
      console.warn('⚠️ CLAUDE INSIGHT FAILED - SKIPPING INSIGHT');
      console.warn('⚠️ No low-quality fallback - waiting for next Claude insight');
      console.warn('⚠️ ==========================================');
      
      // Do NOT generate insight if Claude failed
      // Return null to skip this insight generation
      return null;
    }
    
    // If we reach here, Claude succeeded - use Claude insight only
    console.log('✅ ==========================================');
    console.log('✅ USING CLAUDE INSIGHT (Quality-Only Mode)');
    console.log('✅ Label:', emotionalLabel);
    console.log('✅ Move:', nextMove);
    console.log('✅ ==========================================');

    // Trust Claude insights - NO sanitization that could replace them
    // Backend already handles transcript bleed detection
    console.log('[Correlation] ✅ Trusting Claude insight as-is (no frontend sanitization)');

    // [EMIT:PRE] Final validation diagnostic before emit
    const sanitizedEmotionalLabel = typeof emotionalLabel === 'string' 
      ? emotionalLabel.slice(0, 50).replace(/\n/g, ' ') 
      : String(emotionalLabel);
    const sanitizedNextMove = typeof nextMove === 'string' 
      ? nextMove.slice(0, 50).replace(/\n/g, ' ') 
      : String(nextMove);
    
    console.log('[EMIT:PRE]', {
      emotionalLabelType: typeof emotionalLabel,
      emotionalLabelPreview: sanitizedEmotionalLabel,
      nextMoveType: typeof nextMove,
      nextMovePreview: sanitizedNextMove,
      delta,
      topic: segment.topic,
      transcriptPreview: segment.text.slice(0, 50).replace(/\n/g, ' ')
    });
    
    const insight = {
      delta,
      count,
      text: segment.text,
      topic: segment.topic,
      emotion: tone.emotion,
      emotionScore: tone.score,
      confidence: tone.confidence,
      nextMove,
      emotionalLabel,
      correlationQuality: prosody?.correlationQuality || 'WEAK',
      timestamp: new Date().toISOString()
    };

    // Emit SUCCESS status with source, then auto-transition to IDLE
    const source = (ENABLE_EXTENSION_AI && isHighImpact && nextMove) ? 'Claude' : 'Fallback';
    this.emitEngineStatus('SUCCESS', { source });
    setTimeout(() => this.emitEngineStatus('IDLE'), 3000);

    return insight;
  }

  // Helper to get opposite emotion for suggestions
  getOppositeEmotion(emotion) {
    const opposites = {
      'awkwardness': 'confident energy',
      'boredom': 'hype content NOW',
      'confusion': 'clear explanations',
      'anger': 'chill vibes',
      'sadness': 'upbeat energy',
      'fear': 'bold moves',
      'disgust': 'positive vibes',
      'laughter': 'calm energy',
      'excitement': 'relaxed talk'
    };
    return opposites[emotion] || 'engaging content';
  }

  // Emit status update
  emitStatus(status) {
    chrome.runtime.sendMessage({
      type: 'SYSTEM_STATUS',
      status: status,
      timestamp: Date.now()
    });
  }

  // Emit engine status for correlation pipeline
  emitEngineStatus(status, meta = {}) {
    console.debug('[ENGINE_STATUS:EXT:EMIT]', status, meta);
    chrome.runtime.sendMessage({
      type: 'ENGINE_STATUS',
      status,
      meta
    }, () => {
      if (chrome.runtime.lastError) {
        // Ignore errors when side panel isn't open
      }
    });
  }
  
  // Helper to get tone cue from emotion
  getToneCue(tone) {
    const toneCues = {
      'joy': 'Stay hyped',
      'excitement': 'Keep energy high',
      'admiration': 'Be authentic',
      'amusement': 'Stay playful',
      'love': 'Be vulnerable',
      'interest': 'Stay curious',
      'determination': 'Stay focused',
      'concentration': 'Be direct',
      'calmness': 'Stay present',
      'default': 'Build excitement'
    };
    
    return toneCues[tone?.emotion] || toneCues.default;
  }

  reset() {
    this.transcriptBuffer = [];
    this.viewerBuffer = [];
    this.currentSegment = null;
    this.lastInsightTime = 0;
    this.analysisCache.clear();
    this.prosodyHistory = [];
    this.winningActions = [];
    this.stopAutoInsightTimer();
    this.emitStatus('IDLE');
    console.log('[Correlation] Engine reset');
  }
}

// Export singleton instance
export const correlationEngine = new CorrelationEngine();
