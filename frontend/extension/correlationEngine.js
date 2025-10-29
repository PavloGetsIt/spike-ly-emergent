// Correlation engine for matching viewer changes with transcript + tone
// VERSION: 2.0.6-STABLE (ROLLBACK)
// Restored stable functionality, removed experimental Phase 1 features

// ==================== DEBUG CONFIGURATION ====================
// Import from background.js or set locally
const DEBUG_HUME = true;
// =============================================================

// Feature flag: disable extension AI calls (web app handles this)
const ENABLE_EXTENSION_AI = true;  // ENABLED for Claude Sonnet 4.5
const AI_MAX_LATENCY_MS = 2500; // Balanced: 2.5s timeout (increased from 2000ms to reduce timeouts)

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
    
    // CorrelationId tracking
    this.insightSequence = 0; // Sequence counter for unique IDs
    
    // Template system for fallback
    this.recentTemplates = []; // Track last 5 used template IDs
    this.templateSelector = this.initializeTemplateSelector();
    
    // Niche personalization system
    this.currentNiche = 'general';
    this.currentGoal = 'generalGrowth';
    
    console.log('[Correlation] 🎯 Engine initialized with default threshold:', this.minDelta);
    console.log('[Correlation] 🎯 Dynamic insights mode enabled');
    console.log('[Correlation] 🎯 Template fallback system loaded: 30 templates');
    console.log('[Correlation] 🎯 Niche personalization ready');
  }
  
  // Update niche preferences from UI
  updateNichePreferences(niche, goal) {
    this.currentNiche = niche;
    this.currentGoal = goal;
    console.log('[Correlation] 🎯 Updated preferences:', niche, goal);
  }
  
  // Initialize template selector
  initializeTemplateSelector() {
    // Import template bank
    const TEMPLATE_BANK = {
      gaming: [
        { id: "GAMING-001", emotionalLabel: "gaming chat works", nextMove: "Ask 'What's your main game?'. Poll top 3", triggerType: ["spike", "flatline"] },
        { id: "GAMING-002", emotionalLabel: "setup interest high", nextMove: "Show your gaming setup. Point at monitor", triggerType: ["spike", "flatline"] },
        { id: "GAMING-003", emotionalLabel: "input preference", nextMove: "Ask 'Controller or keyboard?'. Count hands", triggerType: ["flatline"] },
        { id: "GAMING-004", emotionalLabel: "rank curiosity", nextMove: "Ask 'What rank are you?'. Read top answers", triggerType: ["spike", "flatline"] },
        { id: "GAMING-005", emotionalLabel: "gameplay interest", nextMove: "Share your best play. Describe moment", triggerType: ["drop", "flatline"] }
      ],
      makeup: [
        { id: "MAKEUP-001", emotionalLabel: "product interest", nextMove: "Hold product to camera. Show label closeup", triggerType: ["spike", "flatline"] },
        { id: "MAKEUP-002", emotionalLabel: "finish preference", nextMove: "Ask 'Matte or shimmer?'. Poll chat", triggerType: ["flatline"] },
        { id: "MAKEUP-003", emotionalLabel: "technique curiosity", nextMove: "Demonstrate blending. Go slow motion", triggerType: ["spike", "flatline"] },
        { id: "MAKEUP-004", emotionalLabel: "budget question", nextMove: "Ask 'Drugstore or luxury?'. Count votes", triggerType: ["flatline"] },
        { id: "MAKEUP-005", emotionalLabel: "shade comparison", nextMove: "Swatch two shades. Ask which wins", triggerType: ["spike", "flatline"] }
      ],
      cooking: [
        { id: "COOKING-001", emotionalLabel: "recipe interest", nextMove: "Show ingredients lineup. Name each one", triggerType: ["spike", "flatline"] },
        { id: "COOKING-002", emotionalLabel: "taste curiosity", nextMove: "Taste test on camera. React honestly", triggerType: ["spike", "flatline"] },
        { id: "COOKING-003", emotionalLabel: "technique question", nextMove: "Demonstrate knife skill. Go slow", triggerType: ["spike"] },
        { id: "COOKING-004", emotionalLabel: "preference poll", nextMove: "Ask 'Sweet or savory?'. Count responses", triggerType: ["flatline"] },
        { id: "COOKING-005", emotionalLabel: "secret reveal", nextMove: "Share secret ingredient. Hold it up", triggerType: ["drop", "flatline"] }
      ],
      fitness: [
        { id: "FITNESS-001", emotionalLabel: "form check interest", nextMove: "Demonstrate proper form. Side angle", triggerType: ["spike", "flatline"] },
        { id: "FITNESS-002", emotionalLabel: "workout preference", nextMove: "Ask 'Cardio or weights?'. Poll chat", triggerType: ["flatline"] },
        { id: "FITNESS-003", emotionalLabel: "rep count challenge", nextMove: "Count reps out loud. Race timer", triggerType: ["spike", "flatline"] },
        { id: "FITNESS-004", emotionalLabel: "goal curiosity", nextMove: "Ask 'Bulk or cut?'. Read answers", triggerType: ["flatline"] },
        { id: "FITNESS-005", emotionalLabel: "technique tips", nextMove: "Share your top 3 tips. Number them", triggerType: ["drop", "flatline"] }
      ],
      tech: [
        { id: "TECH-001", emotionalLabel: "specs interest", nextMove: "Show specs screen. Read key numbers", triggerType: ["spike", "flatline"] },
        { id: "TECH-002", emotionalLabel: "comparison curiosity", nextMove: "Compare two options. List 3 differences", triggerType: ["spike", "flatline"] },
        { id: "TECH-003", emotionalLabel: "brand preference", nextMove: "Ask 'Apple or Android?'. Count votes", triggerType: ["flatline"] },
        { id: "TECH-004", emotionalLabel: "feature demo", nextMove: "Test main feature live. Show results", triggerType: ["spike", "flatline"] },
        { id: "TECH-005", emotionalLabel: "setup reveal", nextMove: "Show full setup. Pan camera slowly", triggerType: ["spike", "flatline"] }
      ],
      general: [
        { id: "GENERAL-001", emotionalLabel: "viewer interaction", nextMove: "Call out top 3 usernames. Thank them", triggerType: ["flatline"] },
        { id: "GENERAL-002", emotionalLabel: "location curiosity", nextMove: "Ask 'Where you from?'. Read top 5", triggerType: ["flatline"] },
        { id: "GENERAL-003", emotionalLabel: "yes no poll", nextMove: "Start poll: Yes or No. Count votes", triggerType: ["drop", "flatline"] },
        { id: "GENERAL-004", emotionalLabel: "question time", nextMove: "Ask viewers question. Read top 5 answers", triggerType: ["drop", "flatline"] },
        { id: "GENERAL-005", emotionalLabel: "shoutout energy", nextMove: "Shoutout new followers. Wave at camera", triggerType: ["flatline"] }
      ]
    };
    
    return { bank: TEMPLATE_BANK, recentTemplates: [] };
  }
  
  // Select template based on category and delta (ENHANCED with niche preferences)
  selectTemplate(keywords, delta) {
    console.log('[Template] 🔬 selectTemplate called | Keywords:', keywords, '| Delta:', delta);
    console.log('[Template] 🎯 Current niche:', this.currentNiche, '| Goal:', this.currentGoal);
    
    // Try niche-specific templates first
    if (this.currentNiche && this.currentNiche !== 'general') {
      const nicheInsight = this.selectNicheTemplate(delta);
      if (nicheInsight) {
        console.log('[Template] ✅ Using NICHE template:', nicheInsight.nextMove.substring(0, 50));
        return nicheInsight;
      }
    }
    
    // Fallback to original template system
    const templates = this.templateSelector.bank;
    console.log('[Template] 🔬 Template bank exists:', !!templates);
    
    if (!templates) {
      console.error('[Template] ❌ Template bank is null/undefined!');
      return null;
    }
    
    // Determine category (original logic)
    let category = 'general';
    if (keywords.includes('gaming')) category = 'gaming';
    else if (keywords.includes('makeup')) category = 'makeup';
    else if (keywords.includes('cooking')) category = 'cooking';
    else if (keywords.includes('fitness')) category = 'fitness';
    else if (keywords.includes('tech') || keywords.includes('product')) category = 'tech';
    
    console.log('[Template] 🔬 Selected category:', category);
    
    // Determine trigger type
    let triggerType;
    if (delta > 10) triggerType = 'spike';
    else if (delta < -10) triggerType = 'drop';
    else triggerType = 'flatline';
    
    console.log('[Template] 🔬 Trigger type:', triggerType);
    
    // Get templates for category
    const categoryTemplates = templates[category];
    console.log('[Template] 🔬 Category templates found:', categoryTemplates?.length || 0);
    
    if (!categoryTemplates || categoryTemplates.length === 0) {
      console.warn('[Template] ⚠️ No templates for category:', category, '| Falling back to general');
      category = 'general';
    }
    
    // Filter by trigger type
    const filtered = templates[category].filter(t => t.triggerType.includes(triggerType));
    console.log('[Template] 🔬 After trigger filter:', filtered.length, 'templates');
    
    // Exclude recently used
    const available = filtered.filter(t => !this.recentTemplates.includes(t.id));
    console.log('[Template] 🔬 After recency filter:', available.length, 'templates');
    console.log('[Template] 🔬 Recently used:', this.recentTemplates);
    
    const pool = available.length > 0 ? available : filtered;
    console.log('[Template] 🔬 Final pool size:', pool.length);
    
    if (pool.length === 0) {
      console.error('[Template] ❌ No templates in pool! Category:', category, 'Trigger:', triggerType);
      return null;
    }
    
    // Select random
    const selected = pool[Math.floor(Math.random() * pool.length)];
    console.log('[Template] 🔬 Selected template:', selected);
    
    // Track usage
    this.recentTemplates.push(selected.id);
    if (this.recentTemplates.length > 5) {
      this.recentTemplates.shift();
    }
    
    console.log(`[Template] ✅ Selected ${selected.id} | Category: ${category} | Trigger: ${triggerType}`);
    
    return {
      delta: delta,
      emotionalLabel: selected.emotionalLabel,
      nextMove: selected.nextMove,
      text: '',
      source: 'template',
      templateId: selected.id
    };
  }
  
  // Select niche-specific template
  selectNicheTemplate(delta) {
    // Use external niche template banks if available
    if (typeof window !== 'undefined' && window.NICHE_TEMPLATE_BANKS) {
      const nicheBank = window.NICHE_TEMPLATE_BANKS[this.currentNiche];
      if (nicheBank && nicheBank[this.currentGoal]) {
        const templates = nicheBank[this.currentGoal];
        const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
        
        return {
          delta: delta,
          emotionalLabel: this.currentNiche + ' ' + this.currentGoal,
          nextMove: randomTemplate,
          text: '',
          source: 'niche-template',
          niche: this.currentNiche,
          goal: this.currentGoal
        };
      }
    }
    
    return null;
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
  
  // Extract specific 2-3 word noun phrases for better action labels
  extractSpecificNouns(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    const specificPhrases = [];
    
    // Generic phrases to skip
    const skipPhrases = ['thank you', 'oh my', 'you guys', 'i mean', 'you know', 'right now', 
                         'over here', 'like this', 'going to', 'want to', 'have to', 'need to',
                         'i think', 'i feel', 'you see', 'let me', 'hold on'];
    
    // Filler words
    const fillerWords = ['about', 'their', 'really', 'think', 'going', 'doing', 'saying', 
                         'there', 'where', 'which', 'would', 'should', 'could', 'these', 
                         'those', 'thank', 'thanks', 'please', 'just', 'very', 'much'];
    
    // Extract 2-word phrases that might be specific
    for (let i = 0; i < words.length - 1; i++) {
      const word1 = words[i];
      const word2 = words[i + 1];
      
      // Both words should be substantial (>3 chars) and not filler
      if (word1.length > 3 && word2.length > 3 && 
          !fillerWords.includes(word1) && !fillerWords.includes(word2)) {
        
        const phrase = `${word1} ${word2}`;
        
        // Skip generic phrases
        if (!skipPhrases.includes(phrase)) {
          specificPhrases.push(phrase);
        }
      }
    }
    
    // Also look for potential brand/product names (capitalized or with numbers)
    const potentialNames = words.filter(w => {
      // Look for words with numbers (rtx4090, iphone15, etc.)
      if (/\d/.test(w)) return true;
      // Look for longer unique words
      if (w.length > 6 && !fillerWords.includes(w)) return true;
      return false;
    });
    
    // Combine and dedupe
    const allNouns = [...specificPhrases, ...potentialNames].slice(0, 5);
    
    console.log('[Labels] Extracted specific nouns:', allNouns);
    
    return allNouns;
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
  
  // Calculate transcript score for routing decisions
  calculateTranscriptScore(text, keywords) {
    // Count potential nouns (words > 4 chars that aren't filler/common)
    const fillerWords = ['about', 'their', 'really', 'think', 'going', 'doing', 'saying', 'there', 'where', 'which', 'would', 'should', 'could', 'these', 'those', 'thank', 'thanks'];
    const words = text.toLowerCase().split(/\s+/);
    const nouns = words.filter(w => 
      w.length > 4 && 
      !fillerWords.includes(w) &&
      !/^(um|uh|like|yeah|okay|well)$/.test(w)
    );
    
    const nounCount = nouns.length;
    const keywordBonus = keywords.length * 2; // Keywords worth 2 nouns each
    const score = nounCount + keywordBonus;
    
    // Determine quality tier (STABLE VERSION - no experimental chat features)
    let tier;
    if (score >= 6) {
      tier = 'HIGH';    // Rich content with 6+ nouns/keywords
    } else if (score >= 3) {
      tier = 'MEDIUM';  // Some content with 3-5 nouns/keywords
    } else {
      tier = 'LOW';     // Pure filler with 0-2 nouns/keywords
    }
    
    console.log(`[Routing] Transcript Score: ${tier} | Nouns: ${nounCount} | Keywords: ${keywords.length} | Total: ${score}`);
    
    return { tier, score, nounCount, keywordBonus };
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
    console.log('🔬 NUCLEAR: generateTimedInsight() ENTRY - Timer fired');
    const now = Date.now();
    
    // Get most recent viewer data
    const latestViewer = this.viewerBuffer[this.viewerBuffer.length - 1];
    if (!latestViewer) {
      console.log('🔬 NUCLEAR: No viewer data, skipping timed insight');
      console.log('[Correlation] ⏰ No viewer data, skipping timed insight');
      return;
    }
    
    // Get transcript from last 40 seconds (increased from 20s for better context)
    const segment = this.getRecentSegment(now, 40000);
    
    // If no meaningful data, send reminder of winning actions
    if (!segment || segment.wordCount < 30) {
      console.log('🔬 NUCLEAR: No transcript data, sending reminder');
      console.log('[Correlation] ⏰ No recent transcript or too short (<30 words) - sending reminder');
      this.sendReminderInsight(latestViewer.count, latestViewer.delta);
      this.resetCountdown();
      return;
    }
    
    console.log('🔬 NUCLEAR: About to call generateInsight()');
    
    // Generate normal insight with delta = 0 (timer-triggered)
    console.log('[Correlation] ⏰ Generating timed insight with data');
    const tone = await this.analyzeTone(segment.text);
    const insight = await this.generateInsight(0, latestViewer.count, segment, tone, true); // true = timed mode
    
    console.log('🔬 NUCLEAR: generateInsight() returned:', !!insight);
    
    // Handle case where Claude fails and returns null
    if (!insight) {
      console.log('🔬 NUCLEAR: Insight was null, sending reminder');
      console.log('[Correlation] ⏰ Timed insight generation failed (Claude unavailable) - sending reminder');
      this.sendReminderInsight(latestViewer.count, latestViewer.delta);
      this.resetCountdown();
      return;
    }
    
    console.log('🔬 NUCLEAR: About to log timed insight generated');
    console.log('[Correlation] 🎯 Timed insight generated:', {
      emotionalLabel: insight.emotionalLabel,
      nextMove: insight.nextMove
    });
    
    // ADD CLEAR LOGGING FOR EASY FILTERING
    console.log('🔬 NUCLEAR: About to send INSIGHT message');
    console.log('✅ Claude Insight (Timer): ' + insight.nextMove.substring(0, 50));
    
    // Send insight
    console.log('🔬 NUCLEAR: Calling chrome.runtime.sendMessage for INSIGHT');
    chrome.runtime.sendMessage({
      type: 'INSIGHT',
      ...insight,
      isTimedInsight: true
    });
    console.log('🔬 NUCLEAR: INSIGHT message sent');
    
    this.resetCountdown();
    console.log('🔬 NUCLEAR: generateTimedInsight() EXIT');
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
      
      // ADD CLEAR LOGGING FOR EASY FILTERING
      console.log('✅ Claude Insight (Delta): ' + insight.nextMove.substring(0, 50));
      
      chrome.runtime.sendMessage({
        type: 'INSIGHT',
        ...insight
      });
      console.log('[Correlation] 🔍 Step 6: Message sent successfully!');
      
      // Reset 20-second countdown
      this.resetCountdown();

      // Log as action with SPECIFIC labeling
      // Extract keywords AND specific nouns for better categorization
      const actionKeywords = this.extractKeywords(segment.text);
      const specificNouns = this.extractSpecificNouns(segment.text);
      
      // Build SPECIFIC label: Specific Nouns > Keywords > Topic (never generic)
      let actionLabel = 'Chat'; // Default fallback
      
      if (specificNouns.length > 0) {
        // Use first specific phrase (most specific)
        actionLabel = specificNouns[0].split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      } else if (actionKeywords.length > 0) {
        // Use keyword category
        actionLabel = actionKeywords[0].charAt(0).toUpperCase() + actionKeywords[0].slice(1) + ' talk';
      } else if (segment.topic && segment.topic !== 'general' && segment.topic !== 'speech') {
        // Use topic if not generic
        actionLabel = segment.topic.charAt(0).toUpperCase() + segment.topic.slice(1);
      } else if (tone?.emotion && tone.emotion.toLowerCase() !== 'neutral' && tone.emotion.toLowerCase() !== 'unknown') {
        // Use emotion only if it's not "neutral" or "unknown"
        actionLabel = tone.emotion.charAt(0).toUpperCase() + tone.emotion.slice(1) + ' talk';
      }
      
      console.log('[Correlation] 📋 Action label:', actionLabel, '| Specific nouns:', specificNouns, '| Keywords:', actionKeywords, '| Emotion:', tone?.emotion);
      
      chrome.runtime.sendMessage({
        type: 'ACTION',
        label: actionLabel,
        delta: delta,
        text: segment.text,
        startTime: new Date(segment.startTime).toISOString(),
        endTime: new Date(segment.endTime).toISOString(),
        keywords: actionKeywords, // Include keywords for reference
        specificNouns: specificNouns // Include for debugging
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
    
    // ==================== ROUTING LOGIC: Calculate Transcript Score ====================
    // Extract keywords first
    const keywords = this.extractKeywords(segment.text);
    const transcriptScore = this.calculateTranscriptScore(segment.text, keywords);
    
    console.log(`[Routing] Decision Point | Score: ${transcriptScore.tier} (${transcriptScore.score}) | Delta: ${delta}`);
    
    // Route based on transcript quality
    if (transcriptScore.tier === 'LOW') {
      console.log('[Routing] ⏭️ SKIP - Transcript quality too low (score < 3) - No insight per preference');
      return null;  // Skip insight for LOW quality (per "no insight" preference)
    }
    
    // For HIGH and MEDIUM, attempt Claude first
    const shouldUseClaude = transcriptScore.tier === 'HIGH' || transcriptScore.tier === 'MEDIUM';
    const allowTemplateFallback = transcriptScore.tier === 'MEDIUM';
    
    console.log(`[Routing] Strategy: ${shouldUseClaude ? 'Claude' : 'Skip'} | Fallback: ${allowTemplateFallback ? 'Template' : 'None'}`);
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
        // Generate unique correlationId for this insight
        const correlationId = `${Date.now()}-${String(++this.insightSequence).padStart(4, '0')}`;
        console.log(`📊 CORRELATION_ID: ${correlationId}`);
        
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

        console.log('🤖 Calling Claude | CID:', correlationId, '| Delta:', payload.viewerDelta, '| Keywords:', keywords.join(', ') || 'none');
        
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
          console.log('✅ CORRELATION_ID:', correlationId);
          console.log('✅ Response Time:', Math.round(aiDuration), 'ms');
          console.log('✅ Emotional Label:', aiInsight.emotionalLabel);
          console.log('✅ Next Move:', aiInsight.nextMove);
          console.log('✅ Source:', aiInsight.source);
          console.log('✅ Backend CorrelationId:', aiInsight.correlationId || 'not returned');
          console.log('✅ ==========================================');
          
          if (aiInsight.emotionalLabel && aiInsight.nextMove) {
            emotionalLabel = aiInsight.emotionalLabel;
            nextMove = aiInsight.nextMove;
            console.log('✅ Claude insight | CID:', correlationId, '| Move:', nextMove.substring(0, 50));
            
            // Track this insight for anti-repetition
            this.trackInsight(aiInsight);
            
            // Track as winning topic if it's a spike
            if (delta >= 10 && keywords.length > 0) {
              this.trackWinningTopic(segment.topic, delta, keywords);
            }
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
      console.warn('⚠️ CLAUDE INSIGHT FAILED');
      console.warn('⚠️ Transcript Score:', transcriptScore.tier, '| Allow Fallback:', allowTemplateFallback);
      console.warn('⚠️ ==========================================');
      
      // 🔬 DIAGNOSTIC: Check exact values before template decision
      console.log('🔬 DEBUG: Template Fallback Decision Point');
      console.log('🔬 transcriptScore.tier:', transcriptScore.tier);
      console.log('🔬 transcriptScore.tier type:', typeof transcriptScore.tier);
      console.log('🔬 Exact comparison MEDIUM:', transcriptScore.tier === 'MEDIUM');
      console.log('🔬 Exact comparison HIGH:', transcriptScore.tier === 'HIGH');
      console.log('🔬 Keywords available:', keywords);
      console.log('🔬 Keywords length:', keywords.length);
      console.log('🔬 Delta value:', delta);
      console.log('🔬 templateSelector exists:', !!this.templateSelector);
      console.log('🔬 templateSelector.bank exists:', !!this.templateSelector?.bank);
      
      // Use template fallback for MEDIUM or HIGH (better than skipping)
      // Only skip for LOW quality
      const shouldUseTemplate = transcriptScore.tier === 'MEDIUM' || transcriptScore.tier === 'HIGH';
      console.log('🔬 Should use template?:', shouldUseTemplate);
      
      if (shouldUseTemplate) {
        console.log('[Routing] 🔄', transcriptScore.tier, 'quality + Claude failed → Using template fallback');
        console.log('[Template] Attempting selectTemplate with keywords:', keywords, 'delta:', delta);
        
        try {
          const templateInsight = this.selectTemplate(keywords, delta);
          console.log('[Template] selectTemplate returned:', templateInsight ? 'SUCCESS' : 'NULL');
          
          if (templateInsight) {
            console.log('[Template] ✅ Using template:', templateInsight.templateId, '| Move:', templateInsight.nextMove);
            emotionalLabel = templateInsight.emotionalLabel;
            nextMove = templateInsight.nextMove;
          } else {
            console.warn('[Template] ❌ selectTemplate returned null - skipping insight');
            console.warn('[Template] ❌ Possible reasons: No templates in category or filter failed');
            return null;
          }
        } catch (error) {
          console.error('[Template] ❌ ERROR in selectTemplate:', error);
          console.error('[Template] ❌ Error details:', error.message, error.stack?.substring(0, 200));
          return null;
        }
      } else {
        // LOW quality - skip insight (per "no insight" preference)
        console.warn('⚠️ LOW quality transcript and Claude failed - skipping (no template for low quality)');
        console.warn('🔬 DEBUG: Tier was:', transcriptScore.tier, '(expected LOW)');
        return null;
      }
    }
    
    // If we reach here, we have an insight (from Claude or template)
    const insightSource = emotionalLabel.includes('template') || nextMove.includes('template') ? 'template' : 'Claude';
    console.log('✅ ==========================================');
    console.log('✅ USING INSIGHT | Source:', insightSource);
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
