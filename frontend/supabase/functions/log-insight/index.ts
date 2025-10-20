import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LogInsightRequest {
  streamer_id: string;
  session_id: string;
  platform: string;
  viewer_delta: number;
  viewer_count: number;
  prev_count: number;
  transcript: string;
  topic: string;
  emotion: string;
  emotional_label: string;
  next_move: string;
  emotion_score?: number;
  emotion_confidence?: number;
  ai_latency_ms?: number;
  ai_source?: string;
  correlation_quality?: string;
  variant_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[LOG:INSIGHT:START]');

  try {
    const payload: LogInsightRequest = await req.json();
    
    // Validate required fields
    if (!payload.streamer_id || !payload.transcript || !payload.session_id) {
      console.error('[LOG:INSIGHT:ERR] Missing required fields');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: streamer_id, transcript, session_id' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compute SHA-256 hash of transcript
    const encoder = new TextEncoder();
    const data = encoder.encode(payload.transcript);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const transcript_hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert into insight_history
    const { data: insertData, error: insertError } = await supabase
      .from('insight_history')
      .insert({
        streamer_id: payload.streamer_id,
        session_id: payload.session_id,
        platform: payload.platform,
        viewer_delta: payload.viewer_delta,
        viewer_count: payload.viewer_count,
        prev_count: payload.prev_count,
        transcript: payload.transcript,
        transcript_hash,
        topic: payload.topic,
        emotion: payload.emotion,
        emotional_label: payload.emotional_label,
        next_move: payload.next_move,
        emotion_score: payload.emotion_score,
        emotion_confidence: payload.emotion_confidence,
        ai_latency_ms: payload.ai_latency_ms,
        ai_source: payload.ai_source,
        correlation_quality: payload.correlation_quality,
        variant_id: payload.variant_id,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[LOG:INSIGHT:ERR]', insertError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: insertError.message 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[LOG:INSIGHT:OK]', insertData.id);
    
    return new Response(JSON.stringify({ 
      success: true, 
      id: insertData.id 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[LOG:INSIGHT:ERR]', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
