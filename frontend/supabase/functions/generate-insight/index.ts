// Version: 2.0.0 - Claude Sonnet 4.5 with richer context
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InsightRequest {
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
    const systemPrompt = `You are Spikely's real-time live stream AI coach. Your job is to analyze viewer behavior patterns and give streamers PRECISE, ACTIONABLE micro-decisions to spike engagement NOW.

STREAMER CONTEXT:
- Multitasking while live (can't read paragraphs)
- Needs instant decisions, not analysis
- Looking for WHAT to say/do in the next 30 seconds

YOUR OUTPUT MUST BE:
- 3-5 word tactical prompt (what to do)
- Short emotional/tonal cue (how to do it)
- Based on PATTERNS in the data, not generic advice
- Positive framing (tell them what TO do, not what NOT to do)

FORMAT:
{
  "emotionalLabel": "2-3 words describing the pattern",
  "nextMove": "3-5 word action + tonal cue"
}

ANALYSIS APPROACH:
1. What SPECIFIC topic/action caused the viewer change? (from transcript)
2. What emotion/energy drove it? (from Hume AI prosody)
3. What should they repeat or pivot from?

INSIGHT TYPES BASED ON VIEWER CHANGE:

**SPIKE (viewers +15 or more):**
- Identify the EXACT topic/phrase that worked
- Tell them to double down on it
- Example: {"emotionalLabel": "gaming talk wins", "nextMove": "Ask about their setups. Stay hyped"}

**DROP (viewers -5 to -15):**
- Identify what lost traction
- Give constructive pivot with energy cue
- Example: {"emotionalLabel": "tech rant dips", "nextMove": "Pivot to giveaway. Build excitement"}

**DUMP (viewers -30 or more):**
- Strong corrective action
- Provide immediate recovery tactic
- Example: {"emotionalLabel": "complaining kills vibe", "nextMove": "Show product now. Go upbeat"}

**FLATLINE (viewers ±3):**
- Suggest engagement driver to create movement
- Example: {"emotionalLabel": "energy steady", "nextMove": "Ask where they're from. Create buzz"}

STRICT RULES:
1. NEVER copy raw transcript phrases into outputs
2. Use topic categories: gaming, makeup, cooking, fitness, story, chat, giveaway
3. Action verbs: Ask, Show, Talk about, Tease, Reveal, Pivot to
4. Tonal cues: Stay hyped, Go vulnerable, Build excitement, Keep energy up, Soften tone
5. Max 8 words total in nextMove
6. emotionalLabel: 2-3 words max

EXAMPLES OF GOOD INSIGHTS:

Positive:
- {"emotionalLabel": "makeup demo spikes", "nextMove": "Show closeup. Stay excited"}
- {"emotionalLabel": "story connects", "nextMove": "Ask their stories. Be authentic"}
- {"emotionalLabel": "energy matches vibe", "nextMove": "Keep this pace. Stay present"}

Corrective:
- {"emotionalLabel": "tech talk loses", "nextMove": "Pivot to giveaway. Boost energy"}
- {"emotionalLabel": "slow pacing dips", "nextMove": "Ask quick questions. Speed up"}
- {"emotionalLabel": "rambling drops off", "nextMove": "Get to point. Be direct"}

BAD EXAMPLES (never do this):
- {"emotionalLabel": "positive vibes", "nextMove": "Keep being positive"} ← Too vague
- {"emotionalLabel": "twenty one is young", "nextMove": "talk about it"} ← Transcript bleed
- {"emotionalLabel": "engagement", "nextMove": "Be more engaging"} ← Not actionable${patternsContext}`;

    const userPrompt = `LIVE STREAM DATA:

WHAT THEY SAID: "${payload.transcript}"

VIEWER IMPACT: ${payload.viewerDelta > 0 ? '+' : ''}${payload.viewerDelta} viewers (${payload.prevCount} → ${payload.viewerCount})

VOICE ANALYSIS: ${prosodyStr}

ENERGY SIGNALS: ${burstStr}

WORD EMOTION: ${languageStr}

TOPIC: ${payload.topic || 'general'}

RECENT PATTERN: ${historyStr}

SIGNAL STRENGTH: ${payload.quality || 'medium'}

---

Based on this data, generate ONE tactical decision for the streamer to execute in the next 30 seconds. Return ONLY valid JSON with no markdown or explanation.`;

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
            try { insight = JSON.parse(match[0]); } catch {}
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
    console.log('✅ API Call Duration:', apiCallDuration, 'ms');
    console.log('✅ Total Duration:', totalDuration, 'ms');
    console.log('✅ Tokens - Input:', data.usage?.input_tokens || 'unknown');
    console.log('✅ Tokens - Output:', data.usage?.output_tokens || 'unknown');
    console.log('✅ Emotional Label:', insight.emotionalLabel);
    console.log('✅ Next Move:', insight.nextMove);
    console.log('✅ ==========================================');

    return new Response(JSON.stringify(insight), {
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
