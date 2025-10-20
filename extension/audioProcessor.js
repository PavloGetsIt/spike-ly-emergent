// Audio Processing Module - Converts MediaStream to PCM16 and sends to WebSocket
// Handles both AudioWorklet (preferred) and ScriptProcessor (fallback)

export class AudioProcessor {
  constructor() {
    this.audioContext = null;
    this.source = null;
    this.processor = null;
    this.workletNode = null;
    this.stream = null;
    this.ws = null;
    this.isProcessing = false;
    this.framesSent = 0;
    this.debugEnabled = true;
    this.debug = null;

    // Streaming chunking (AssemblyAI requires 50-1000ms per frame)
    this.chunkTargetMs = 100; // aim ~100ms
    this.sampleRate = 16000; // will be confirmed by AudioContext
    this.samplesPerChunk = Math.round(this.sampleRate * (this.chunkTargetMs / 1000));
    this.accumChunks = []; // array of Int16Array
    this.accumSamples = 0;
    
    // Hume AI buffering
    this.humeAudioBuffer = [];
    this.humeBufferSize = 32000; // 2 seconds at 16kHz
    this.lastHumeAnalysis = 0;
    this.humeAnalysisInterval = 5000; // Analyze every 5 seconds
    this.humeCooldownUntil = 0;
  }

  log(message, ...args) {
    if (this.debugEnabled) {
      console.log(`[Spikely AudioProcessor] ${message}`, ...args);
    }
  }

  error(message, ...args) {
    console.error(`[Spikely AudioProcessor] ❌ ${message}`, ...args);
  }

