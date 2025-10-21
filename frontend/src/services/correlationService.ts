import { buildSegments, countWords, hashText, type Segment } from './segmenter';
import { enqueueHumeAnalysis } from './humeService';
import { Debug } from './debug';

// Generate unique correlation ID
function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Check if debug mode is enabled
const DEBUG_MODE = import.meta.env.VITE_DEBUG_CORRELATION === 'true';

function debugLog(correlationId: string, stage: string, data: any) {
  if (!DEBUG_MODE) return;
  console.log(`[CORRELATION:${correlationId}:${stage}]`, data);
}

type TranscriptLine = { t: number; text: string; conf?: number };
type ViewerSample = { t: number; count: number };
type TopicType = 'food' | 'fitness' | 'personal' | 'finance' | 'interaction' | 'general';

export type Insight = { 
  t: number; 
  delta: number; 
  count: number; 
  text: string;
  topic: TopicType;
  contextLabel: string;
  emotion?: string;
  emotionScore?: number;
  emotionConfidence?: number;
  segmentHash?: string;
  emotionalLabel?: string;
  nextMove?: string;
  correlationQuality?: string;
};

export type EngineStatus = 
  | 'IDLE' | 'COLLECTING' | 'CORRELATING' 
  | 'AI_CALLING' | 'AI_FALLBACK'
  | 'SUCCESS' | 'FAILED';

export type EngineMeta = {
  latencyMs?: number;
  source?: 'Claude' | 'Fallback';
  reason?: string;
};

type ToneHistory = {
  t: number;
  emotion: string;
  delta: number;
  isNegative: boolean;
};

const transcripts: TranscriptLine[] = [];
const viewers: ViewerSample[] = [];
const listeners: ((e: Insight) => void)[] = [];
const statusListeners: ((s: EngineStatus, m?: EngineMeta) => void)[] = [];
const recentSegments: Segment[] = [];
const toneHistory: ToneHistory[] = [];

const CORRELATION_WINDOW_MS = 25000;  // look back 25s for segments
let MIN_DELTA = 3;      // trigger on +/-3 viewers (configurable via slider)
const COOLDOWN_MS = 20000;  // 20 seconds between insights
const MIN_AVG_CONFIDENCE = 0.3; // minimum average confidence for segment lines (lowered for testing)
const TONE_HISTORY_WINDOW_MS = 60000; // track tone patterns for 60s
const AI_MAX_LATENCY_MS = 900; // hard deadline for AI response

let lastInsightAt = 0;
let lastInsightHash = '';
let lastTranscriptTime = Date.now();
let aiInFlight = false;
let lastAiStartedAt = 0;
let aiAbortController: AbortController | null = null;

// Diagnostics
let aiCallsStarted = 0;
let aiCallsAborted = 0;
let aiCallsSucceeded = 0;
let aiCallsFailed = 0;
let aiLatencies: number[] = [];

export function onEngineStatus(cb: (s: EngineStatus, m?: EngineMeta) => void) {
  statusListeners.push(cb);
  return () => {
    const idx = statusListeners.indexOf(cb);
    if (idx >= 0) statusListeners.splice(idx, 1);
  };
}

// Listen for threshold updates from extension
if (typeof window !== 'undefined') {
  import('./extensionService').then(({ extensionService }) => {
    extensionService.onViewerCount(() => {}); // keep connection alive
    // Listen for THRESHOLD_UPDATE messages via extension service
    const originalSend = extensionService.send;
    // We can't intercept directly, so we listen via a custom message handler in extensionService
  });
}

function emitEngineStatus(status: EngineStatus, meta?: EngineMeta) {
  console.debug('[ENGINE_STATUS:EMIT]', status, meta);
  statusListeners.forEach(fn => fn(status, meta));
  
  // Send via WebSocket to extension (background.js will relay to sidepanel)
  import('./extensionService').then(({ extensionService }) => {
    if (extensionService.isConnected) {
      extensionService.send('ENGINE_STATUS', { status, meta });
    }
  });
}

export function pushTranscript(text: string, conf?: number) {
  const now = Date.now();
  transcripts.push({ t: now, text, conf });
  lastTranscriptTime = now;
  emitEngineStatus('COLLECTING');
  if (transcripts.length > 2000) transcripts.splice(0, transcripts.length - 2000);
  
  // Periodically build segments from recent transcripts (every 3-5s worth of data)
  if (transcripts.length % 10 === 0) {
    rebuildSegments();
  }
}

