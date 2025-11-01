// Offscreen document for audio capture (Manifest V3 requirement)
let audioContext = null;
let mediaStream = null;
let processor = null;
let source = null;
let wsConnection = null;
let isCapturing = false;
let keepAliveInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Hume AI buffering
let humeAudioBuffer = [];
let humeBufferSize = 32000; // 2 seconds at 16kHz
let lastHumeAnalysis = 0;
let humeAnalysisInterval = 5000; // Analyze every 5 seconds
let humeCooldownUntil = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_OFFSCREEN_CAPTURE') {
    startAudioCapture(message.streamId)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.type === 'STOP_OFFSCREEN_CAPTURE') {
    stopAudioCapture();
    sendResponse({ success: true });
  } else if (message.type === 'HUME_ANALYZE_FETCH') {
    // Perform the network fetch from the offscreen document to avoid MV3 SW HTTP/2 issues
    (async () => {
      try {
        const response = await fetch('https://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/hume-analyze-emotion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          body: JSON.stringify({ audio: message.audioBase64, sampleRate: 16000 })
        });
        if (response.status === 429) return sendResponse({ ok: false, reason: 'rate_limit' });
        if (response.status === 402) return sendResponse({ ok: false, reason: 'payment_required' });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          console.error('[Offscreen] Hume fetch non-OK:', response.status, text);
          return sendResponse({ ok: false, reason: 'api_error', message: `API error: ${response.status}` });
        }
        const result = await response.json();
        sendResponse({ ok: true, result });
      } catch (e) {
        console.error('[Offscreen] Hume fetch error:', e);
        sendResponse({ ok: false, reason: 'network_error', message: String(e) });
      }
    })();
    return true; // keep channel open for async
  }
});

async function startAudioCapture(streamId) {
  console.log('[Offscreen] Starting audio capture with stream ID:', streamId);
  
  try {
    // Get media stream using the stream ID
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    console.log('[Offscreen] ✅ Media stream obtained');

    // Set up AudioContext at 16kHz for AssemblyAI
    audioContext = new AudioContext({ sampleRate: 16000 });
    source = audioContext.createMediaStreamSource(mediaStream);

    // Create audio processor (2048 for lower latency)
    processor = audioContext.createScriptProcessor(2048, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!isCapturing) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = convertToPCM16(inputData);

      // Send to AssemblyAI
      if (wsConnection?.readyState === WebSocket.OPEN) {
        wsConnection.send(pcm16.buffer);
      }

      // Buffer for Hume AI
      humeAudioBuffer.push(...inputData);

      // Trigger Hume AI analysis when buffer is full
      const now = Date.now();
      if (humeAudioBuffer.length >= humeBufferSize &&
          now - lastHumeAnalysis >= humeAnalysisInterval &&
          now >= humeCooldownUntil) {
        sendToHumeAI(humeAudioBuffer.slice(0, humeBufferSize));
        humeAudioBuffer = humeAudioBuffer.slice(humeBufferSize);
        lastHumeAnalysis = now;
      }

      // Calculate audio level
      const level = calculateAudioLevel(inputData);

      // Send level to background
      chrome.runtime.sendMessage({
        type: 'AUDIO_LEVEL',
        level: level
      });
    };

    // Connect audio graph
    source.connect(processor);
    processor.connect(audioContext.destination);

    // Mark capture active before external connections complete
    isCapturing = true;

    // Kick off AssemblyAI connection in the background so callers don't block on it
    connectToAssemblyAI()
      .then(() => {
        console.log('[Offscreen] ✅ AssemblyAI streaming ready');
      })
      .catch((err) => {
        console.error('[Offscreen] ❌ AssemblyAI connection failed:', err);
        chrome.runtime.sendMessage({
          type: 'AUDIO_CAPTURE_RESULT',
          success: false,
          error: err?.message || String(err)
        });
        stopAudioCapture();
      });

    console.log('[Offscreen] ✅ Audio processing started');
  } catch (error) {
    console.error('[Offscreen] ❌ Error starting capture:', error);
    stopAudioCapture();
    throw error;
  }
}

function stopAudioCapture() {
  console.log('[Offscreen] Stopping audio capture');
  
  isCapturing = false;
  reconnectAttempts = 0;
  
  // Reset Hume buffers
  humeAudioBuffer = [];
  lastHumeAnalysis = 0;
  
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  
  if (source) {
    source.disconnect();
    source = null;
  }
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
  }
}

