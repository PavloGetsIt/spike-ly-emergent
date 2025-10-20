import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const googleCloudVisionApiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await req.json();

    if (!imageData) {
      return new Response(
        JSON.stringify({ error: 'No image data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling Google Cloud Vision API for viewer count extraction');

    // Extract base64 data from data URL
    const base64Data = imageData.split(',')[1];

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${googleCloudVisionApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data
            },
            features: [
              {
                type: 'TEXT_DETECTION',
                maxResults: 10
              }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Google Cloud Vision API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to process image with Google Cloud Vision' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('Google Cloud Vision raw response:', JSON.stringify(data, null, 2));
    
    // Extract text from the response
    const textAnnotations = data.responses?.[0]?.textAnnotations;
    if (!textAnnotations || textAnnotations.length === 0) {
      console.log('No text detected in image');
      return new Response(
        JSON.stringify({
          count: 0,
          rawText: '',
          confidence: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // The first annotation contains all detected text
    const fullText = textAnnotations[0].description || '';
    console.log('Full detected text:', fullText);

    // Look for viewer count patterns in the text
    // Pattern 1: "Viewers · 551", "Viewers - 106", or "Viewers 551"
    // Pattern 2: Just numbers like "551", "1.2k", "3.5M"
    let count = 0;
    let rawText = '';

    console.log('🔍 Starting viewer count extraction...');
    console.log('📝 Text to parse:', fullText);
    
    // Normalize text: remove extra spaces and weird separators
    const normalizedText = fullText.replace(/\s+/g, ' ').trim();
    console.log('📝 Normalized text:', normalizedText);
    
    // Pattern 1: "Viewers" followed by number (with any separator including periods/spaces)
    // Now supports commas: 38,647 or 100,000
    const viewerMatch = normalizedText.match(/Viewers[·\s\-\.]*\s*([0-9]{1,3}(?:,?[0-9]{3})*\.?[0-9]*[kKmM]?)/i);
    console.log('🎯 Viewer pattern match result:', viewerMatch);
    
    if (viewerMatch) {
      rawText = viewerMatch[1];
      console.log('✅ Found viewer count with "Viewers" label:', rawText);
    } else {
      console.log('⚠️ No "Viewers" label found, trying fallback number match...');
      // Pattern 2: Just a number (supports commas: 1,234 or 38,647 or 100,000+)
      const numberMatch = normalizedText.match(/\b([1-9][0-9]{0,2}(?:,?[0-9]{3})*\.?[0-9]*[kKmM]?)\b/);
      console.log('🎯 Fallback number match result:', numberMatch);
      
      if (numberMatch) {
        rawText = numberMatch[1];
        console.log('✅ Found number via fallback:', rawText);
      } else {
        console.log('❌ No valid numbers found');
      }
    }

    console.log('📊 Extracted viewer text:', rawText);

    // Parse the number with robust normalization
    console.log('🔢 Starting number parsing...');
    if (rawText) {
      // Step 1: Remove all commas, spaces, and non-alphanumeric chars except dots
      let cleaned = rawText.toLowerCase().replace(/[,\s]/g, '');
      console.log('🧹 Cleaned text (removed commas/spaces):', cleaned);
      
      // Step 2: Handle k/M conversion
      let multiplier = 1;
      if (cleaned.includes('k')) {
        multiplier = 1000;
        cleaned = cleaned.replace(/k/g, '');
        console.log('📊 Detected K format, multiplier = 1000');
      } else if (cleaned.includes('m')) {
        multiplier = 1000000;
        cleaned = cleaned.replace(/m/g, '');
        console.log('📊 Detected M format, multiplier = 1000000');
      }
      
      // Step 3: Parse the number
      const parsed = parseFloat(cleaned);
      console.log('🔢 Parsed float value:', parsed);
      
      // Step 4: Validate and reject nonsense
      if (isNaN(parsed)) {
        console.log('❌ Rejected: NaN value');
        count = 0;
      } else if (parsed < 0) {
        console.log('❌ Rejected: Negative value');
        count = 0;
      } else if (parsed * multiplier > 100000000) {
        console.log('❌ Rejected: Outlier (>100M viewers)');
        count = 0;
      } else {
        // Valid number - apply multiplier and floor
        count = Math.floor(parsed * multiplier);
        console.log(`✅ Valid viewer count: ${parsed} × ${multiplier} = ${count}`);
      }
    } else {
      console.log('❌ No raw text to parse');
    }

    console.log('🎉 Final parsed viewer count:', count);

    return new Response(
      JSON.stringify({
        count,
        rawText,
        confidence: textAnnotations[0].confidence ? Math.round(textAnnotations[0].confidence * 100) : 95
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in extract-viewer-count function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