function rebuildSegments() {
  const recent = transcripts.slice(-50); // last 50 lines
  const segments = buildSegments(recent);
  
  // Keep only valid segments with sufficient words
  for (const seg of segments) {
    if (countWords(seg.text) >= 12) {
      // Check if segment already exists
      const exists = recentSegments.some(s => Math.abs(s.t - seg.t) < 500 && s.text === seg.text);
      if (!exists) {
        recentSegments.push(seg);
      }
    }
  }
  
  // Keep only last 20 segments
  if (recentSegments.length > 20) {
    recentSegments.splice(0, recentSegments.length - 20);
  }
}

export async function pushViewer(count: number) {
  const now = Date.now();
  const prev = viewers.at(-1);
  viewers.push({ t: now, count });
  
  // Debug: Viewer sample
  Debug.emit('VIEWER_SAMPLE', { count, t: now });
  
  if (viewers.length > 2000) viewers.splice(0, viewers.length - 2000);
  if (!prev) return;

  const delta = count - prev.count;
  
  // [THRESHOLD:APPLIED] diagnostic log
  console.log('[THRESHOLD:APPLIED]', { MIN_DELTA, delta, absDelta: Math.abs(delta) });
  
  if (Math.abs(delta) < MIN_DELTA) {
    emitEngineStatus('IDLE');
    Debug.emit('CORRELATED_FAIL', { 
      reason: 'deltaBelowMin', 
      details: { delta, threshold: MIN_DELTA } 
    });
    return;
  }
  
  if (now - lastInsightAt < COOLDOWN_MS) {
    emitEngineStatus('IDLE');
    Debug.emit('CORRELATED_FAIL', { 
      reason: 'cooldown', 
      details: { timeSinceLastInsight: now - lastInsightAt, cooldown: COOLDOWN_MS } 
    });
    return;
  }
  
  // Debug: Delta detected
  Debug.emit('DELTA_DETECTED', {
    before: prev.count,
    after: count,
    delta,
    t: now
  });
  
  emitEngineStatus('CORRELATING');

  // Find the most recent segment within correlation window
  const segment = findRecentSegment(now);
  if (!segment) {
    console.log('[CORR] Insufficient context - no valid segment found');
    console.log('[CORR] Debug - Recent segments:', recentSegments.length, 'segments available');
    console.log('[CORR] Debug - Transcripts:', transcripts.slice(-5).map(t => ({ text: t.text.substring(0, 30), t: t.t })));
    emitEngineStatus('FAILED', { reason: 'No recent segment' });
    Debug.emit('CORRELATED_FAIL', { 
      reason: 'noSegmentInWindow', 
      details: { 
        windowMs: CORRELATION_WINDOW_MS,
        segmentsCount: recentSegments.length,
        transcriptsCount: transcripts.length
      } 
    });
    return;
  }
  
  // Check word count (lowered for testing)
  const wordCount = countWords(segment.text);
  if (wordCount < 5) {
    console.log('[CORR] Segment too short:', wordCount, 'words');
    emitEngineStatus('FAILED', { reason: 'Segment too short' });
    Debug.emit('CORRELATED_FAIL', { 
      reason: 'segmentTooShort', 
      details: { words: wordCount, minWords: 5, text: segment.text.substring(0, 50) } 
    });
    return;
  }

  const segmentHash = hashText(segment.text);
  
  // De-dupe: don't re-render if same segment + delta
  if (lastInsightHash === segmentHash + delta) {
    console.log('[CORR] Duplicate insight, skipping');
    emitEngineStatus('FAILED', { reason: 'Duplicate insight' });
    Debug.emit('CORRELATED_FAIL', { 
      reason: 'cooldown', 
      details: { note: 'duplicate segment hash' } 
    });
    return;
  }

  // Check average confidence of lines in segment
  if (!hasValidConfidence(segment)) {
    console.log('[CORR] Segment has low average confidence, skipping');
    emitEngineStatus('FAILED', { reason: 'Low confidence' });
    Debug.emit('CORRELATED_FAIL', { 
      reason: 'lowConfidence', 
      details: { threshold: MIN_AVG_CONFIDENCE } 
    });
    return;
  }
  
  // Mark start of correlation
  performance.mark('seg:end');

  const topic = classifyTopic(segment.text);
  const contextLabel = generateContextLabel(delta, topic);

  lastInsightAt = now;
  lastInsightHash = segmentHash + delta;

  // Debug: Correlation success
  Debug.emit('CORRELATED', {
    delta,
    segmentT: segment.t,
    text: segment.text.substring(0, 50) + (segment.text.length > 50 ? '...' : '')
  });
  
  // Measure latency
  performance.measure('corr:seg→delta', 'seg:end');
  const measure = performance.getEntriesByName('corr:seg→delta').at(-1);
  if (measure) {
    Debug.emit('LATENCY', { 
      segToDelta: measure.duration 
    });
  }
  
  // Analyze emotion with queueing and caching
  enqueueHumeAnalysis(segment.text, segment.t, async (emotion) => {
    const renderStart = performance.now();
    
    // Add to tone history
    const isNegative = delta < 0;
    toneHistory.push({ t: now, emotion: emotion.emotion, delta, isNegative });
    
    // Clean old history (keep last 60s)
    const cutoff = now - TONE_HISTORY_WINDOW_MS;
    while (toneHistory.length > 0 && toneHistory[0].t < cutoff) {
      toneHistory.shift();
    }
    
    let emotionalLabel = 'analyzing';
    let nextMove = '';
    
    // [AI:GATE] diagnostic log with sanitized preview - AI is now default for all deltas
    const transcriptPreview = segment.text.slice(0, 100).replace(/\n/g, ' ');
    console.log('[AI:GATE]', {
      delta,
      willCallAI: true,
      transcriptPreview,
      topic,
      emotion: emotion.emotion
    });
    
    // Try AI-powered insight generation first (always attempt AI, no gating by delta magnitude)
    emitEngineStatus('AI_CALLING');
    // Cancel previous AI call if still in flight (single-flight)
    if (aiInFlight && aiAbortController) {
      console.log('[AI] Cancelling previous in-flight AI call');
      aiAbortController.abort();
      aiCallsAborted++;
    }
    
    // Truncate transcript to last 100 words (before try block)
    const words = segment.text.split(/\s+/);
    const truncatedTranscript = words.slice(-100).join(' ');
    const sanitizedTranscript = truncatedTranscript.slice(0, 100).replace(/\n/g, ' ');
    
    try {
      console.log('🤖 ==========================================');
      console.log('🤖 CALLING CLAUDE API FOR INSIGHT (Web App)');
      console.log('🤖 URL:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`);
      console.log('🤖 Viewer Delta:', delta);
      console.log('🤖 Language Emotion:', emotion.emotion);
      console.log('🤖 Topic:', topic);
      console.log('🤖 ==========================================');
      
      const payload = {
        transcript: truncatedTranscript,
        viewerDelta: delta,
        viewerCount: count,
        prevCount: count - delta,
        language: { emotion: emotion.emotion },
        topic: topic,
        quality: 'GOOD',
        recentHistory: toneHistory.slice(-7).map(h => ({
          delta: h.delta,
          emotion: h.emotion
        }))
      };

      // Setup AbortController with strict timeout
      aiAbortController = new AbortController();
      const timeoutId = setTimeout(() => {
        aiAbortController?.abort();
        console.warn(`[AI] Timeout after ${AI_MAX_LATENCY_MS}ms → fallback`);
      }, AI_MAX_LATENCY_MS);
      
      aiInFlight = true;
      lastAiStartedAt = performance.now();
      aiCallsStarted++;
      
      // [AI:FETCH:STARTING] diagnostic log with sanitized payload
      console.log('[AI:FETCH:STARTING]', {
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`,
        payloadSize: JSON.stringify(payload).length,
        transcriptPreview: sanitizedTranscript,
        delta: payload.viewerDelta,
        topic: payload.topic,
        timestamp: new Date().toISOString()
      });
      
      const aiStartTime = performance.now();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: aiAbortController.signal
      });
      
      clearTimeout(timeoutId);
      const aiDuration = performance.now() - aiStartTime;
      aiLatencies.push(aiDuration);
      if (aiLatencies.length > 100) aiLatencies.shift();

      if (response.ok) {
        const aiInsight = await response.json();
        aiCallsSucceeded++;
        aiInFlight = false;
        
        console.log('✅ ==========================================');
        console.log('✅ CLAUDE INSIGHT RECEIVED (Web App)');
        console.log('✅ Response Time:', Math.round(aiDuration), 'ms');
        console.log('✅ Emotional Label:', aiInsight.emotionalLabel);
        console.log('✅ Next Move:', aiInsight.nextMove);
        console.log('✅ ==========================================');
        
        if (aiInsight.emotionalLabel && aiInsight.nextMove) {
          emotionalLabel = aiInsight.emotionalLabel;
          nextMove = aiInsight.nextMove;
        } else {
          throw new Error('Invalid AI response format');
        }
      } else {
        aiCallsFailed++;
        aiInFlight = false;
        
        const errorText = await response.text();
        console.error('❌ ==========================================');
        console.error('❌ CLAUDE API FAILED (Web App)');
        console.error('❌ Status:', response.status);
        console.error('❌ Error:', errorText);
        console.error('❌ Duration:', Math.round(aiDuration), 'ms');
        console.error('❌ ==========================================');
        throw new Error(`AI API error: ${response.status}`);
      }
    } catch (error) {
      aiInFlight = false;
      
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      
      // [AI:FETCH:FAILED] diagnostic log with error preview (max 100 chars)
      const errorPreview = error instanceof Error 
        ? (error.message || String(error)).slice(0, 100).replace(/\n/g, ' ')
        : String(error).slice(0, 100).replace(/\n/g, ' ');
      
      if (isAbortError) {
        aiCallsAborted++;
        console.warn('[AI:FETCH:FAILED]', {
          errorName: 'AbortError',
          errorPreview: 'Timeout exceeded',
          isAbortError: true,
          delta,
          topic,
          transcriptPreview: sanitizedTranscript
        });
      } else {
        aiCallsFailed++;
        console.error('[AI:FETCH:FAILED]', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorPreview,
          isAbortError: false,
          delta,
          topic,
          transcriptPreview: sanitizedTranscript
        });
      }
      // Fall through to fallback logic below
    }
    
    // Fallback logic (runs if AI error)
    if (!nextMove) {
      emitEngineStatus('AI_FALLBACK');
      console.warn('⚠️ ==========================================');
      console.warn('⚠️ AI INSIGHT FAILED - USING FALLBACK (Web App)');
      console.warn('⚠️ Falling back to deterministic system');
      console.warn('⚠️ ==========================================');
      
      // Deterministic topic-word template fallback (no transcript bleed risk)
      const topicWords: Record<TopicType, string> = {
        food: 'cooking',
        fitness: 'workout',
        finance: 'money',
        personal: 'story',
        interaction: 'chat',
        general: 'content'
      };
      
      const topicWord = topicWords[topic] || 'content';
      const abs = Math.abs(delta);
      const isDump = delta < 0 && abs > 30;
      
      if (delta > 0) {
        // Spike
        emotionalLabel = `${topicWord} engaged`;
        nextMove = `Do more ${topicWord} talk`;
      } else if (isDump) {
        // Dump
        emotionalLabel = `${topicWord} dump`;
        nextMove = `Stop ${topicWord}. Change topic now`;
      } else {
        // Drop
        emotionalLabel = `${topicWord} dip`;
        nextMove = `Less ${topicWord}. Do more energy`;
      }
      
      // [FALLBACK:GENERATED] diagnostic log
      console.log('[FALLBACK:GENERATED]', {
        emotionalLabel,
        nextMove,
        topicWord,
        delta
      });
      
      // Defensive validation against transcript bleed (check first 10 words of transcript)
      const transcriptStart = segment.text.split(/\s+/).slice(0, 10).join(' ').toLowerCase();
      const detectBleed = (output: string, source: string): boolean => {
        const outputWords = output.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        const sourceWords = source.toLowerCase().split(/\s+/).filter(w => w.length > 0);
        
        // Check for 2+ consecutive word matches
        for (let i = 0; i < outputWords.length - 1; i++) {
          const pair = outputWords.slice(i, i + 2).join(' ');
          if (pair.length > 4 && source.includes(pair)) {
            return true;
          }
        }
        
        // Check word frequency: if >40% of output words appear in source
        const matchingWords = outputWords.filter(word => 
          word.length > 3 && sourceWords.includes(word)
        );
        const overlapPercent = (matchingWords.length / outputWords.length) * 100;
        return overlapPercent > 40;
      };
      
      if (detectBleed(emotionalLabel, transcriptStart)) {
        console.warn('[FALLBACK:INVALID] emotionalLabel contains transcript, replacing');
        emotionalLabel = delta > 0 ? '✅ Neutral' : '❌ Neutral';
      }
      if (detectBleed(nextMove, transcriptStart)) {
        console.warn('[FALLBACK:INVALID] nextMove contains transcript, replacing');
        nextMove = delta > 0 ? 'Keep momentum' : 'Pivot to engaging content';
      }
    }
    
    // [EMIT:PRE] Final diagnostic log before emit (sanitized previews only)
    console.log('[EMIT:PRE]', {
      emotionalLabelPreview: emotionalLabel.slice(0, 30),
      nextMovePreview: nextMove.slice(0, 50),
      delta,
      topic,
      hasTranscript: !!segment.text,
      transcriptWordCount: segment.text.split(/\s+/).length
    });
    
    emit({
      t: now, 
      delta, 
      count, 
      text: segment.text, 
      topic, 
      contextLabel,
      emotion: emotion.emotion,
      emotionScore: emotion.score,
      emotionConfidence: emotion.confidence,
      segmentHash,
      emotionalLabel,
      nextMove,
      correlationQuality: 'AI_ENHANCED'
    });
    
    // Measure delta→render latency
    const renderTime = performance.now() - renderStart;
    Debug.emit('LATENCY', { deltaToRender: renderTime });
    Debug.emit('INSIGHT_RENDERED', { delta, count, segmentHash });
  });
}

function findRecentSegment(now: number): Segment | undefined {
  // Find segments within the correlation window (last 12s)
  const candidates = recentSegments.filter(s => now - s.t <= CORRELATION_WINDOW_MS);
  
  // Return the most recent one
  return candidates.length > 0 ? candidates[candidates.length - 1] : undefined;
}

function hasValidConfidence(segment: Segment): boolean {
  // Find all transcript lines that contributed to this segment
  const segmentLines = transcripts.filter(line => 
    Math.abs(line.t - segment.t) < 5000 && // within 5s of segment time
    segment.text.includes(line.text.slice(0, 10)) // text overlap check
  );
  
  if (segmentLines.length === 0) return true; // no confidence info available, allow
  
  const linesWithConf = segmentLines.filter(l => l.conf !== undefined);
  if (linesWithConf.length === 0) return true;
  
  const avgConf = linesWithConf.reduce((sum, l) => sum + (l.conf || 0), 0) / linesWithConf.length;
  return avgConf >= MIN_AVG_CONFIDENCE;
}

export function onInsight(cb: (e: Insight) => void) {
  listeners.push(cb);
}

export function setThresholds(minTrigger: number) {
  MIN_DELTA = minTrigger;
  console.log('[THRESHOLD:UPDATE] MIN_DELTA=' + MIN_DELTA);
}

export function getMinDelta(): number {
  return MIN_DELTA;
}

export function reset() {
  transcripts.length = 0;
  viewers.length = 0;
  listeners.length = 0;
  statusListeners.length = 0;
  recentSegments.length = 0;
  toneHistory.length = 0;
  lastInsightAt = 0;
  lastInsightHash = '';
  lastTranscriptTime = Date.now();
  aiInFlight = false;
  lastAiStartedAt = 0;
  aiAbortController = null;
  aiCallsStarted = 0;
  aiCallsAborted = 0;
  aiCallsSucceeded = 0;
  aiCallsFailed = 0;
  aiLatencies = [];
}

// Diagnostics: print stats every 30s
setInterval(() => {
  if (aiCallsStarted > 0) {
    const avgLatency = aiLatencies.length > 0 
      ? Math.round(aiLatencies.reduce((a, b) => a + b, 0) / aiLatencies.length)
      : 0;
    console.log('📊 AI stats: started=', aiCallsStarted, 'aborted=', aiCallsAborted, 
                'ok=', aiCallsSucceeded, 'failed=', aiCallsFailed, 'avg=', avgLatency, 'ms');
  }
}, 30000);

function emit(e: Insight) {
  const renderStart = performance.now();
  listeners.forEach(fn => fn(e));
  console.log("[CORR]", e);
  
  const source = (e.correlationQuality?.includes('AI') || e.correlationQuality?.includes('ENHANCED')) ? 'Claude' : 'Fallback';
  const latencyMs = Math.round(performance.now() - renderStart);
  
  emitEngineStatus('SUCCESS', { source, latencyMs });
  setTimeout(() => emitEngineStatus('IDLE'), 3000);
  
  // Log insight to database (fire-and-forget, non-blocking)
  import('@/integrations/supabase/client').then(({ supabase }) => {
    supabase.functions.invoke('log-insight', {
      body: {
        streamer_id: 'web_user_placeholder', // TODO: Phase 3 will use real auth
        session_id: Date.now().toString(),
        platform: 'web',
        viewer_delta: e.delta,
        viewer_count: e.count,
        prev_count: e.count - e.delta,
        transcript: e.text,
        topic: e.topic,
        emotion: e.emotion || 'unknown',
        emotional_label: e.emotionalLabel || '',
        next_move: e.nextMove || '',
        emotion_score: e.emotionScore,
        emotion_confidence: e.emotionConfidence,
        ai_latency_ms: latencyMs,
        ai_source: source,
        correlation_quality: e.correlationQuality,
      }
    }).then(({ data, error }) => {
      if (error) {
        console.error('[INSIGHT:LOG_FAIL]', error);
      } else {
        console.log('[INSIGHT:LOGGED]', data?.id);
      }
    }).catch(err => {
      console.error('[INSIGHT:LOG_FAIL]', err);
    });
  }).catch(err => {
    console.error('[INSIGHT:LOG_FAIL] Import failed', err);
  });
  
  // Send to extension
  import('./extensionService').then(({ extensionService }) => {
    if (extensionService.isConnected) {
      extensionService.send('INSIGHT', e);
      
      // Also send as ACTION for top winning/losing
      extensionService.send('ACTION', {
        label: e.emotionalLabel || e.topic,
        delta: e.delta,
        text: e.text,
        startTime: e.t - 3000,
        endTime: e.t,
        topic: e.topic
      });
    }
  });
}

// Removed old buildSegment - now using segmenter.ts

function classifyTopic(text: string): TopicType {
  const lower = text.toLowerCase();
  
  // Interaction patterns
  if (/(drop|comment|follow|like|subscribe|ig|instagram|chat|tell me|let me know|share|guys)/i.test(lower)) {
    return 'interaction';
  }
  
  // Food patterns
  if (/(food|eat|meal|recipe|cook|delicious|taste|restaurant|dish|lunch|dinner|breakfast)/i.test(lower)) {
    return 'food';
  }
  
  // Fitness patterns
  if (/(workout|exercise|gym|fitness|train|rep|muscle|cardio|weight|run|health)/i.test(lower)) {
    return 'fitness';
  }
  
  // Finance patterns
  if (/(money|invest|stock|crypto|dollar|price|buy|sell|financial|budget|save)/i.test(lower)) {
    return 'finance';
  }
  
  // Personal patterns
  if (/(feel|think|believe|personal|story|experience|life|journey|myself|emotion)/i.test(lower)) {
    return 'personal';
  }
  
  return 'general';
}

function generateContextLabel(delta: number, topic: TopicType): string {
  if (delta > 0) {
    switch (topic) {
      case 'interaction':
        return 'Topic "interaction" boosted engagement';
      case 'food':
        return 'Topic "food" drew viewers in';
      case 'fitness':
        return 'Topic "fitness" increased interest';
      case 'finance':
        return 'Topic "finance" captured attention';
      case 'personal':
        return 'Topic "personal" resonated with viewers';
      default:
        return 'Content engaged viewers';
    }
  } else {
    switch (topic) {
      case 'interaction':
        return 'Topic "interaction" didn\'t land';
      case 'food':
        return 'Topic "food" lost attention';
      case 'fitness':
        return 'Topic "fitness" caused drop-off';
      case 'finance':
        return 'Topic "finance" lost viewers';
      case 'personal':
        return 'Topic "personal" didn\'t connect';
      default:
        return 'Content caused viewer drop';
    }
  }
}

function generateEmotionalContent(
  emotion: string,
  delta: number,
  emotionScore: number,
  history: ToneHistory[]
): { emotionalLabel: string; nextMove: string } {
  const now = Date.now();
  const silenceDuration = now - lastTranscriptTime;
  const recentNegatives = history.filter(h => h.isNegative).slice(-3);
  const consecutiveNegatives = recentNegatives.length >= 3;
  
  // Extract topic from last segment
  const lastSegment = recentSegments[recentSegments.length - 1];
  const topic = lastSegment ? classifyTopic(lastSegment.text) : 'general';
  const topicWord = getTopicWord(topic);
  
  // Calculate dynamic thresholds based on MIN_DELTA
  const largeThreshold = MIN_DELTA * 2;
  
  // [FALLBACK:CATEGORY] diagnostic log
  console.log('[FALLBACK:CATEGORY]', {
    delta,
    MIN_DELTA,
    largeThreshold,
    category: delta > 0 ? 'spike' : Math.abs(delta) >= largeThreshold ? 'dump' : 'drop'
  });
  
  // VIEWER SPIKE (positive delta)
  if (delta > 0) {
    // Format: "Do more of X" (max 8 words)
    const lowerEmotion = emotion.toLowerCase();
    
    if (lowerEmotion.includes('joy') || lowerEmotion.includes('excitement')) {
      return {
        emotionalLabel: "exciting talk",
        nextMove: `Do more ${topicWord} talk`
      };
    }
    if (lowerEmotion.includes('interest') || lowerEmotion.includes('concentration')) {
      return {
        emotionalLabel: "focused energy",
        nextMove: `Keep doing ${topicWord} talk`
      };
    }
    return {
      emotionalLabel: `${topicWord} talk`,
      nextMove: `Do more ${topicWord} talk`
    };
  }
  
  // VIEWER DUMP (large negative loss >= largeThreshold)
  if (Math.abs(delta) >= largeThreshold) {
    // Format: "Stop X. Do more Y now" (max 8 words per line)
    if (consecutiveNegatives) {
      return {
        emotionalLabel: "killing stream",
        nextMove: "Stop everything. Change topic now"
      };
    }
    
    if (silenceDuration > 15000) {
      return {
        emotionalLabel: "dead air",
        nextMove: "Stop silence. Talk now"
      };
    }
    
    const lowerEmotion = emotion.toLowerCase();
    if (lowerEmotion.includes('boredom') || lowerEmotion.includes('tiredness')) {
      return {
        emotionalLabel: "boring",
        nextMove: `Stop ${topicWord}. Do energy now`
      };
    }
    if (lowerEmotion.includes('anxiety') || lowerEmotion.includes('awkwardness')) {
      return {
        emotionalLabel: "awkward",
        nextMove: `Stop ${topicWord}. Change topic now`
      };
    }
    
    return {
      emotionalLabel: `${topicWord} dump`,
      nextMove: `Stop ${topicWord}. Try interaction now`
    };
  }
  
  // VIEWER DROP (small negative loss < largeThreshold)
  // Format: "Less X. Do more Y" (max 8 words per line)
  if (silenceDuration > 15000) {
    return {
      emotionalLabel: "silence",
      nextMove: "Less silence. Do more talking"
    };
  }
  
  const lowerEmotion = emotion.toLowerCase();
  if (lowerEmotion.includes('boredom') || lowerEmotion.includes('tiredness')) {
    return {
      emotionalLabel: "low energy",
      nextMove: `Less ${topicWord}. Do more energy`
    };
  }
  if (lowerEmotion.includes('confusion') || lowerEmotion.includes('doubt')) {
    return {
      emotionalLabel: "confusing talk",
      nextMove: `Less ${topicWord}. Do more interaction`
    };
  }
  
  // Default drop message - be specific about alternative
  const alternatives = ['interaction', 'energy', 'story time'];
  const altTopic = alternatives[Math.floor(Math.random() * alternatives.length)];
  
  return {
    emotionalLabel: `${topicWord} talk`,
    nextMove: `Less ${topicWord}. Do more ${altTopic}`
  };
}

// Helper to get simple topic words
function getTopicWord(topic: TopicType): string {
  switch (topic) {
    case 'food': return 'cooking';
    case 'fitness': return 'workout';
    case 'finance': return 'money';
    case 'personal': return 'story';
    case 'interaction': return 'chat';
    default: return 'this';
  }
}

// Removed old analyzeEmotion - now using humeService.ts
