# Spikely Correlation Engine - Improvement Plan & Fixes

## 🔧 Critical Fix Applied: Hume AI Message Port Issue

### Problem Identified
**Error:** "The message port closed before a response was received"
- Hume AI analysis was failing in extension
- Background service worker was sending `HUME_ANALYZE_FETCH` messages but they weren't reaching the offscreen document
- Audio was being prepared but never analyzed
- System entered cooldown and dropped all requests

### Root Cause
Background.js was sending `chrome.runtime.sendMessage()` expecting the offscreen document to receive it, but **the offscreen document needed to be explicitly created and ready** before messages could be sent to it.

### Fix Implemented
**File Modified:** `/app/frontend/extension/background.js` (lines 696-720)

**Changes:**
1. **Check for offscreen document existence** before sending Hume messages
2. **Create offscreen document if missing** with proper reasons and justification
3. **Add initialization delay** (500ms) to ensure offscreen document is ready
4. **Enhanced error logging** to catch message port failures
5. **Graceful handling** of "Only a single offscreen" errors

**Code Changes:**
```javascript
// Before: Just sent message blindly
chrome.runtime.sendMessage({
  type: 'HUME_ANALYZE_FETCH',
  audioBase64: message.audioBase64
}, callback);

// After: Ensure offscreen exists first
const existingContexts = await chrome.runtime.getContexts({});
let offscreenDocument = existingContexts.find(c => c.contextType === 'OFFSCREEN_DOCUMENT');

if (!offscreenDocument) {
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Hume AI prosody analysis'
  });
  await new Promise(resolve => setTimeout(resolve, 500)); // Wait for init
}

// Then send message
chrome.runtime.sendMessage({...}, callback);
```

---

## 🎯 Correlation Engine Improvement Plan

### Current State Analysis

**What Works:**
- ✅ Basic viewer count tracking (OCR + Extension DOM reading)
- ✅ AssemblyAI real-time transcription
- ✅ Hume AI emotional analysis (now fixed)
- ✅ 25-second correlation window
- ✅ Claude Sonnet 4 insight generation
- ✅ Cooldown and rate limiting

**Current Issues:**
- ❌ **Buggy & unreliable** - Message port failures (NOW FIXED)
- ❌ **Generic outputs** - Template-based insights lack personalization
- ❌ **Limited context** - Only last 25 seconds considered
- ❌ **Reactive only** - Waits for viewer changes vs. proactive suggestions
- ❌ **No learning loop** - Doesn't improve from feedback
- ❌ **Single-model** - Hume AI not fully utilized (prosody + emotion + bursts)

---

## 🏗️ Proposed Architecture (High-Level)