  // Initialize audio processing from a MediaStream
  async initialize(mediaStream, websocketUrl, debugCb) {
    console.log('🎙️ [ASSEMBLYAI v3] Starting audio processor initialization');
    console.log('🎙️ [ASSEMBLYAI v3] WebSocket URL:', websocketUrl);
    this.log('Initializing audio processor...');
    this.debug = typeof debugCb === 'function' ? debugCb : null;
    
    try {
      this.stream = mediaStream;
      
      // Check audio tracks
      const audioTracks = mediaStream.getAudioTracks();
      this.log(`Audio tracks: ${audioTracks.length}`);
      
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks in MediaStream');
      }

      // Log track settings
      const settings = audioTracks[0].getSettings();
      this.log('Audio settings:', JSON.stringify({
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        deviceId: settings.deviceId,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression
      }));

      // Create AudioContext at 16kHz (required for AssemblyAI v3)
      console.log('🎙️ [ASSEMBLYAI v3] Creating AudioContext at 16kHz');
      this.audioContext = new AudioContext({ 
        sampleRate: 16000,
        latencyHint: 'interactive'
      });
      this.sampleRate = this.audioContext.sampleRate;
      this.samplesPerChunk = Math.round(this.sampleRate * (this.chunkTargetMs / 1000));
      
      console.log(`🎙️ [ASSEMBLYAI v3] AudioContext created: ${this.audioContext.sampleRate}Hz`);
      this.log(`AudioContext created: sampleRate=${this.audioContext.sampleRate}Hz`);

      // Create source from stream
      this.source = this.audioContext.createMediaStreamSource(mediaStream);
      this.log('MediaStreamSource created');

      // Connect to WebSocket (v3 with token in URL)
      await this.connectWebSocket(websocketUrl);

      // Try AudioWorklet first, fallback to ScriptProcessor
      try {
        await this.setupAudioWorklet();
        this.log('✅ Using AudioWorklet (preferred)');
      } catch (err) {
        this.log('AudioWorklet not available, falling back to ScriptProcessor');
        this.setupScriptProcessor();
      }

      this.isProcessing = true;
      this.log('✅ Audio processing started');
      
      return { success: true };
    } catch (error) {
      this.error('Initialization failed:', error);
      this.stop();
      throw error;
    }
  }

  // Connect to WebSocket (v3 uses token in URL)
  async connectWebSocket(url) {
    return new Promise((resolve, reject) => {
      console.log('🎙️ [ASSEMBLYAI v3] Connecting to WebSocket...');
      console.log('🎙️ [ASSEMBLYAI v3] URL:', url);
      this.log(`Connecting WebSocket: ${url}`);
      
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      const timeout = setTimeout(() => {
        console.error('🎙️ [ASSEMBLYAI v3] ❌ Connection timeout');
        this.debug?.('ws_error', 'timeout');
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('🎙️ [ASSEMBLYAI v3] ✅ WebSocket OPEN - ready to stream');
        
        // V3 with token query param - no auth message needed
        
        this.debug?.('ws_open', 'v3:ready');
        this.log('✅ WebSocket connected (v3 Universal Streaming)');
        resolve();
      };

      this.ws.onerror = (error) => {
        clearTimeout(timeout);
        console.error('🎙️ [ASSEMBLYAI v3] ❌ WebSocket ERROR:', error);
        this.debug?.('ws_error', error.message || 'unknown');
        this.error('WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log(`🎙️ [ASSEMBLYAI v3] WebSocket CLOSED: code=${event.code}, reason=${event.reason || 'none'}`);
        this.debug?.('ws_closed', `code=${event.code}`);
        this.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
        if (this.isProcessing) {
          console.error('🎙️ [ASSEMBLYAI v3] ❌ Connection closed unexpectedly during processing');
          this.error('WebSocket closed unexpectedly during processing');
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('🎙️ [ASSEMBLYAI v3] WebSocket message:', data);
          
          // AssemblyAI v3 message types
          if (data.message_type === 'SessionBegins') {
            console.log(`🎙️ [ASSEMBLYAI v3] Session started: ${data.session_id}`);
            this.debug?.('ws_session', data.session_id);
            this.log(`[Spikely AudioProcessor] 🎙️ v3 session started: ${data.session_id}`);
          } else if (data.message_type === 'SessionTerminated') {
            console.log('🎙️ [ASSEMBLYAI v3] Session terminated:', data);
            this.log('Session terminated by server');
          } else if (data.transcript && data.transcript.trim()) {
            // AssemblyAI v3 streaming format: messages with 'transcript' field
            // end_of_turn: true means final, false means partial
            const isFinal = data.end_of_turn === true;
            const confidence = data.end_of_turn_confidence ?? (isFinal ? 0.95 : 0.9);
            
            console.log(`🎙️ [ASSEMBLYAI v3] ${isFinal ? 'FINAL' : 'PARTIAL'}: "${data.transcript}"`);
            this.debug?.(isFinal ? 'final' : 'partial', data.transcript);
            this.log(`[Spikely AudioProcessor] 📝 ${isFinal ? 'FINAL' : 'PARTIAL'}: ${data.transcript}`);
            
            chrome.runtime.sendMessage({
              type: 'TRANSCRIPT',
              text: data.transcript,
              timestamp: Date.now(),
              confidence: confidence,
              isFinal: isFinal
            }, () => { void chrome.runtime.lastError; });
          } else if (data.message_type) {
            console.log('🎙️ [ASSEMBLYAI v3] Other message type:', data.message_type);
          }
        } catch (err) {
          console.log('🎙️ [ASSEMBLYAI v3] Non-JSON message (binary frame)');
        }
      };
    });
  }

  // Setup AudioWorklet (preferred method)
  async setupAudioWorklet() {
    // Load AudioWorklet processor from standalone file (avoids CSP blob: issues)
    await this.audioContext.audioWorklet.addModule(chrome.runtime.getURL('pcm-processor.js'));

    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
    
    this.workletNode.port.onmessage = (event) => {
      // Buffer from worklet is typically ~8ms at 16kHz; we must batch to >=50ms
      const int16Array = new Int16Array(event.data);

      // Accumulate samples
      this.accumChunks.push(int16Array);
      this.accumSamples += int16Array.length;

      const samplesPerChunk = this.samplesPerChunk; // ~1600 for 100ms at 16kHz
      while (this.accumSamples >= samplesPerChunk) {
        // Assemble one chunk
        const chunk = new Int16Array(samplesPerChunk);
        let offset = 0;
        while (offset < samplesPerChunk && this.accumChunks.length > 0) {
          const head = this.accumChunks[0];
          const need = samplesPerChunk - offset;
          if (head.length <= need) {
            chunk.set(head, offset);
            offset += head.length;
            this.accumChunks.shift();
          } else {
            chunk.set(head.subarray(0, need), offset);
            this.accumChunks[0] = head.subarray(need);
            offset += need;
          }
        }
        this.accumSamples -= samplesPerChunk;

        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(chunk.buffer);
          this.framesSent++;
          if (this.framesSent % 50 === 0) {
            this.debug?.('audio_chunk_sent', `${this.framesSent} frames, ${chunk.byteLength} bytes (~${this.chunkTargetMs}ms)`);
          }
          if (this.framesSent % 100 === 0) {
            this.log(`Sent ${this.framesSent} audio frames (~${this.chunkTargetMs}ms each)`);
          }
        }
      }

      // Buffer for Hume AI (convert Int16 back to Float32)
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
      }
      
      this.humeAudioBuffer.push(...float32Array);
      
      // Trigger Hume AI analysis
      const now = Date.now();
      if (this.humeAudioBuffer.length >= this.humeBufferSize && 
          now - this.lastHumeAnalysis >= this.humeAnalysisInterval &&
          now >= this.humeCooldownUntil) {
        this.sendToHumeAI(this.humeAudioBuffer.slice(0, this.humeBufferSize));
        this.humeAudioBuffer = this.humeAudioBuffer.slice(this.humeBufferSize);
        this.lastHumeAnalysis = now;
      }
    };

    this.source.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  // Setup ScriptProcessor (fallback)
  setupScriptProcessor() {
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (event) => {
      if (!this.isProcessing) return;
      
      const inputData = event.inputBuffer.getChannelData(0);
      const pcm16 = this.floatTo16BitPCM(inputData);
      
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(pcm16.buffer);
        this.framesSent++;
        
        if (this.framesSent % 50 === 0) {
          this.debug?.('audio_chunk_sent', `${this.framesSent} frames, ${pcm16.byteLength} bytes`);
        }
        
        if (this.framesSent % 100 === 0) {
          this.log(`Sent ${this.framesSent} audio frames`);
        }
      }

      // Buffer for Hume AI
      this.humeAudioBuffer.push(...inputData);
      
      // Trigger Hume AI analysis
      const now = Date.now();
      if (this.humeAudioBuffer.length >= this.humeBufferSize && 
          now - this.lastHumeAnalysis >= this.humeAnalysisInterval &&
          now >= this.humeCooldownUntil) {
        this.sendToHumeAI(this.humeAudioBuffer.slice(0, this.humeBufferSize));
        this.humeAudioBuffer = this.humeAudioBuffer.slice(this.humeBufferSize);
        this.lastHumeAnalysis = now;
      }

      // Calculate and report audio level
      const level = this.calculateAudioLevel(inputData);
      if (this.framesSent % 10 === 0) { // Report every 10th frame
        chrome.runtime.sendMessage({
          type: 'AUDIO_LEVEL',
          level: level
        }, () => { void chrome.runtime.lastError; });
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  // Convert Float32 to Int16 PCM
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  // Calculate RMS audio level
  calculateAudioLevel(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    return Math.min(1.0, rms * 10);
  }

  // Send audio to Hume AI for prosody analysis (via background gating)
  async sendToHumeAI(audioSamples) {
    try {
      console.log('[AudioProcessor] 🎭 Preparing audio for Hume AI...');
      
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
          console.error('[AudioProcessor] sendMessage error:', chrome.runtime.lastError);
          return;
        }
        
        if (!response?.ok) {
          if (response?.reason === 'cooldown') {
            console.log('[AudioProcessor] Hume cooldown active');
          } else if (response?.reason === 'rate_limit') {
            console.warn('[AudioProcessor] Hume rate limited (429)');
            this.humeCooldownUntil = Date.now() + 10000; // Local 10s cooldown
          } else if (response?.reason === 'payment_required') {
            console.error('[AudioProcessor] Hume payment required (402)');
            this.humeCooldownUntil = Date.now() + 30000; // Local 30s cooldown
          } else {
            console.error('[AudioProcessor] Hume error:', response?.message);
            this.humeCooldownUntil = Date.now() + 5000; // Local 5s cooldown
          }
        } else {
          console.log('[AudioProcessor] ✅ Hume analysis accepted');
        }
      });
    } catch (error) {
      console.error('[AudioProcessor] ❌ Hume preparation error:', error);
      this.humeCooldownUntil = Date.now() + 5000;
    }
  }

  // Stop processing and cleanup
  stop() {
    this.log('Stopping audio processor...');
    
    this.isProcessing = false;
    
    // Reset Hume buffers
    this.humeAudioBuffer = [];
    this.lastHumeAnalysis = 0;

    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.log(`✅ Stopped. Total frames sent: ${this.framesSent}`);
    this.framesSent = 0;
  }

  // Print debug checklist
  printDebugChecklist() {
    this.log('=== AUDIO CAPTURE DEBUG CHECKLIST ===');
    this.log(`Audio tracks: ${this.stream?.getAudioTracks().length || 0}`);
    if (this.stream) {
      const track = this.stream.getAudioTracks()[0];
      if (track) {
        const settings = track.getSettings();
        this.log(`Settings: sampleRate=${settings.sampleRate}, channelCount=${settings.channelCount}, deviceId=${settings.deviceId}`);
      }
    }
    this.log(`AudioContext: sampleRate=${this.audioContext?.sampleRate || 'N/A'}Hz, state=${this.audioContext?.state || 'N/A'}`);
    this.log(`WebSocket: state=${this.ws?.readyState === WebSocket.OPEN ? 'OPEN' : this.ws?.readyState === WebSocket.CONNECTING ? 'CONNECTING' : 'CLOSED'}`);
    this.log(`Frames sent: ${this.framesSent}`);
    this.log(`Processing: ${this.isProcessing ? 'YES' : 'NO'}`);
    this.log('=====================================');
  }
}
