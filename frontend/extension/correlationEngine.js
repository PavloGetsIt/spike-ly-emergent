// Correlation engine for matching viewer changes with transcript + tone

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
    
    console.log('[Correlation] 🎯 Engine initialized with default threshold:', this.minDelta);
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
    
    // Get transcript from last 20 seconds
    const segment = this.getRecentSegment(now, 20000);
    
    // If no meaningful data, send reminder of winning actions
    if (!segment || segment.wordCount < 5) {
      console.log('[Correlation] ⏰ No recent transcript - sending reminder');
      this.sendReminderInsight(latestViewer.count, latestViewer.delta);
      this.resetCountdown();
      return;
    }
    
    // Generate normal insight with delta = 0 (timer-triggered)
    console.log('[Correlation] ⏰ Generating timed insight with data');
    const tone = await this.analyzeTone(segment.text);
    const insight = await this.generateInsight(0, latestViewer.count, segment, tone, true); // true = timed mode
    
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

    // Get recent transcript segment (last 25 seconds)
    const segment = this.getRecentSegment(timestamp, 25000);
    
    if (!segment || segment.wordCount < 5) {
      console.log('[Correlation] Not enough transcript data for insight');
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

    const text = relevantLines.map(l => l.text).join(' ');
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
        // Prepare payload for AI insight generation
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
        }))
      };

        console.log('🤖 ==========================================');
        console.log('🤖 CALLING CLAUDE API FOR INSIGHT (FastAPI Backend)');
        console.log('🤖 URL: https://stream-insights-2.preview.emergentagent.com/api/generate-insight');
        console.log('🤖 Viewer Delta:', payload.viewerDelta);
        console.log('🤖 Transcript:', payload.transcript.substring(0, 100) + '...');
        console.log('🤖 Top Emotion:', payload.prosody?.topEmotion || 'none');
        console.log('🤖 Signal Quality:', payload.quality);
        console.log('🤖 ==========================================');
        
        // [AI:FETCH:STARTING] diagnostic log with sanitized payload
        console.log('[AI:FETCH:STARTING]', {
          url: 'https://stream-insights-2.preview.emergentagent.com/api/generate-insight',
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
        const backendUrl = 'https://stream-insights-2.preview.emergentagent.com/api/generate-insight';
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

    // Fallback logic (runs if AI disabled, low-impact, or error)
    if (!nextMove) {
      console.warn('⚠️ ==========================================');
      console.warn('⚠️ AI INSIGHT FAILED OR DISABLED - USING FALLBACK');
      console.warn('⚠️ Falling back to template system');
      console.warn('⚠️ ==========================================');
      
      // Fallback to prosody or tone-based feedback
      const isDrop = delta < 0;
      const isDump = delta < -30;
      const isSpike = delta > 20;
      
      // Use prosody if quality is GOOD or better
      if (prosody && (prosody.correlationQuality === 'EXCELLENT' || prosody.correlationQuality === 'GOOD')) {
        console.log(`[Correlation] Using ${prosody.correlationQuality} quality prosody signal`);
        
        if (isSpike) {
          nextMove = this.generateSpikeFeedback(action, delta, prosody);
        } else if (isDump) {
          nextMove = this.generateDumpFeedback(action, delta);
        } else if (isDrop) {
          nextMove = this.generateDropFeedback(action, delta, prosody, tone);
        }
        emotionalLabel = prosody.top_emotion || 'unknown';
      }
      
      // Try FAIR quality for significant drops
      if (!nextMove && prosody && prosody.correlationQuality === 'FAIR' && delta < -20) {
        console.log('[Correlation] Using FAIR quality prosody for drop');
        nextMove = this.generateDropFeedback(action, delta, prosody, tone);
        emotionalLabel = prosody.top_emotion || 'unknown';
      }
      
      // Fallback to transcript-based insights
      if (!nextMove) {
        if (isDump) {
          nextMove = this.generateDumpFeedback(action, delta);
        } else if (isDrop) {
          nextMove = this.generateDropFeedback(action, delta, null, tone);
        } else if (isSpike) {
          nextMove = this.generateSpikeFeedback(action, delta, null);
        } else {
          // NEVER use raw transcript - use safe defaults instead
          nextMove = delta > 0 ? 'Keep doing this' : 'Try something different';
        }
        emotionalLabel = tone?.emotion || segment.topic || 'general';
      }
      
      // [FALLBACK:GENERATED] diagnostic log
      console.log('[FALLBACK:GENERATED]', {
        emotionalLabel: (emotionalLabel || '').slice(0, 50),
        nextMove: (nextMove || '').slice(0, 50),
        emotion: tone?.emotion,
        delta
      });
      
      // Defensive validation: ensure non-empty strings
      if (!emotionalLabel || typeof emotionalLabel !== 'string' || emotionalLabel.trim() === '') {
        emotionalLabel = delta > 0 ? 'content spike' : 'content drop';
        console.warn('[FALLBACK:INVALID] emotionalLabel was invalid, using default');
      }
      if (!nextMove || typeof nextMove !== 'string' || nextMove.trim() === '') {
        nextMove = delta > 0 ? 'Keep doing this' : 'Try something different';
        console.warn('[FALLBACK:INVALID] nextMove was invalid, using default');
      }
      
      // Truncate to safe length (max 200 chars)
      emotionalLabel = emotionalLabel.slice(0, 200);
      nextMove = nextMove.slice(0, 200);
      
      // [FALLBACK:BLEED_DETECTED] Check for transcript bleed (2+ consecutive words OR >40% word overlap)
      const detectBleed = (output, source) => {
        const outputWords = output.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const sourceWords = source.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const sourceText = sourceWords.join(' ');
        
        // Check for 2+ consecutive matching words (stricter than 3+)
        for (let i = 0; i < outputWords.length - 1; i++) {
          const pair = outputWords.slice(i, i + 2).join(' ');
          if (pair.length > 4 && sourceText.includes(pair)) {
            console.warn('[BLEED:DETECTED:2WORDS]', { pair, output: output.slice(0, 50) });
            return true;
          }
        }
        
        // Check for word frequency: if >40% of output words appear in source
        const matchingWords = outputWords.filter(word => 
          word.length > 3 && sourceWords.includes(word)
        );
        const overlapPercent = (matchingWords.length / outputWords.length) * 100;
        
        if (overlapPercent > 40) {
          console.warn('[BLEED:DETECTED:WORDFREQ]', { 
            overlapPercent: overlapPercent.toFixed(1),
            matchingWords: matchingWords.slice(0, 5).join(', '),
            output: output.slice(0, 50)
          });
          return true;
        }
        
        return false;
      };
      
      if (detectBleed(emotionalLabel, segment.text)) {
        console.warn('[FALLBACK:BLEED_DETECTED] emotionalLabel contains transcript, replacing');
        emotionalLabel = delta > 0 ? 'content spike' : 'content drop';
      }
      if (detectBleed(nextMove, segment.text)) {
        console.warn('[FALLBACK:BLEED_DETECTED] nextMove contains transcript, replacing');
        nextMove = delta > 0 ? 'Keep doing this' : 'Try something different';
      }
      
      // Apply urgency styling
      nextMove = this.applyUrgency(nextMove, urgency);
    }

    // Final sanitization pass before emit (catches any remaining bleed)
    const sanitizeAgainstTranscript = (output, source) => {
      if (!output || !source) return output;
      
      const outputWords = output.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      const sourceWords = source.toLowerCase().split(/\s+/).filter(w => w.length > 0);
      const sourceText = sourceWords.join(' ');
      
      // Check for 2+ consecutive word matches
      for (let i = 0; i < outputWords.length - 1; i++) {
        const pair = outputWords.slice(i, i + 2).join(' ');
        if (pair.length > 4 && sourceText.includes(pair)) {
          console.warn('[SANITIZE:BLEED]', { pair, output: output.slice(0, 50) });
          return delta > 0 ? 'Keep this momentum' : 'Pivot to engaging content';
        }
      }
      
      // Check word frequency
      const matchingWords = outputWords.filter(word => 
        word.length > 3 && sourceWords.includes(word)
      );
      const overlapPercent = (matchingWords.length / outputWords.length) * 100;
      
      if (overlapPercent > 40) {
        console.warn('[SANITIZE:WORDFREQ]', { overlapPercent: overlapPercent.toFixed(1) });
        return delta > 0 ? 'Keep this momentum' : 'Pivot to engaging content';
      }
      
      return output;
    };
    
    // Apply final sanitization
    emotionalLabel = sanitizeAgainstTranscript(emotionalLabel, segment.text);
    nextMove = sanitizeAgainstTranscript(nextMove, segment.text);

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