async function connectToAssemblyAI() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('[Offscreen] Fetching AssemblyAI token...');
      
      // Fetch token from realtime-token endpoint
      const tokenResponse = await fetch('https://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/realtime-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'assembly' })
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token fetch failed: ${tokenResponse.status}`);
      }

      const tokenData = await tokenResponse.json();
      console.log('[Offscreen] ✅ Token received');

      // Build WebSocket URL (token included by backend)
      const wsUrlBase = tokenData.url || tokenData.realtime_url || tokenData.websocket_url;
      if (!wsUrlBase) throw new Error('Token response missing websocket url');
      const wsUrl = wsUrlBase.includes('sample_rate=') ? wsUrlBase : `${wsUrlBase}${wsUrlBase.includes('?') ? '&' : '?'}sample_rate=16000`;
      console.log('[Offscreen] Connecting to AssemblyAI:', wsUrl);

      wsConnection = new WebSocket(wsUrl);
      wsConnection.binaryType = 'arraybuffer';

      wsConnection.onopen = () => {
        console.log('[Offscreen] ✅ Connected to AssemblyAI');
        reconnectAttempts = 0;
        resolve();
      };

      wsConnection.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // AssemblyAI message types: SessionBegins, PartialTranscript, FinalTranscript
          if (data.message_type === 'PartialTranscript' && data.text?.trim()) {
            console.log(`[Offscreen] 📝 PARTIAL: ${data.text}`);
            
            chrome.runtime.sendMessage({
              type: 'TRANSCRIPT',
              text: data.text,
              timestamp: Date.now(),
              confidence: data.confidence || 0.9,
              isFinal: false
            });
          } else if (data.message_type === 'FinalTranscript' && data.text?.trim()) {
            console.log(`[Offscreen] 📝 FINAL: ${data.text}`);
            
            chrome.runtime.sendMessage({
              type: 'TRANSCRIPT',
              text: data.text,
              timestamp: Date.now(),
              confidence: data.confidence || 0.95,
              isFinal: true
            });
          } else if (data.message_type === 'SessionBegins') {
            console.log('[Offscreen] 🎙️ AssemblyAI session started:', data.session_id);
          }
        } catch (error) {
          console.error('[Offscreen] Error parsing message:', error);
        }
      };

      wsConnection.onerror = (error) => {
        console.error('[Offscreen] WebSocket error:', error);
        reject(error);
      };

      wsConnection.onclose = (event) => {
        console.log('[Offscreen] WebSocket closed:', event.code, event.reason);
        
        // Auto-reconnect if still capturing and under max attempts
        if (isCapturing && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          const backoff = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
          console.log(`[Offscreen] Reconnecting in ${backoff}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
          
          setTimeout(() => {
            connectToAssemblyAI()
              .then(() => console.log('[Offscreen] ✅ Reconnected'))
              .catch(err => console.error('[Offscreen] ❌ Reconnect failed:', err));
          }, backoff);
        }
      };
    } catch (error) {
      console.error('[Offscreen] ❌ AssemblyAI connection failed:', error);
      reject(error);
    }
  });
}

function convertToPCM16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

function calculateAudioLevel(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1.0, rms * 10);
}

// Send audio to Hume AI for prosody analysis (via background gating)
async function sendToHumeAI(audioSamples) {
  try {
    console.log('[Offscreen] 🎭 Preparing audio for Hume AI...');
    
    // Convert Float32Array to base64 PCM16
    const int16 = new Int16Array(audioSamples.length);
    for (let i = 0; i < audioSamples.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, audioSamples[i] * 32768));
    }
    
    const uint8 = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Audio = btoa(binary);
    
    // Send to background for centralized gating
    chrome.runtime.sendMessage({
      type: 'HUME_ANALYZE',
      audioBase64: base64Audio
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Offscreen] sendMessage error:', chrome.runtime.lastError);
        return;
      }
      
      if (!response?.ok) {
        if (response?.reason === 'cooldown') {
          console.log('[Offscreen] Hume cooldown active');
        } else if (response?.reason === 'rate_limit') {
          console.warn('[Offscreen] Hume rate limited (429)');
          humeCooldownUntil = Date.now() + 10000; // Local 10s cooldown
        } else if (response?.reason === 'payment_required') {
          console.error('[Offscreen] Hume payment required (402)');
          humeCooldownUntil = Date.now() + 30000; // Local 30s cooldown
        } else {
          console.error('[Offscreen] Hume error:', response?.message);
          humeCooldownUntil = Date.now() + 5000; // Local 5s cooldown
        }
      } else {
        console.log('[Offscreen] ✅ Hume analysis accepted');
      }
    });
  } catch (error) {
    console.error('[Offscreen] ❌ Hume preparation error:', error);
    humeCooldownUntil = Date.now() + 5000;
  }
}
