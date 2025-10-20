import { supabase } from "@/integrations/supabase/client";
import { Debug } from "./debug";

interface TranscriptChunk {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
  timestamp: string;
}

export class SystemAudioService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private ws: WebSocket | null = null;
  private sessionId: string;
  private onTranscriptCallback: ((chunk: TranscriptChunk) => void) | null = null;
  private onAudioLevelCallback: ((level: number) => void) | null = null;
  private keepAliveInterval: number | null = null;
  private audioLevelInterval: number | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  setOnTranscript(callback: (chunk: TranscriptChunk) => void) {
    this.onTranscriptCallback = callback;
  }

  setOnAudioLevel(callback: (level: number) => void) {
    this.onAudioLevelCallback = callback;
  }

  async startCapture(screenStream: MediaStream): Promise<void> {
    try {
      // Extract audio from screen capture stream
      const audioTracks = screenStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('❌ No audio track found in screen capture.\n\n✅ To fix:\n1. Stop this session\n2. Click "Start Coaching Session" again\n3. In the browser dialog, check "Share tab audio" or "Share system audio"\n4. Select your livestream tab/window');
      }

      console.log('🎙️ System audio tracks found:', audioTracks.length);
      console.log('🎙️ Audio track settings:', audioTracks[0].getSettings());
      console.log('🎙️ Audio track state:', {
        enabled: audioTracks[0].enabled,
        muted: audioTracks[0].muted,
        readyState: audioTracks[0].readyState
      });
      
      // Create a new stream with just the audio
      this.stream = new MediaStream(audioTracks);

      // Set up audio context for processing
      this.audioContext = new AudioContext({
        sampleRate: 16000, // AssemblyAI requires 16kHz
      });

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      
      // Create analyser for visual feedback
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.source.connect(this.analyser);
      
      // Start monitoring audio levels
      this.startAudioLevelMonitoring();
      
      // Use ScriptProcessor for capturing audio chunks (will be replaced by AudioWorklet in future)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Connect to WebSocket
      await this.connectWebSocket();

      // Process audio and send to Deepgram
      this.processor.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Check for actual audio signal
        let hasSignal = false;
        for (let i = 0; i < inputData.length; i++) {
          if (Math.abs(inputData[i]) > 0.01) {
            hasSignal = true;
            break;
          }
        }
        
        if (!hasSignal) {
          // No audio signal detected - skip this buffer
          return;
        }
        
        // Send to Hume AI for prosody analysis (energy tracking)
        console.log('🎭 [Hume Debug] Forwarding audio chunk to Hume AI prosody service');
        import('./audioProsodyService').then(({ audioProsodyService }) => {
          audioProsodyService.addAudioChunk(inputData);
        });
        
        // Convert Float32Array to Int16Array (PCM16)
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send to AssemblyAI via WebSocket
        this.ws.send(int16Data.buffer);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      console.log('✅ System audio capture started');
      
      // Debug: Audio capture started
      Debug.emit('AUDIO_OK', {
        sampleRate: this.audioContext.sampleRate,
        tracks: audioTracks.length
      });

    } catch (error) {
      console.error('❌ Error starting system audio capture:', error);
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🔌 Fetching AssemblyAI token...');
        
        // Get token from Supabase edge function
        const tokenResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/realtime-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'assembly' })
        });
        
        if (!tokenResponse.ok) {
          throw new Error(`Token fetch failed: ${tokenResponse.status}`);
        }
        
        const tokenData = await tokenResponse.json();
        const wsUrl = tokenData.realtime_url;
        
        console.log('🔌 Connecting to AssemblyAI WebSocket...');
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected - Ready to stream audio to AssemblyAI');
          resolve();
        };

        this.ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // AssemblyAI v3 message format
            if (data.message_type === 'SessionBegins') {
              console.log('✅ AssemblyAI session started:', data.session_id);
              return;
            }
            
            if (data.message_type === 'SessionTerminated') {
              console.log('⚠️ AssemblyAI session terminated');
              return;
            }
            
            // Handle transcript messages (both partial and final)
            if (data.transcript) {
              const text = data.transcript.trim();
              if (!text) return;
              
              const isFinal = !!data.is_final;
              const confidence = data.confidence || 0;
              
              // ✅ CONSOLE LOG: Print transcript immediately
              console.log(`🎤 TRANSCRIPT [${isFinal ? 'FINAL' : 'interim'}]:`, text);
              console.log(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
              
              // Debug: STT line (final only)
              if (isFinal) {
                Debug.emit('STT_LINE', {
                  text,
                  conf: confidence,
                  t: Date.now()
                });
              }
              
              // Call callback for all transcripts (interim and final)
              if (this.onTranscriptCallback) {
                this.onTranscriptCallback({
                  transcript: text,
                  isFinal,
                  confidence,
                  timestamp: new Date().toISOString()
                });
              }

              // Send final transcripts to extension
              if (isFinal) {
                const { extensionService } = await import('./extensionService');
                if (extensionService.isConnected) {
                  extensionService.send('TRANSCRIPT', {
                    text,
                    confidence,
                    timestamp: new Date().toISOString()
                  });
                }
              }

              // Store final transcripts in database
              if (isFinal) {
                console.log('💾 Storing final transcript in DB');
                await this.storeTranscript({
                  transcript: text,
                  confidence,
                  isFinal: true,
                  timestamp: new Date().toISOString()
                });
              }
            }
          } catch (error) {
            console.error('❌ Error parsing WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket connection error:', error);
          console.error('💡 Please ensure ASSEMBLYAI_API_KEY is configured correctly');
          reject(error);
        };

        this.ws.onclose = (event) => {
          console.log('🔌 WebSocket closed:', event.code, event.reason || 'No reason provided');
          if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
          }
          
          // Auto-reconnect after 2 seconds if closed unexpectedly and stream is active
          if (event.code !== 1000 && this.stream && this.stream.active) {
            console.log('🔄 WebSocket dropped - reconnecting in 2 seconds...');
            setTimeout(() => {
              if (this.stream && this.stream.active) {
                console.log('🔄 Attempting reconnection...');
                this.connectWebSocket().catch(err => {
                  console.error('❌ Reconnection failed:', err);
                  // Try again after 5 seconds
                  setTimeout(() => {
                    if (this.stream && this.stream.active) {
                      this.connectWebSocket().catch(e => console.error('❌ Second reconnection failed:', e));
                    }
                  }, 5000);
                });
              }
            }, 2000);
          }
        };
      } catch (error) {
        console.error('❌ Failed to initialize AssemblyAI connection:', error);
        reject(error);
      }
    });
  }

  private startAudioLevelMonitoring() {
    if (!this.analyser || !this.onAudioLevelCallback) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    this.audioLevelInterval = window.setInterval(() => {
      if (!this.analyser) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate average amplitude (0-255)
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      
      // Normalize to 0-1 range
      const level = average / 255;
      
      if (this.onAudioLevelCallback) {
        this.onAudioLevelCallback(level);
      }

      // Send to extension
      import('./extensionService').then(({ extensionService }) => {
        if (extensionService.isConnected) {
          extensionService.send('AUDIO_LEVEL', { level });
        }
      });
      
      // Log when audio is detected
      if (level > 0.05) {
        console.log('🎵 Audio level:', (level * 100).toFixed(1) + '%');
      }
    }, 100); // Check 10 times per second
  }

  private async storeTranscript(data: any) {
    try {
      const { error } = await supabase.functions.invoke('store-transcript', {
        body: {
          session_id: this.sessionId,
          transcript: data.transcript,
          confidence: data.confidence || null,
          timestamp: data.timestamp,
        }
      });

      if (error) {
        console.error('Error storing transcript:', error);
      }
    } catch (error) {
      console.error('Error storing transcript:', error);
    }
  }

  stopCapture() {
    console.log('🛑 Stopping system audio capture');

    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }
}
