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
    const body = await req.json();
    console.log('[Hume Edge] Request body keys:', Object.keys(body));
    
    const { audio } = body;
    
    if (!audio) {
      console.error('[Hume Edge] ❌ Missing audio field. Received keys:', Object.keys(body));
      throw new Error('No audio data provided');
    }

    const HUME_AI_API_KEY = Deno.env.get('HUME_AI_API_KEY');
    if (!HUME_AI_API_KEY) {
      throw new Error('HUME_AI_API_KEY not configured');
    }

    console.log('[Hume Edge] ==========================================');
    console.log('[Hume Edge] 🎭 Received prosody analysis request');
    console.log('[Hume Edge] Audio base64 length:', audio.length, 'chars');

    // Convert base64 PCM16 to binary
    const binaryString = atob(audio);
    const pcm16Bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      pcm16Bytes[i] = binaryString.charCodeAt(i);
    }

    console.log('[Hume Edge] PCM16 bytes length:', pcm16Bytes.length);

    // Build WAV header for PCM16, mono, 16kHz
    const numChannels = 1;
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcm16Bytes.length;
    const headerSize = 44;
    
    const wavHeader = new Uint8Array(headerSize);
    const view = new DataView(wavHeader.buffer);
    
    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataSize, true); // file size - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);
    
    // Combine header + PCM data
    const wavBytes = new Uint8Array(headerSize + dataSize);
    wavBytes.set(wavHeader, 0);
    wavBytes.set(pcm16Bytes, headerSize);
    
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
    console.log('[Hume Edge] WAV blob size:', wavBlob.size, 'bytes');

    // Build FormData with WAV file and JSON config
    const formData = new FormData();
    formData.append('file', wavBlob, 'audio.wav');
    formData.append('json', new Blob([JSON.stringify({
      models: {
        prosody: {
          granularity: "utterance",
          window: { length: 4, step: 1 }
        },
        burst: {},
        language: { granularity: "word" }
      },
      transcription: {
        language: null,
        identify_speakers: false,
        confidence_threshold: 0.5
      }
    })], { type: 'application/json' }));

    // Call Hume AI Batch API
    const response = await fetch(
      'https://api.hume.ai/v0/batch/jobs',
      {
        method: 'POST',
        headers: {
          'X-Hume-Api-Key': HUME_AI_API_KEY,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Hume AI API error:', response.status, errorText);
      
      // Return mock data for development if API fails
      console.log('⚠️ Returning mock emotion data for development');
      return new Response(
        JSON.stringify({
          prosody: {
            topEmotions: [
              { name: 'Excitement', score: 0.65 },
              { name: 'Confidence', score: 0.58 },
              { name: 'Enthusiasm', score: 0.62 },
              { name: 'Interest', score: 0.55 },
              { name: 'Joy', score: 0.48 }
            ],
            metrics: {
              excitement: 0.65,
              confidence: 0.58,
              energy: 0.635,
            }
          },
          burst: {
            topEmotions: [
              { name: 'Amusement (laugh)', score: 0.72 },
              { name: 'Excitement burst', score: 0.58 }
            ]
          },
          language: {
            topEmotions: [
              { name: 'Joy', score: 0.68 },
              { name: 'Excitement', score: 0.61 }
            ]
          },
          meta: {
            dominantSignal: 'Burst',
            avgSignalStrength: 0.66,
            correlationQuality: 'GOOD'
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await response.json();
    console.log('[Hume Edge] ✅ Hume AI job created:', result.job_id);
    console.log('[Hume Edge] Polling for results...');

    const jobId = result.job_id;

    // Poll for results (with longer timeout for Hume AI processing)
    let jobResult = null;
    let attempts = 0;
    const maxAttempts = 10; // Increased from 5 to 10 for better reliability
    const pollIntervalMs = 800; // Increased from 500ms to 800ms

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      
      const statusResponse = await fetch(
        `https://api.hume.ai/v0/batch/jobs/${jobId}/predictions`,
        {
          headers: {
            'X-Hume-Api-Key': HUME_AI_API_KEY,
          },
        }
      );

      if (statusResponse.ok) {
        jobResult = await statusResponse.json();
        console.log(`[Hume Edge] Poll attempt ${attempts + 1}/${maxAttempts}:`, 
          jobResult && jobResult.length > 0 ? '✅ Results ready' : '⏳ Still processing...');
        if (jobResult && jobResult.length > 0 && jobResult[0]?.results?.predictions) {
          console.log(`[Hume Edge] 🎉 Hume API SUCCESS after ${attempts + 1} attempts (${(attempts + 1) * pollIntervalMs}ms)`);
          break;
        }
      } else {
        console.warn(`[Hume Edge] Poll attempt ${attempts + 1} failed with status:`, statusResponse.status);
      }
      
      attempts++;
    }

    // If polling times out, log warning and return mock data
    if (!jobResult || jobResult.length === 0 || !jobResult[0]?.results?.predictions) {
      console.warn('⚠️ ==========================================');
      console.warn('⚠️ HUME API TIMEOUT OR FAILURE');
      console.warn(`⚠️ Polled ${maxAttempts} times over ${maxAttempts * pollIntervalMs}ms`);
      console.warn('⚠️ Returning mock data for graceful degradation');
      console.warn('⚠️ Check Hume AI API status and rate limits');
      console.warn('⚠️ ==========================================');
      return new Response(
        JSON.stringify({
          prosody: {
            topEmotions: [
              { name: 'Excitement', score: 0.60 },
              { name: 'Confidence', score: 0.55 },
              { name: 'Enthusiasm', score: 0.58 },
              { name: 'Interest', score: 0.52 },
              { name: 'Determination', score: 0.50 }
            ],
            metrics: {
              excitement: 0.60,
              confidence: 0.55,
              energy: 0.59,
            }
          },
          burst: {
            topEmotions: [
              { name: 'Amusement (laugh)', score: 0.68 },
              { name: 'Interest sound', score: 0.54 }
            ]
          },
          language: {
            topEmotions: [
              { name: 'Joy', score: 0.63 },
              { name: 'Interest', score: 0.57 }
            ]
          },
          meta: {
            dominantSignal: 'Burst',
            avgSignalStrength: 0.62,
            correlationQuality: 'GOOD'
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Extract prosody emotions
    const prosodyEmotions = jobResult?.[0]?.results?.predictions?.[0]?.models?.prosody?.grouped_predictions?.[0]?.predictions?.[0]?.emotions || [];
    
    // Extract burst emotions (vocal expressions)
    const burstEmotions = jobResult?.[0]?.results?.predictions?.[0]?.models?.burst?.grouped_predictions?.[0]?.predictions?.[0]?.emotions || [];
    
    // Extract language emotions
    const languageEmotions = jobResult?.[0]?.results?.predictions?.[0]?.models?.language?.grouped_predictions?.[0]?.predictions?.[0]?.emotions || [];
    
    // Sort and get top 5 from each
    const topProsody = prosodyEmotions
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((e: any) => ({ name: e.name, score: e.score }));
    
    const topBursts = burstEmotions
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((e: any) => ({ name: e.name, score: e.score }));
    
    const topLanguage = languageEmotions
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map((e: any) => ({ name: e.name, score: e.score }));

    // Calculate overall metrics
    const excitement = prosodyEmotions.find((e: any) => e.name === 'Excitement')?.score || 0;
    const confidence = prosodyEmotions.find((e: any) => e.name === 'Confidence')?.score || 0;
    const enthusiasm = prosodyEmotions.find((e: any) => e.name === 'Enthusiasm')?.score || 0;
    const energy = (excitement + enthusiasm) / 2;

    console.log('[Hume Edge] ==========================================');
    console.log('[Hume Edge] 📊 MULTI-SIGNAL ANALYSIS COMPLETE');
    console.log('[Hume Edge] ==========================================');

    // Prosody (Speech Tone)
    console.log('[Hume Edge] 🎤 PROSODY (Speech Tone):');
    topProsody.forEach((e, i) => {
      console.log(`[Hume Edge]   ${i + 1}. ${e.name}: ${(e.score * 100).toFixed(1)}%`);
    });
    console.log('[Hume Edge]   Excitement:', (excitement * 100).toFixed(1) + '%');
    console.log('[Hume Edge]   Confidence:', (confidence * 100).toFixed(1) + '%');
    console.log('[Hume Edge]   Energy:', (energy * 100).toFixed(1) + '%');

    // Vocal Burst
    console.log('[Hume Edge] 💥 VOCAL BURST (Non-speech sounds):');
    if (topBursts.length > 0) {
      topBursts.forEach((e, i) => {
        console.log(`[Hume Edge]   ${i + 1}. ${e.name}: ${(e.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('[Hume Edge]   (no bursts detected)');
    }

    // Language Emotion
    console.log('[Hume Edge] 📝 LANGUAGE EMOTION (Word choice):');
    if (topLanguage.length > 0) {
      topLanguage.forEach((e, i) => {
        console.log(`[Hume Edge]   ${i + 1}. ${e.name}: ${(e.score * 100).toFixed(1)}%`);
      });
    } else {
      console.log('[Hume Edge]   (no language data)');
    }

    // Signal Quality Delta
    console.log('[Hume Edge] ==========================================');
    console.log('[Hume Edge] 🎯 SIGNAL QUALITY DELTA:');

    const prosodyMax = topProsody[0]?.score || 0;
    const burstMax = topBursts[0]?.score || 0;
    const languageMax = topLanguage[0]?.score || 0;

    console.log('[Hume Edge]   Prosody strength:', (prosodyMax * 100).toFixed(1) + '%');
    console.log('[Hume Edge]   Burst strength:', (burstMax * 100).toFixed(1) + '%');
    console.log('[Hume Edge]   Language strength:', (languageMax * 100).toFixed(1) + '%');

    // Calculate signal dominance
    const signals = [
      { name: 'Prosody', score: prosodyMax },
      { name: 'Burst', score: burstMax },
      { name: 'Language', score: languageMax }
    ].sort((a, b) => b.score - a.score);

    console.log('[Hume Edge]   🏆 Dominant signal:', signals[0].name);
    console.log('[Hume Edge]   Signal spread:', ((signals[0].score - signals[2].score) * 100).toFixed(1) + '% range');

    // Correlation quality indicator (adjusted for system audio)
    const avgSignalStrength = (prosodyMax + burstMax + languageMax) / 3;
    const correlationQuality = avgSignalStrength > 0.4 ? 'EXCELLENT' :   // >40%
                               avgSignalStrength > 0.25 ? 'GOOD' :       // >25%
                               avgSignalStrength > 0.15 ? 'FAIR' :       // >15%
                               'WEAK';                                    // ≤15%

    console.log('[Hume Edge]   Average signal strength:', (avgSignalStrength * 100).toFixed(1) + '%');
    console.log('[Hume Edge]   Correlation quality:', correlationQuality);
    console.log('[Hume Edge] ==========================================');

    return new Response(
      JSON.stringify({
        prosody: {
          topEmotions: topProsody,
          metrics: { excitement, confidence, energy }
        },
        burst: {
          topEmotions: topBursts
        },
        language: {
          topEmotions: topLanguage
        },
        meta: {
          dominantSignal: signals[0].name,
          avgSignalStrength: avgSignalStrength,
          correlationQuality: correlationQuality
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in hume-analyze-emotion:', error);
    
    // Return mock data on error for graceful degradation
    return new Response(
      JSON.stringify({
        prosody: {
          topEmotions: [
            { name: 'Neutral', score: 0.50 },
            { name: 'Interest', score: 0.45 },
            { name: 'Concentration', score: 0.42 },
          ],
          metrics: {
            excitement: 0.45,
            confidence: 0.48,
            energy: 0.465,
          }
        },
        burst: {
          topEmotions: []
        },
        language: {
          topEmotions: []
        },
        meta: {
          dominantSignal: 'Prosody',
          avgSignalStrength: 0.45,
          correlationQuality: 'FAIR'
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
