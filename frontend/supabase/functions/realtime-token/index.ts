// Token Relay for Realtime Transcription Services
// Returns short-lived session tokens without exposing API keys to client

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { provider } = await req.json()
    
    console.log(`[Realtime Token] Requesting token for provider: ${provider}`)

    if (provider === 'deepgram') {
      return await getDeepgramToken()
    } else if (provider === 'assembly') {
      return await getAssemblyToken()
    } else {
      throw new Error(`Unknown provider: ${provider}. Only 'deepgram' and 'assembly' are supported.`)
    }
  } catch (error) {
    console.error('[Realtime Token] Error:', error)
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        message: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

async function getDeepgramToken() {
  const apiKey = Deno.env.get('DEEPGRAM_API_KEY')
  
  if (!apiKey) {
    throw new Error('DEEPGRAM_API_KEY not configured')
  }

  // For Deepgram, we can return the WebSocket URL with API key in header
  // Or use their temporary key API if available
  
  // Using direct connection approach:
  return new Response(
    JSON.stringify({
      status: 'ok',
      provider: 'deepgram',
      realtime_url: 'wss://api.deepgram.com/v1/listen',
      config: {
        model: 'nova-2',
        language: 'en',
        encoding: 'linear16',
        sample_rate: 24000,
        channels: 1,
        punctuate: true,
        interim_results: true
      },
      // NOTE: In production, use Deepgram's temporary key API
      // For now, we'll proxy through our edge function instead
      use_proxy: true,
      proxy_url: `wss://${Deno.env.get('SUPABASE_URL')?.replace('https://', '')}/functions/v1/deepgram-realtime`
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

async function getAssemblyToken() {
  const apiKey = Deno.env.get('ASSEMBLYAI_API_KEY')
  
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY not configured')
  }

  const trimmedKey = apiKey.trim()
  console.log('[Realtime Token] Fetching AssemblyAI v3 temporary token...')

  try {
    // AssemblyAI v3 requires expires_in_seconds <= 600
    const url = 'https://streaming.assemblyai.com/v3/token?expires_in_seconds=600'
    const tokenResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': trimmedKey,
        'Accept': 'application/json',
      }
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('[Realtime Token] v3 token failed:', tokenResponse.status, errorText)
      return new Response(
        JSON.stringify({
          status: 'error',
          provider: 'assembly',
          upstream: { status: tokenResponse.status, body: errorText },
          message: `AssemblyAI token failed: ${tokenResponse.status}`
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokenData = await tokenResponse.json()
    console.log('[Realtime Token] ✅ v3 token received')

    return new Response(
      JSON.stringify({
        status: 'ok',
        provider: 'assembly',
        realtime_url: `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&token=${tokenData.token}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Realtime Token] Error fetching v3 token:', error)
    return new Response(
      JSON.stringify({
        status: 'error',
        provider: 'assembly',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

async function getGoogleToken() {
  const apiKey = Deno.env.get('GOOGLE_CLOUD_SPEECH_KEY')
  
  if (!apiKey) {
    throw new Error('GOOGLE_CLOUD_SPEECH_KEY not configured')
  }

  // Google Cloud Speech uses API key in URL
  return new Response(
    JSON.stringify({
      status: 'ok',
      provider: 'google',
      realtime_url: `wss://speech.googleapis.com/v1/speech:streamingrecognize?key=${apiKey}`,
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 24000,
        languageCode: 'en-US'
      }
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}
