// Version: 2.0.0 - Claude Sonnet 4.5 with richer context
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
const DEBUG_MODE = Deno.env.get('ENABLE_CORRELATION_DEBUG') !== 'false'; // Default to true

function debugLog(correlationId: string, stage: string, data: any) {
  if (!DEBUG_MODE) return;
  console.log(`[CORRELATION:${correlationId}:${stage}]`, JSON.stringify(data, null, 2));
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InsightRequest {
  correlationId?: string;
  transcript: string;
  viewerDelta: number;
  viewerCount: number;
  prevCount: number;
  prosody?: {
    topEmotion?: string;
    topScore?: number;
    energy?: number;
    excitement?: number;
    confidence?: number;
  };
  burst?: {
    type?: string;
    detected?: boolean;
  };
  language?: {
    emotion?: string;
  };
  topic?: string;
  quality?: string;
  recentHistory?: Array<{
    delta: number;
    emotion?: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestStartTime = Date.now();
    const payload: InsightRequest = await req.json();
    const correlationId = payload.correlationId || `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    debugLog(correlationId, 'RECEIVED', {
      timestamp: new Date().toISOString(),
      viewerDelta: payload.viewerDelta,
      viewerCount: payload.viewerCount,
      transcriptLength: payload.transcript?.length || 0,
      topic: payload.topic,
      quality: payload.quality,
      hasHistory: !!payload.recentHistory?.length
    });
    
    // Load learned patterns from streamer_patterns table
    let patternsContext = '';
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: patterns, error: patternsError } = await supabase
        .from('streamer_patterns')
        .select('*')
        .eq('streamer_id', 'web_user_placeholder') // TODO: Phase 3 will use real user ID
        .order('confidence_score', { ascending: false })
        .limit(5);
      
      if (!patternsError && patterns && patterns.length > 0) {
        console.log('[PATTERNS:LOADED]', patterns.length, 'patterns');
        patternsContext = `\n\nLEARNED PATTERNS (from past streams):
${patterns.map(p => 
  `- Topic "${p.topic}" + emotion "${p.emotion}": ${p.success_rate > 0.5 ? 'WORKS' : 'FAILS'} (${(p.success_rate * 100).toFixed(0)}% success, ${p.sample_count} samples, confidence ${(p.confidence_score * 100).toFixed(0)}%)`
).join('\n')}

Use these patterns to inform your advice. If a pattern shows high success, encourage it. If it's an anti-pattern (is_anti_pattern=true), warn against it.`;
      } else {
        console.log('[PATTERNS:NONE]', 'No patterns found yet');
      }
    } catch (err) {
      console.error('[PATTERNS:ERROR]', err);
      // Continue without patterns - don't block insight generation
    }
    
    console.log('🤖 ==========================================');
    console.log('🤖 CLAUDE INSIGHT GENERATION STARTED');
    console.log('🤖 Correlation ID:', correlationId);
    console.log('🤖 Timestamp:', new Date().toISOString());
    console.log('🤖 Model: claude-sonnet-4-5');
    console.log('🤖 Viewer Delta:', payload.viewerDelta);
    console.log('🤖 Viewer Count:', payload.viewerCount);
    console.log('🤖 Transcript Length:', payload.transcript?.length || 0, 'chars');
    console.log('🤖 Has Prosody:', !!payload.prosody);
    console.log('🤖 Has Burst:', !!payload.burst);
    console.log('🤖 Signal Quality:', payload.quality);
    console.log('🤖 ==========================================');

    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    // Determine feedback type based on delta
    const deltaAbs = Math.abs(payload.viewerDelta);
    let feedbackType = 'spike';
    if (payload.viewerDelta < 0) {
      feedbackType = deltaAbs > 30 ? 'dump' : 'drop';
    }

    // Build context string
    const prosodyStr = payload.prosody 
      ? `Top emotion: ${payload.prosody.topEmotion || 'unknown'} (${payload.prosody.topScore || 0}%), Energy: ${payload.prosody.energy || 0}%, Excitement: ${payload.prosody.excitement || 0}%, Confidence: ${payload.prosody.confidence || 0}%`
      : 'No prosody data';
    
    const burstStr = payload.burst?.detected 
      ? `Burst detected: ${payload.burst.type || 'unknown'}`
      : 'No burst activity';
    
    const languageStr = payload.language?.emotion 
      ? `Language emotion: ${payload.language.emotion}`
      : 'No language emotion';

    const historyStr = payload.recentHistory?.length 
      ? `Recent pattern: ${payload.recentHistory.map(h => `${h.delta > 0 ? '+' : ''}${h.delta} (${h.emotion || 'unknown'})`).join(', ')}`
      : 'No recent history';

    // Create system prompt
    const systemPrompt = `You are Spikely's insight engine. Your job is to analyze what caused viewer changes during a livestream and tell streamers EXACTLY what to do next.

CONTEXT:
Streamers are multitasking and need instant, actionable feedback. Your insights must be:
- Simple enough to understand while streaming
- Specific enough to be immediately actionable
- Fast enough to help in real-time

RULES:
1. Max 8 words per line
2. 7th-grade reading level
3. Command-style (no questions, no punctuation clutter)
4. Be SPECIFIC about what they did (reference their actual words/actions from transcript)
5. NEVER return raw transcript text in emotionalLabel or nextMove. emotionalLabel must be 2-3 words; nextMove <= 8 words.
6. Format based on viewer change:
   - Viewer GAIN (positive delta) → "Do more of X"
   - Viewer DROP (negative delta, small) → "Less X. Do more Y"
   - Viewer DUMP (negative delta, large >30) → "Stop X. Do more Y now"

ANALYSIS PRIORITIES:
1. What were they literally saying/doing? (transcript)
2. How did their voice sound? (prosody)
3. Was there laughter/energy? (burst activity)
4. What emotion was in their word choice? (language)
5. Does this match recent patterns? (history)

OUTPUT FORMAT (JSON only):
{
  "emotionalLabel": "2-3 word description of what happened",
  "nextMove": "8 word max command telling them what to do"
}

EXAMPLES:

Good insights:
- Spike from cooking talk: {"emotionalLabel": "cooking engaged", "nextMove": "Do more of cooking talk"}
- Drop from technical issues: {"emotionalLabel": "tech frustrated", "nextMove": "Less fixing stream. Do more cooking"}
- Dump from complaining: {"emotionalLabel": "venting negative", "nextMove": "Stop complaining. Show cooking now"}

Bad insights (too vague):
- {"emotionalLabel": "positive", "nextMove": "Keep doing what you're doing"}
- {"emotionalLabel": "engagement", "nextMove": "Be more engaging"}

Bad insights (transcript bleed - NEVER DO THIS):
- {"emotionalLabel": "twenty one is that really youn brought +15", "nextMove": "Keep talking about twenty one"}
- Any output containing raw transcript phrases longer than 2 words${patternsContext}`;

    const userPrompt = `INPUT DATA:
- Transcript: "${payload.transcript}"
- Viewer change: ${payload.viewerDelta} (from ${payload.prevCount} to ${payload.viewerCount})
- ${prosodyStr}
- ${burstStr}
- ${languageStr}
- Topic: ${payload.topic || 'unknown'}
- Signal quality: ${payload.quality || 'unknown'}
- ${historyStr}
- Feedback type: ${feedbackType}

Analyze this data and generate an insight following the rules above. Return ONLY valid JSON.`;

    // Log full prompts in debug mode
    debugLog(correlationId, 'CLAUDE_REQUEST', {
      model: 'claude-sonnet-4-5',
      maxTokens: 150,
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      requestPayload: {
        viewerDelta: payload.viewerDelta,
        viewerCount: payload.viewerCount,
        prevCount: payload.prevCount,
        transcript: payload.transcript,
        topic: payload.topic,
        quality: payload.quality
      }
    });

    console.log('🤖 Calling Claude API...');
    const apiCallStartTime = Date.now();

    // Add AbortController with 1200ms server-side timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.warn('[Generate Insight] Claude call aborted after 1200ms');
    }, 1200);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 150,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    if (!response.ok) {
      let errorText = '<no body>';
      try {
        errorText = await response.text();
      } catch (readError) {
        console.error('[Generate Insight] Failed to read error response body:', readError);
      }
      
      // Sanitize error preview (max 100 chars, no newlines)
      const errorPreview = errorText.slice(0, 100).replace(/\n/g, ' ');
      const transcriptPreview = (payload.transcript || '').slice(0, 100).replace(/\n/g, ' ');
      
      console.error('[Generate Insight] Claude API error:', {
        status: response.status,
        statusText: response.statusText,
        errorBodyPreview: errorPreview,
        payloadPreview: {
          transcriptPreview,
          viewerDelta: payload.viewerDelta,
          topic: payload.topic
        }
      });
      throw new Error(`Claude API error: ${response.status} - ${errorPreview}`);
    }

    const data = await response.json();
    const apiCallDuration = Date.now() - apiCallStartTime;
    const totalDuration = Date.now() - requestStartTime;

    // Log raw Claude response
    debugLog(correlationId, 'CLAUDE_RESPONSE', {
      rawResponse: data,
      contentText: data?.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      timing: {
        apiCallMs: apiCallDuration,
        totalMs: totalDuration
      }
    });

    let generatedText: string = data?.content?.[0]?.text ?? '';
    let insight: any | null = null;

    try {
      if (typeof generatedText === 'string') generatedText = generatedText.trim();
      if (generatedText) {
        try {
          insight = JSON.parse(generatedText);
        } catch {
          // Try to salvage JSON object from any wrapper text
          const match = generatedText.match(/\{[\s\S]*\}/);
          if (match) {
            try { 
              insight = JSON.parse(match[0]); 
            } catch {}
          }
        }
      }
    } catch {}

    // Fallback to deterministic template-based output if model returned invalid/empty JSON
    if (!insight || !insight.emotionalLabel || !insight.nextMove) {
      console.warn('[Generate Insight] Invalid AI content, using deterministic template fallback. Raw:', generatedText?.slice?.(0, 200));
      
      // Deterministic topic-word mapping (NEVER includes raw transcript)
      const topicWords: Record<string, string> = {
        food: 'cooking',
        fitness: 'workout',
        finance: 'money',
        personal: 'story',
        interaction: 'chat',
        general: 'content'
      };
      
      const topic = payload.topic || 'general';
      const topicWord = topicWords[topic] || 'content';
      const abs = Math.abs(payload.viewerDelta);
      const isDump = payload.viewerDelta < 0 && abs > 30;
      
      let emotionalLabel = '';
      let nextMove = '';
      
      if (payload.viewerDelta > 0) {
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
      
      console.log('[PATTERN:FALLBACK]', { topicWord, emotionalLabel, nextMove, delta: payload.viewerDelta });
      
      insight = {
        emotionalLabel,
        nextMove
      };
    }
    
    // Defensive validation against transcript bleed (check first 10 words of transcript)
    const transcriptStart = payload.transcript.split(/\s+/).slice(0, 10).join(' ').toLowerCase();
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
    
    if (detectBleed(insight.emotionalLabel, transcriptStart)) {
      console.warn('[FALLBACK:INVALID] emotionalLabel contains transcript, replacing');
      insight.emotionalLabel = payload.viewerDelta > 0 ? '✅ Neutral' : '❌ Neutral';
    }
    if (detectBleed(insight.nextMove, transcriptStart)) {
      console.warn('[FALLBACK:INVALID] nextMove contains transcript, replacing');
      insight.nextMove = payload.viewerDelta > 0 ? 'Keep momentum' : 'Pivot to engaging content';
    }
    
    // Enforce max word count and truncation
    const emotionalLabelWords = insight.emotionalLabel.split(/\s+/);
    if (emotionalLabelWords.length > 3) {
      insight.emotionalLabel = emotionalLabelWords.slice(0, 3).join(' ');
    }
    const nextMoveWords = insight.nextMove.split(/\s+/);
    if (nextMoveWords.length > 8) {
      insight.nextMove = nextMoveWords.slice(0, 8).join(' ');
    }
    
    // Truncate to absolute max (200 chars)
    insight.emotionalLabel = insight.emotionalLabel.slice(0, 200);
    insight.nextMove = insight.nextMove.slice(0, 200);

    console.log('✅ ==========================================');
    console.log('✅ CLAUDE INSIGHT GENERATION COMPLETED');
    console.log('✅ Correlation ID:', correlationId);
    console.log('✅ API Call Duration:', apiCallDuration, 'ms');
    console.log('✅ Total Duration:', totalDuration, 'ms');
    console.log('✅ Tokens - Input:', data.usage?.input_tokens || 'unknown');
    console.log('✅ Tokens - Output:', data.usage?.output_tokens || 'unknown');
    console.log('✅ Emotional Label:', insight.emotionalLabel);
    console.log('✅ Next Move:', insight.nextMove);
    console.log('✅ ==========================================');
    
    debugLog(correlationId, 'COMPLETE', {
      insight,
      timing: {
        apiCallMs: apiCallDuration,
        totalMs: totalDuration
      },
      tokens: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0,
        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    });

    return new Response(JSON.stringify({
      ...insight,
      source: 'Claude',
      correlationId,
      timing: {
        apiCallMs: apiCallDuration,
        totalMs: totalDuration
      },
      tokens: DEBUG_MODE ? {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0
      } : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Generate Insight] Error:', error);
    
    // Try to get payload if available, otherwise use safe defaults
    let topic = 'content';
    let viewerDelta = 0;
    
    try {
      const bodyText = await req.text();
      const parsed = JSON.parse(bodyText);
      topic = parsed?.topic || 'content';
      viewerDelta = parsed?.viewerDelta || 0;
    } catch {
      // Ignore parsing errors, use defaults
    }
    
    const abs = Math.abs(viewerDelta);
    const isDump = viewerDelta < 0 && abs > 30;
    
    let nextMove = '';
    if (viewerDelta > 0) nextMove = `Do more of ${topic}`;
    else if (isDump) nextMove = `Stop ${topic}. Change topic now`;
    else nextMove = `Less ${topic}. Try interaction`;
    
    return new Response(JSON.stringify({ 
      emotionalLabel: viewerDelta > 0 ? `${topic} engaged` : `${topic} lost interest`,
      nextMove,
      source: 'fallback',
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
