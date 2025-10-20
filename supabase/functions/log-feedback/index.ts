import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LogFeedbackRequest {
  insight_id: string;
  streamer_id: string;
  rating?: number;
  followed_advice?: boolean;
  subsequent_delta?: number;
  time_to_feedback_ms?: number;
  outcome_30s?: number;
  outcome_60s?: number;
  action_taken?: string;
  context_before?: string;
  context_after?: string;
  feedback_text?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[LOG:FEEDBACK:START]');

  try {
    const payload: LogFeedbackRequest = await req.json();
    
    // Validate required fields
    if (!payload.insight_id || !payload.streamer_id) {
      console.error('[LOG:FEEDBACK:ERR] Missing required fields');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields: insight_id, streamer_id' 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Prepare update data (only include fields that are provided)
    const updateData: any = {
      insight_id: payload.insight_id,
      streamer_id: payload.streamer_id,
    };

    if (payload.rating !== undefined) updateData.rating = payload.rating;
    if (payload.followed_advice !== undefined) updateData.followed_advice = payload.followed_advice;
    if (payload.subsequent_delta !== undefined) updateData.subsequent_delta = payload.subsequent_delta;
    if (payload.time_to_feedback_ms !== undefined) updateData.time_to_feedback_ms = payload.time_to_feedback_ms;
    if (payload.outcome_30s !== undefined) updateData.outcome_30s = payload.outcome_30s;
    if (payload.outcome_60s !== undefined) updateData.outcome_60s = payload.outcome_60s;
    if (payload.action_taken !== undefined) updateData.action_taken = payload.action_taken;
    if (payload.context_before !== undefined) updateData.context_before = payload.context_before;
    if (payload.context_after !== undefined) updateData.context_after = payload.context_after;
    if (payload.feedback_text !== undefined) updateData.feedback_text = payload.feedback_text;

    // Upsert into insight_feedback (allows partial updates)
    const { data: upsertData, error: upsertError } = await supabase
      .from('insight_feedback')
      .upsert(updateData, { onConflict: 'insight_id' })
      .select('id')
      .single();

    if (upsertError) {
      console.error('[LOG:FEEDBACK:ERR]', upsertError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: upsertError.message 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[LOG:FEEDBACK:OK]', upsertData?.id || 'updated');
    
    return new Response(JSON.stringify({ 
      success: true,
      id: upsertData?.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[LOG:FEEDBACK:ERR]', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