```
┌─────────────────────────────────────────────────────────────┐
│                    INPUT LAYER                               │
├─────────────────────────────────────────────────────────────┤
│  Audio Stream → AssemblyAI → Transcripts (real-time)       │
│  DOM/OCR → Viewer Count → Viewer deltas                     │
│  Chat Data → Activity signals → Engagement metrics          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              FEATURE EXTRACTION LAYER                        │
├─────────────────────────────────────────────────────────────┤
│  Hume AI Models (Multi-Signal):                             │
│    • Prosody (voice energy, excitement, confidence)         │
│    • Emotion (sentiment from text)                          │
│    • Vocal Bursts (laughter, sighs, gasps)                  │
│    • Language Tone (formality, urgency, positivity)         │
│                                                              │
│  Context Windowing:                                          │
│    • 20-second sliding windows (primary)                    │
│    • 60-second trend detection                              │
│    • Stream-level patterns (topic, pacing, CTA timing)      │
│                                                              │
│  Aggregation:                                                │
│    • Transcript + Emotion + Viewer + Chat → Feature Vector │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              INSIGHT SYNTHESIS LAYER                         │
├─────────────────────────────────────────────────────────────┤
│  Claude Sonnet 4.5 (or equivalent):                         │
│    • Input: Aggregated features + streamer profile          │
│    • Process: Generate personalized, context-rich insights  │
│    • Output: Actionable recommendations                     │
│                                                              │
│  Proactivity Engine:                                         │
│    • Predict engagement drops BEFORE they happen            │
│    • Suggest optimal CTA timing                             │
│    • Recommend topic pivots based on trends                 │
│                                                              │
│  Personalization:                                            │
│    • Streamer tone/style preferences                        │
│    • Audience demographics & behavior history               │
│    • Platform-specific best practices                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                LEARNING & EVALUATION LAYER                   │
├─────────────────────────────────────────────────────────────┤
│  Feedback Collection:                                        │
│    • Explicit: Thumbs up/down, star ratings                 │
│    • Implicit: Did streamer act on insight? View uplift?    │
│                                                              │
│  A/B Testing:                                                │
│    • Test insight formats (short vs. detailed)              │
│    • Test timing (immediate vs. delayed)                    │
│    • Test personalization levels                            │
│                                                              │
│  Online Learning:                                            │
│    • Update streamer profile based on feedback              │
│    • Adjust correlation weights                             │
│    • Improve prompt templates                               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    OUTPUT LAYER                              │
├─────────────────────────────────────────────────────────────┤
│  • Extension Side Panel (real-time insights)                │
│  • Web App Dashboard (analytics & trends)                   │
│  • Alerts & Notifications (proactive suggestions)           │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Phase-by-Phase Implementation Plan

### **Phase 1: Foundation & Requirements** (Week 1)
**Goal:** Establish baseline and define success metrics

**Tasks:**
1. ✅ **Fix critical bugs** - Hume AI message port issue (DONE)
2. ⬜ **Define success metrics:**
   - Viewer uplift % (target: +15% engagement)
   - Insight relevance score (target: 4.0/5.0 from streamers)
   - Latency (target: <2s from audio to insight)
   - False positive rate (target: <10%)
3. ⬜ **Document current performance:**
   - Baseline viewer correlation accuracy
   - Current insight quality (manual review)
   - System latency measurements
4. ⬜ **Map data schema:**
   ```typescript
   interface CorrelationData {
     timestamp: number;
     window: {
       duration: number; // 20s, 60s, etc.
       transcripts: Transcript[];
       emotions: EmotionAnalysis[];
       prosody: ProsodyMetrics[];
       bursts: VocalBurst[];
     };
     viewers: {
       count: number;
       delta: number;
       trend: 'rising' | 'falling' | 'stable';
     };
     chat: {
       velocity: number; // messages/sec
       sentiment: number; // -1 to 1
     };
     context: {
       streamDuration: number;
       topicHistory: string[];
       recentCTAs: number;
     };
   }
   
   interface StreamerProfile {
     id: string;
     tone: 'casual' | 'formal' | 'energetic';
     platform: 'tiktok' | 'twitch' | 'kick' | 'youtube';
     audienceType: string;
     preferredInsightFormat: 'short' | 'detailed';
     historicalPerformance: PerformanceMetrics;
   }
   ```

**Deliverables:**
- [ ] Baseline performance report
- [ ] Data schema documentation
- [ ] Success metrics dashboard mockup

---

### **Phase 2: Context Windowing & Data Ingestion** (Week 2)
**Goal:** Expand beyond 25-second window, add stream-level context

**Tasks:**
1. ⬜ **Implement sliding window system:**
   ```javascript
   class ContextWindow {
     constructor(duration = 20000) {
       this.duration = duration;
       this.buffer = [];
     }
     
     add(data) {
       const now = Date.now();
       this.buffer.push({ ...data, timestamp: now });
       // Remove old data
       this.buffer = this.buffer.filter(d => now - d.timestamp < this.duration);
     }
     
     getWindow() {
       return {
         transcripts: this.buffer.filter(d => d.type === 'transcript'),
         emotions: this.buffer.filter(d => d.type === 'emotion'),
         viewers: this.buffer.filter(d => d.type === 'viewer'),
         chat: this.buffer.filter(d => d.type === 'chat')
       };
     }
   }
   
   // Multiple windows for different analysis
   const shortWindow = new ContextWindow(20000);  // 20s - real-time
   const mediumWindow = new ContextWindow(60000); // 60s - trends
   const longWindow = new ContextWindow(300000);  // 5min - patterns
   ```

2. ⬜ **Add stream-level tracking:**
   - Topic classification (existing in correlationService.ts)
   - Audience engagement trends
   - CTA effectiveness tracking
   - Peak moments identification

3. ⬜ **Enhance data ingestion:**
   - AssemblyAI transcripts ✅ (working)
   - Viewer counts ✅ (working)
   - **NEW:** Chat activity (if available via extension)
   - **NEW:** Stream metadata (duration, concurrent viewers)

**Deliverables:**
- [ ] Multi-window context manager
- [ ] Stream-level pattern detector
- [ ] Enhanced data pipeline

---

### **Phase 3: Multi-Model Hume AI Integration** (Week 3)
**Goal:** Utilize all Hume AI models for richer emotional analysis

**Current State:**
- `audioProsodyService.ts` already calls Hume AI prosody
- Returns: excitement, confidence, energy, topEmotions, topBursts, topLanguageEmotions
- **Issue:** Not all models fully utilized in correlation logic

**Tasks:**
1. ⬜ **Verify all 3 Hume models active:**
   - Prosody ✅ (voice energy)
   - Emotion ✅ (text sentiment)
   - Vocal Bursts ✅ (laughter, sighs, gasps)

2. ⬜ **Enhance correlation with multi-signal data:**
   ```javascript
   function analyzeCorrelation(window) {
     const features = {
       // Prosody signals
       voiceEnergy: window.prosody.energy,
       excitement: window.prosody.excitement,
       confidence: window.prosody.confidence,
       
       // Emotional signals
       sentiment: window.emotion.sentiment,
       topEmotions: window.emotion.topEmotions,
       
       // Vocal burst signals
       hasPowerfulBurst: window.bursts.some(b => b.score > 0.7),
       burstTypes: window.bursts.map(b => b.name),
       
       // Language signals
       languageTone: window.language.topEmotions,
       formality: window.language.formality,
       
       // Viewer signals
       viewerDelta: window.viewers.delta,
       viewerTrend: window.viewers.trend,
       
       // Chat signals
       chatVelocity: window.chat.velocity,
       chatSentiment: window.chat.sentiment
     };
     
     // Correlation quality based on signal agreement
     const correlationQuality = calculateCorrelationQuality(features);
     
     return {
       features,
       correlationQuality,
       dominantSignal: findDominantSignal(features)
     };
   }
   ```

3. ⬜ **Implement correlation quality scoring:**
   - **EXCELLENT:** All signals agree (prosody + emotion + bursts align)
   - **GOOD:** 2/3 signals agree
   - **FAIR:** Mixed signals
   - **WEAK:** Conflicting signals

**Deliverables:**
- [ ] Multi-model feature extractor
- [ ] Correlation quality calculator
- [ ] Signal visualization in UI

---

### **Phase 4: Insight Engine Refactor** (Week 4)
**Goal:** Replace generic templates with Claude-powered personalized insights

**Current State:**
- `correlationService.ts` generates fallback insights with templates
- Claude API called via Supabase edge function
- **Issue:** Too generic, not personalized

**Tasks:**
1. ⬜ **Enhance Claude prompting:**
   ```javascript
   const insightPrompt = `
   You are a TikTok Live coaching assistant. Analyze this data and provide ONE actionable insight.
   
   Streamer Profile:
   - Name: ${profile.name}
   - Tone: ${profile.tone}
   - Platform: ${profile.platform}
   - Audience: ${profile.audienceType}
   
   Current Context:
   - Stream Duration: ${context.streamDuration}min
   - Recent Topics: ${context.topicHistory.join(', ')}
   - Viewer Delta: ${delta > 0 ? '+' : ''}${delta}
   - Viewer Count: ${count}
   
   Multi-Signal Analysis:
   - Voice Energy: ${features.voiceEnergy}%
   - Excitement: ${features.excitement}%
   - Sentiment: ${features.sentiment}
   - Top Emotions: ${features.topEmotions.join(', ')}
   - Vocal Bursts: ${features.burstTypes.join(', ')}
   - Chat Velocity: ${features.chatVelocity} msgs/sec
   - Correlation Quality: ${features.correlationQuality}
   
   Recent Transcript:
   "${transcript}"
   
   Instructions:
   1. Identify WHY viewers ${delta > 0 ? 'joined' : 'left'}
   2. Provide ONE specific action to ${delta > 0 ? 'maintain' : 'recover'} momentum
   3. Match the streamer's ${profile.tone} tone
   4. Keep it under 15 words
   5. Focus on the DOMINANT signal: ${features.dominantSignal}
   
   Format:
   {
     "emotionalLabel": "2-3 word description",
     "nextMove": "Clear action in streamer's voice",
     "confidence": 0-100
   }
   `;
   ```

2. ⬜ **Implement insight formatting options:**
   - **Short:** "Do more cooking talk" (current)
   - **Detailed:** "Your cooking segment spiked +15 viewers. Keep this energy and ask viewers to share recipes."
   - **Proactive:** "Energy dropping. Try a giveaway in 30 seconds to prevent viewer loss."

3. ⬜ **Add insight deduplication:**
   - Track recent insights (last 5 minutes)
   - Avoid repeating same suggestion
   - Prioritize novel recommendations

**Deliverables:**
- [ ] Enhanced Claude prompting system
- [ ] Multiple insight format templates
- [ ] Insight deduplication logic

---

### **Phase 5: Proactivity & Personalization** (Week 5)
**Goal:** Anticipate problems and personalize recommendations

**Tasks:**
1. ⬜ **Build predictive triggers:**
   ```javascript
   function predictEngagementDrop(trends) {
     const indicators = [
       trends.voiceEnergyDecreasing,
       trends.transcriptPaceSlowing,
       trends.chatVelocityDropping,
       trends.viewerCountStagnant,
       trends.timeSinceLastCTA > 180 // 3 minutes
     ];
     
     const riskScore = indicators.filter(Boolean).length / indicators.length;
     
     if (riskScore > 0.6) {
       return {
         predicted: true,
         confidence: riskScore,
         timeToImpact: estimateTimeToImpact(trends),
         suggestedActions: [
           'Change topic',
           'Ask a question to chat',
           'Do a quick giveaway',
           'Show enthusiasm'
         ]
       };
     }
     
     return { predicted: false };
   }
   ```

2. ⬜ **Implement streamer profiling:**
   - Track which insights were acted upon
   - Track which formats perform best
   - Adapt tone to match streamer's voice
   - Learn optimal timing for suggestions

3. ⬜ **Add proactive insight types:**
   - **Preventive:** "Chat slowing down. Try asking a question."
   - **Opportunity:** "Viewers rising fast! Now's perfect for a CTA."
   - **Optimization:** "Your cooking segments perform 30% better. Consider more food content."

**Deliverables:**
- [ ] Predictive engagement model
- [ ] Streamer profile manager
- [ ] Proactive insight generator

---

### **Phase 6: Learning Loop & Evaluation** (Week 6)
**Goal:** Collect feedback and improve over time

**Tasks:**
1. ⬜ **Add feedback UI:**
   ```typescript
   // In extension side panel
   interface InsightCard {
     insight: Insight;
     actions: {
       thumbsUp: () => void;
       thumbsDown: () => void;
       dismiss: () => void;
       acted: boolean; // Did streamer follow the advice?
     };
   }
   ```

2. ⬜ **Track implicit signals:**
   - Did viewer count improve after insight?
   - Did streamer change topic/behavior?
   - How long did they wait to act?

3. ⬜ **Implement A/B testing:**
   ```javascript
   const experiments = {
     insightTiming: {
       control: 'immediate', // Trigger on delta
       variant: 'delayed_5s' // Wait 5 seconds
     },
     insightFormat: {
       control: 'short',
       variant: 'detailed'
     },
     personalization: {
       control: 'generic',
       variant: 'personalized'
     }
   };
   
   function assignExperiment(streamerId) {
     // Randomly assign 50/50
     return Math.random() > 0.5 ? 'control' : 'variant';
   }
   ```

4. ⬜ **Build analytics dashboard:**
   - Insight success rate (% that led to uplift)
   - Average viewer uplift per insight
   - Most effective insight types
   - Streamer satisfaction scores

**Deliverables:**
- [ ] Feedback collection system
- [ ] A/B testing framework
- [ ] Analytics dashboard

---

### **Phase 7: Quality Assurance & Reliability** (Week 7)
**Goal:** Ensure system is robust and debuggable

**Tasks:**
1. ✅ **Fix message port issues** - DONE (Hume AI fix)

2. ⬜ **Add comprehensive instrumentation:**
   ```javascript
   // Metrics to track
   const metrics = {
     // Latency
     transcriptToInsightMs: [],
     humeAnalysisMs: [],
     claudeResponseMs: [],
     
     // Success rates
     humeSuccessRate: 0,
     claudeSuccessRate: 0,
     correlationSuccessRate: 0,
     
     // Error counts
     humeErrors: 0,
     claudeErrors: 0,
     messagePortErrors: 0,
     
     // System health
     bufferOverflows: 0,
     droppedRequests: 0,
     cooldownActivations: 0
   };
   ```

3. ⬜ **Implement graceful fallbacks:**
   - If Hume fails → use text-only emotion analysis
   - If Claude fails → use deterministic templates
   - If correlation fails → show generic tips

4. ⬜ **Add alerting:**
   - High error rates (>10%)
   - High latency (>5s)
   - Cooldown overuse (>50% of requests)

**Deliverables:**
- [ ] Monitoring dashboard
- [ ] Error handling & fallbacks
- [ ] Alerting system

---

### **Phase 8: Deployment & Rollout** (Week 8)
**Goal:** Gradual rollout with monitoring

**Tasks:**
1. ⬜ **Beta testing:**
   - 10 streamers test new system
   - Collect detailed feedback
   - Monitor performance metrics

2. ⬜ **Phased rollout:**
   - Week 1: 25% of users
   - Week 2: 50% of users
   - Week 3: 100% of users

3. ⬜ **Documentation:**
   - User guide for streamers
   - Technical architecture doc
   - Troubleshooting guide

**Deliverables:**
- [ ] Beta test report
- [ ] Rollout plan
- [ ] User documentation

---

## 🎯 Success Metrics

### Primary Metrics:
- **Viewer Uplift:** +15% average engagement increase
- **Insight Relevance:** 4.0/5.0 average rating from streamers
- **Latency:** <2 seconds from audio to insight
- **Accuracy:** <10% false positive rate

### Secondary Metrics:
- **System Reliability:** 99.5% uptime
- **Hume AI Success Rate:** >95%
- **Claude Success Rate:** >98%
- **Streamer Satisfaction:** 4.5/5.0 NPS

### Comparative Metrics (Before vs. After):
| Metric | Before (Current) | After (Target) |
|--------|------------------|----------------|
| Generic Insights | 80% | <10% |
| Context Window | 25s | 20s + 60s + 5min |
| Proactive Insights | 0% | 30% |
| Personalization | None | Streamer-specific |
| Learning Loop | No | Yes (online learning) |
| Hume Models Used | 1 (prosody) | 3 (prosody + emotion + bursts) |

---

## 🚀 Quick Wins (Immediate Improvements)

### 1. **Enable All Hume Models** ✅ (FIXED)
- Prosody ✅
- Emotion ✅
- Vocal Bursts ✅

### 2. **Extend Context Window** (Easy)
- Add 60-second trend detection
- Track topic patterns

### 3. **Improve Insight Quality** (Medium)
- Enhance Claude prompting
- Add streamer profile data

### 4. **Add Feedback Buttons** (Easy)
- Thumbs up/down on insights
- Track which insights work

---

## 📊 Data Schema (Detailed)

### Transcript Data
```typescript
interface Transcript {
  id: string;
  sessionId: string;
  timestamp: number;
  text: string;
  isFinal: boolean;
  confidence: number;
  speaker?: 'streamer' | 'viewer';
}
```

### Emotion Analysis
```typescript
interface EmotionAnalysis {
  id: string;
  transcriptId: string;
  timestamp: number;
  provider: 'hume';
  models: {
    prosody: {
      excitement: number;    // 0-1
      confidence: number;    // 0-1
      energy: number;        // 0-1
      topEmotions: Array<{
        name: string;
        score: number;       // 0-1
      }>;
    };
    emotion: {
      sentiment: number;     // -1 to 1
      topEmotions: Array<{
        name: string;
        score: number;
      }>;
    };
    bursts: {
      detected: boolean;
      topBursts: Array<{
        name: string;        // 'laughter', 'sigh', 'gasp'
        score: number;
      }>;
    };
    language: {
      topEmotions: Array<{
        name: string;
        score: number;
      }>;
      formality: number;     // 0-1
      urgency: number;       // 0-1
    };
  };
  correlationQuality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'WEAK';
  dominantSignal: 'prosody' | 'emotion' | 'bursts' | 'language';
  avgSignalStrength: number; // 0-1
}
```

### Viewer Data
```typescript
interface ViewerSample {
  timestamp: number;
  count: number;
  delta: number;
  platform: 'tiktok' | 'twitch' | 'kick' | 'youtube';
  source: 'extension' | 'ocr';
}
```

### Insight
```typescript
interface Insight {
  id: string;
  sessionId: string;
  timestamp: number;
  type: 'reactive' | 'proactive' | 'preventive' | 'opportunity';
  trigger: {
    type: 'viewer_change' | 'prediction' | 'pattern';
    value: number;
  };
  context: {
    transcripts: Transcript[];
    emotions: EmotionAnalysis[];
    viewers: ViewerSample[];
    windowDuration: number;
  };
  output: {
    emotionalLabel: string;
    nextMove: string;
    confidence: number;      // 0-1
    format: 'short' | 'detailed';
  };
  metadata: {
    latencyMs: number;
    modelUsed: 'claude' | 'fallback';
    correlationQuality: string;
  };
  feedback?: {
    rating: 1 | 2 | 3 | 4 | 5;
    acted: boolean;
    viewerUplift?: number;
  };
}
```

---

## 🔍 Testing Plan

### Unit Tests:
- Context windowing logic
- Emotion aggregation
- Correlation calculation
- Insight formatting

### Integration Tests:
- AssemblyAI → Hume → Claude pipeline
- Message port communication
- Offscreen document lifecycle

### End-to-End Tests:
- Full session simulation
- Multi-user scenarios
- Error recovery

### Performance Tests:
- Latency under load
- Memory usage
- Buffer overflow handling

---

## 🛡️ Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Hume AI rate limits | High | Medium | Implement aggressive cooldown, request batching |
| Claude API costs | Medium | High | Cache insights, use fallbacks, limit frequency |
| Message port failures | High | Low | Fixed via offscreen document creation ✅ |
| Extension performance | Medium | Medium | Optimize buffer sizes, use web workers |
| Privacy concerns | High | Low | Anonymize data, get consent, document usage |
| User fatigue | Medium | Medium | Limit insight frequency, add "snooze" feature |

---

## 📝 Next Steps (Immediate Actions)

1. ✅ **Fix Hume AI message port issue** - DONE
2. ⬜ **Test fixed Hume integration** - Verify all 3 models work
3. ⬜ **Start Phase 1:** Define success metrics and baseline
4. ⬜ **Implement multi-window context** (Phase 2)
5. ⬜ **Enhance Claude prompting** (Phase 4 quick win)

---

## 📚 References

- Current correlation engine: `/app/frontend/src/services/correlationService.ts`
- Hume AI service: `/app/frontend/src/services/audioProsodyService.ts`
- Extension background: `/app/frontend/extension/background.js`
- Extension offscreen: `/app/frontend/extension/offscreen.js`

---

## ✅ Changelog

**2025-10-20:**
- ✅ Fixed critical Hume AI message port issue in extension
- ✅ Added offscreen document creation before Hume requests
- ✅ Enhanced error logging for message port failures
- ✅ Documented comprehensive improvement plan
