import { supabase } from "@/integrations/supabase/client";

export interface ProsodyMetrics {
  // Prosody (existing)
  excitement: number;
  confidence: number;
  energy: number;
  topEmotions: Array<{ name: string; score: number }>;
  
  // NEW: Vocal Bursts
  topBursts: Array<{ name: string; score: number }>;
  
  // NEW: Language Emotions
  topLanguageEmotions: Array<{ name: string; score: number }>;
  
  // NEW: Meta Quality
  dominantSignal: string;
  avgSignalStrength: number;
  correlationQuality: string;
  
  timestamp: number;
}

type ProsodyCallback = (metrics: ProsodyMetrics) => void;

class AudioProsodyService {
  private audioBuffer: Float32Array[] = [];
  private isProcessing = false;
  private callbacks: ProsodyCallback[] = [];
  private lastAnalysisTime = 0;
  private readonly ANALYSIS_INTERVAL = 2000; // Analyze every 2 seconds
  private readonly BUFFER_SIZE = 132300; // 3 seconds at 44.1kHz (improved signal quality)
  
  /**
   * Register a callback for prosody updates
   */
  onProsodyUpdate(callback: ProsodyCallback) {
    this.callbacks.push(callback);
  }

  /**
   * Buffer audio chunks for prosody analysis
   */
  addAudioChunk(chunk: Float32Array) {
    this.audioBuffer.push(new Float32Array(chunk));
    
    // Calculate total buffered samples
    const totalSamples = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
    
    console.log(`🎭 [Hume Debug] Audio chunk added: ${chunk.length} samples, total buffered: ${totalSamples}/${this.BUFFER_SIZE}`);
    
    // When we have enough audio and enough time has passed, analyze
    const now = Date.now();
    if (totalSamples >= this.BUFFER_SIZE && !this.isProcessing && (now - this.lastAnalysisTime) >= this.ANALYSIS_INTERVAL) {
      console.log('🎭 [Hume Debug] Buffer full - triggering analysis');
      this.analyzeBuffer();
    }
  }

  /**
   * Analyze buffered audio for emotional prosody
   */
  private async analyzeBuffer() {
    if (this.audioBuffer.length === 0 || this.isProcessing) return;
    
    this.isProcessing = true;
    this.lastAnalysisTime = Date.now();
    
    try {
      // Combine all chunks into a single array
      const totalLength = this.audioBuffer.reduce((sum, arr) => sum + arr.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      
      for (const chunk of this.audioBuffer) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Convert to base64 for API
      const base64Audio = this.float32ToBase64(combined);
      
      console.log('🎭 [Hume Debug] ==========================================');
      console.log('🎭 [Hume Debug] Sending audio to Hume AI Prosody Analysis');
      console.log('🎭 [Hume Debug] Audio length:', combined.length, 'samples');
      console.log('🎭 [Hume Debug] Duration:', (combined.length / 44100).toFixed(2), 'seconds');
      console.log('🎭 [Hume Debug] Base64 size:', base64Audio.length, 'chars');
      console.log('🎭 [Hume Debug] ==========================================');
      
      // Send to Hume AI for prosody analysis
      const { data, error } = await supabase.functions.invoke('hume-analyze-emotion', {
        body: { audio: base64Audio }
      });
      
      if (error) {
        console.error('🎭 [Hume Debug] ❌ Prosody analysis FAILED:', error);
      } else {
        console.log('🎭 [Hume Debug] ✅ Prosody analysis SUCCESS');
        console.log('🎭 [Hume Debug] Raw response:', JSON.stringify(data, null, 2));
        
        const metrics: ProsodyMetrics = {
          // Prosody
          excitement: data.prosody?.metrics?.excitement || 0,
          confidence: data.prosody?.metrics?.confidence || 0,
          energy: data.prosody?.metrics?.energy || 0,
          topEmotions: data.prosody?.topEmotions || [],
          
          // Burst
          topBursts: data.burst?.topEmotions || [],
          
          // Language
          topLanguageEmotions: data.language?.topEmotions || [],
          
          // Meta
          dominantSignal: data.meta?.dominantSignal || 'Unknown',
          avgSignalStrength: data.meta?.avgSignalStrength || 0,
          correlationQuality: data.meta?.correlationQuality || 'WEAK',
          
          timestamp: Date.now()
        };
        
        console.log('🎭 [Hume Debug] ==========================================');
        console.log('🎭 [Hume Debug] 📊 MULTI-SIGNAL PROSODY UPDATE');
        console.log('🎭 [Hume Debug] ==========================================');

        console.log('🎭 [Hume Debug] 🎤 PROSODY (Speech Tone):');
        console.log('🎭 [Hume Debug]   Excitement:', (metrics.excitement * 100).toFixed(1) + '%');
        console.log('🎭 [Hume Debug]   Confidence:', (metrics.confidence * 100).toFixed(1) + '%');
        console.log('🎭 [Hume Debug]   Energy:', (metrics.energy * 100).toFixed(1) + '%');
        metrics.topEmotions.slice(0, 3).forEach((e, i) => {
          console.log(`🎭 [Hume Debug]   ${i + 1}. ${e.name}: ${(e.score * 100).toFixed(1)}%`);
        });

        console.log('🎭 [Hume Debug] 💥 VOCAL BURSTS:');
        if (metrics.topBursts.length > 0) {
          metrics.topBursts.slice(0, 3).forEach((e, i) => {
            console.log(`🎭 [Hume Debug]   ${i + 1}. ${e.name}: ${(e.score * 100).toFixed(1)}%`);
          });
        } else {
          console.log('🎭 [Hume Debug]   (no bursts detected)');
        }

        console.log('🎭 [Hume Debug] 📝 LANGUAGE EMOTION:');
        if (metrics.topLanguageEmotions.length > 0) {
          metrics.topLanguageEmotions.slice(0, 3).forEach((e, i) => {
            console.log(`🎭 [Hume Debug]   ${i + 1}. ${e.name}: ${(e.score * 100).toFixed(1)}%`);
          });
        } else {
          console.log('🎭 [Hume Debug]   (no language data)');
        }

        console.log('🎭 [Hume Debug] ==========================================');
        console.log('🎭 [Hume Debug] 🎯 SIGNAL QUALITY:');
        console.log('🎭 [Hume Debug]   🏆 Dominant signal:', metrics.dominantSignal);
        console.log('🎭 [Hume Debug]   📊 Avg strength:', (metrics.avgSignalStrength * 100).toFixed(1) + '%');
        console.log('🎭 [Hume Debug]   ✅ Quality:', metrics.correlationQuality);
        console.log('🎭 [Hume Debug] ==========================================');
        
        // Notify all callbacks
        this.callbacks.forEach(cb => cb(metrics));
        console.log('🎭 [Hume Debug] Notified', this.callbacks.length, 'subscribers');
      }
      
      // Clear buffer after analysis
      this.audioBuffer = [];
      console.log('🎭 [Hume Debug] Audio buffer cleared, ready for next analysis');
      
    } catch (error) {
      console.error('❌ Prosody analysis error:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Convert Float32Array to base64 PCM16
   */
  private float32ToBase64(float32Array: Float32Array): string {
    // Convert to Int16Array (PCM16)
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    // Convert to base64
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    const chunkSize = 0x8000;
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    
    return btoa(binary);
  }

  /**
   * Reset the service
   */
  reset() {
    this.audioBuffer = [];
    this.isProcessing = false;
    this.callbacks = [];
    this.lastAnalysisTime = 0;
  }
}

export const audioProsodyService = new AudioProsodyService();
