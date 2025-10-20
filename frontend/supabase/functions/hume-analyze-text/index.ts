import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    
    if (!text) {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const humeApiKey = Deno.env.get('HUME_AI_API_KEY');
    
    if (!humeApiKey) {
      console.error('HUME_AI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Hume AI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Hume Text] Analyzing text:', text.substring(0, 50) + '...');

    const response = await fetch('https://api.hume.ai/v0/batch/jobs', {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': humeApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        models: {
          language: {}
        },
        text: [text]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Hume Text] API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Hume AI API error', details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const jobData = await response.json();
    const jobId = jobData.job_id;
    
    console.log('[Hume Text] Job created:', jobId);

    // Poll for results (max 10 seconds)
    let predictions = null;
    const maxAttempts = 20;
    const pollInterval = 500;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      const statusResponse = await fetch(`https://api.hume.ai/v0/batch/jobs/${jobId}/predictions`, {
        headers: {
          'X-Hume-Api-Key': humeApiKey,
        },
      });

      if (statusResponse.ok) {
        const data = await statusResponse.json();
        if (data && data.length > 0 && data[0].results?.predictions?.length > 0) {
          predictions = data[0].results.predictions[0];
          console.log('[Hume Text] Predictions received');
          break;
        }
      }
    }

    if (!predictions || !predictions.emotions || predictions.emotions.length === 0) {
      console.log('[Hume Text] No predictions found, returning neutral');
      return new Response(
        JSON.stringify({ 
          emotion: 'Neutral',
          score: 0.5,
          confidence: 50
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get top emotion
    const sortedEmotions = predictions.emotions.sort((a: any, b: any) => b.score - a.score);
    const topEmotion = sortedEmotions[0];
    
    const emotionName = topEmotion.name.charAt(0).toUpperCase() + topEmotion.name.slice(1);
    const score = topEmotion.score;
    const confidence = Math.round(score * 100);

    console.log('[Hume Text] Top emotion:', emotionName, confidence + '%');

    return new Response(
      JSON.stringify({
        emotion: emotionName,
        score: score,
        confidence: confidence
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Hume Text] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
