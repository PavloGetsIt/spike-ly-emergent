export interface ViewerCountResult {
  count: number;
  rawText: string;
  confidence: number;
}

export class ScreenCaptureService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private cropArea: { x: number; y: number; width: number; height: number } | null = null;
  private readingsBuffer: number[] = [];
  private readonly BUFFER_SIZE = 5;
  private readonly OUTLIER_THRESHOLD = 4.0; // Allow 4x changes for live stream spikes
  private consecutiveOutliers = 0;
  
  // Animation frame OCR loop
  private animationFrameId: number | null = null;
  private lastFrameData: ImageData | null = null;
  private onViewerUpdate: ((result: ViewerCountResult) => void) | null = null;
  private isProcessing = false;
  private lastOcrTime = 0;
  private readonly MIN_OCR_INTERVAL = 150; // Max 6-7 OCR/sec for faster detection

  setCropArea(x: number, y: number, width: number, height: number) {
    this.cropArea = { x, y, width, height };
    console.log('Crop area updated:', this.cropArea);
  }

  getCropArea(): { x: number; y: number; width: number; height: number } | null {
    return this.cropArea;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }

  getVideoDimensions(): { width: number; height: number } | null {
    if (!this.videoElement) return null;
    return {
      width: this.videoElement.videoWidth,
      height: this.videoElement.videoHeight
    };
  }

  async startCapture(): Promise<MediaStream> {
    try {
      console.log('🎬 Requesting screen capture with system audio...');
      console.log('💡 Make sure to check "Share tab audio" or "Share system audio" in the browser dialog!');
      
      // Prepare an aggressive auto-refocus routine.
      const scheduleRefocusBursts = () => {
        const bursts = [0, 120, 240, 360, 500, 800, 1200, 1600, 2000, 2600, 3200, 4000, 5000, 6500, 8000];
        bursts.forEach((ms) => setTimeout(() => {
          if (document.hidden || !document.hasFocus()) {
            try { window.top?.focus?.(); } catch {}
            try { window.focus(); } catch {}
            try { parent?.focus?.(); } catch {}
            try { (window.opener as Window | null)?.focus?.(); } catch {}
          }
        }, ms));
      };

      // Optional: Clickable notification fallback
      const maybeShowReturnNotification = async () => {
        try {
          if ('Notification' in window) {
            if (Notification.permission === 'default') {
              await Notification.requestPermission();
            }
            if (Notification.permission === 'granted') {
              const n = new Notification('Return to Spikely', {
                body: 'Click to switch back to the editor after sharing.',
                tag: 'spikely-return'
              });
              n.onclick = () => {
                window.focus();
                window.top?.focus?.();
                n.close();
              };
              // Auto close after 8s
              setTimeout(() => n.close(), 8000);
            }
          }
        } catch {}
      };

      const onVisibilityChange = () => {
        if (document.hidden) {
          scheduleRefocusBursts();
          // Also provide a user-action path if auto-focus is blocked
          maybeShowReturnNotification();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });

      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          displaySurface: "browser", // Prefer tab capture
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: false
        },
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        surfaceSwitching: "include",
        systemAudio: "include"
      } as any);

      // Run our refocus routine immediately after capture resolves
      scheduleRefocusBursts();
      // And stop listening after a short window
      setTimeout(() => document.removeEventListener('visibilitychange', onVisibilityChange), 9000);

      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.stream;
      this.videoElement.autoplay = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      
      // Wait for video to load metadata
      await new Promise((resolve) => {
        if (this.videoElement) {
          this.videoElement.onloadedmetadata = resolve;
        }
      });

      // Ensure video is actually playing and has frames
      await this.videoElement.play();
      
      // Wait a bit for the first frame to be rendered
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check audio tracks
      const audioTracks = this.stream.getAudioTracks();
      console.log('🎙️ Audio tracks found:', audioTracks.length);
      if (audioTracks.length > 0) {
        console.log('✅ Audio track details:', {
          label: audioTracks[0].label,
          enabled: audioTracks[0].enabled,
          muted: audioTracks[0].muted,
          readyState: audioTracks[0].readyState,
        });
      } else {
        console.warn('⚠️ No audio tracks detected. User may not have enabled audio sharing.');
      }

      console.log('Screen capture started, video dimensions:', 
        this.videoElement.videoWidth, 'x', this.videoElement.videoHeight);

      return this.stream;
    } catch (error) {
      console.error('Screen capture error:', error);
      throw new Error('Failed to start screen capture');
    }
  }

  /**
   * Start animation frame loop with change detection
   */
  startOcrLoop(callback: (result: ViewerCountResult) => void) {
    this.onViewerUpdate = callback;
    this.runOcrLoop();
    console.log('🎬 OCR animation loop started');
  }

  /**
   * Stop animation frame loop
   */
  stopOcrLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.onViewerUpdate = null;
    this.lastFrameData = null;
    console.log('⏹️ OCR animation loop stopped');
  }

  /**
   * Animation frame loop with change detection
   */
  private runOcrLoop = () => {
    if (!this.videoElement || !this.stream) {
      this.animationFrameId = requestAnimationFrame(this.runOcrLoop);
      return;
    }

    // Capture and compare frame
    const changed = this.captureAndCompareFrame();
    
    // Run OCR only if pixels changed and enough time passed
    const now = Date.now();
    if (changed && !this.isProcessing && (now - this.lastOcrTime) >= this.MIN_OCR_INTERVAL) {
      this.isProcessing = true;
      this.lastOcrTime = now;
      
      this.performOcr()
        .then(result => {
          if (this.onViewerUpdate) {
            this.onViewerUpdate(result);
          }
        })
        .finally(() => {
          this.isProcessing = false;
        });
    }

    this.animationFrameId = requestAnimationFrame(this.runOcrLoop);
  };

  /**
   * Capture frame and detect changes
   */
  private captureAndCompareFrame(): boolean {
    if (!this.videoElement) {
      console.warn('⚠️ Video element not ready');
      return false;
    }

    // Check if video is actually playing
    if (this.videoElement.readyState < 2) {
      console.warn('⚠️ Video not ready, readyState:', this.videoElement.readyState);
      return false;
    }

    const cropArea = this.cropArea || {
      x: this.videoElement.videoWidth * 0.82,
      y: 5,
      width: this.videoElement.videoWidth * 0.17,
      height: 60
    };

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      console.log('🎨 Canvas created for OCR');
    }

    if (!this.ctx) {
      console.error('❌ Failed to get canvas context');
      return false;
    }

    this.canvas.width = cropArea.width;
    this.canvas.height = cropArea.height;

    // Draw cropped region
    this.ctx.drawImage(
      this.videoElement,
      cropArea.x, cropArea.y, cropArea.width, cropArea.height,
      0, 0, cropArea.width, cropArea.height
    );

    // Get current frame data
    const currentFrame = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    // Compare with last frame
    if (!this.lastFrameData) {
      this.lastFrameData = currentFrame;
      console.log('📷 First frame captured, running OCR');
      return true; // First frame - run OCR
    }

    const changed = this.hasFrameChanged(this.lastFrameData, currentFrame);
    if (changed) {
      console.log('🔄 Frame changed, running OCR');
    }
    this.lastFrameData = currentFrame;

    return changed;
  }

  /**
   * Fast pixel comparison (sample-based) - more sensitive for viewer count changes
   */
  private hasFrameChanged(prev: ImageData, curr: ImageData): boolean {
    const data1 = prev.data;
    const data2 = curr.data;
    const sampleRate = 5; // Check every 5th pixel for maximum sensitivity
    let diffCount = 0;
    const threshold = 15; // Very sensitive threshold
    const maxDiffs = 2; // Trigger OCR on minimal changes

    for (let i = 0; i < data1.length; i += 4 * sampleRate) {
      const r = Math.abs(data1[i] - data2[i]);
      const g = Math.abs(data1[i + 1] - data2[i + 1]);
      const b = Math.abs(data1[i + 2] - data2[i + 2]);
      
      if (r > threshold || g > threshold || b > threshold) {
        diffCount++;
        if (diffCount >= maxDiffs) return true;
      }
    }

    return false;
  }

  /**
   * Perform OCR on current canvas
   */
  private async performOcr(): Promise<ViewerCountResult> {
    if (!this.canvas || !this.ctx) {
      console.warn('⚠️ OCR called but canvas not ready');
      return { count: 0, rawText: '', confidence: 0 };
    }

    console.log('📸 Canvas size:', this.canvas.width, 'x', this.canvas.height);

    // Create a larger canvas for better OCR
    const targetWidth = 800;
    const targetHeight = Math.round((this.canvas.height / this.canvas.width) * targetWidth);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = targetWidth;
    tempCanvas.height = targetHeight;
    const tempCtx = tempCanvas.getContext('2d');

    if (!tempCtx) {
      return { count: 0, rawText: '', confidence: 0 };
    }

    // Scale up the captured frame with sharp rendering
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(this.canvas, 0, 0, targetWidth, targetHeight);

    // Apply minimal preprocessing - just contrast boost
    const imageData = tempCtx.getImageData(0, 0, targetWidth, targetHeight);
    const data = imageData.data;

    // Boost contrast to make text clearer
    const factor = 1.8;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, Math.max(0, ((data[i] - 128) * factor) + 128));
      data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - 128) * factor) + 128));
      data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - 128) * factor) + 128));
    }

    tempCtx.putImageData(imageData, 0, 0);
    const imageDataUrl = tempCanvas.toDataURL('image/png');
    
    console.log('🖼️ Sending image to OCR, size:', imageDataUrl.length, 'bytes');

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/extract-viewer-count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: imageDataUrl })
      });

      if (!response.ok) return { count: 0, rawText: '', confidence: 0 };

      const result = await response.json();
      const debouncedCount = this.debounceReading(result.count);

      console.log('👁️ OCR:', debouncedCount);

      return {
        count: debouncedCount,
        rawText: result.rawText,
        confidence: result.confidence
      };
    } catch (error) {
      return { count: 0, rawText: '', confidence: 0 };
    }
  }


  /**
   * Debounce OCR reading using sliding window with outlier detection
   */
  private debounceReading(newReading: number): number {
    // Need at least 3 readings for outlier detection
    if (this.readingsBuffer.length < 3) {
      this.readingsBuffer.push(newReading);
      console.log('🔄 Buffer warming up, using raw value');
      return newReading;
    }
    
    // Calculate median for outlier detection
    const sorted = [...this.readingsBuffer].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    // Check if new reading is an outlier
    const ratio = median === 0 ? (newReading === 0 ? 1 : 999) : newReading / median;
    const isOutlier = ratio < (1 / this.OUTLIER_THRESHOLD) || ratio > this.OUTLIER_THRESHOLD;
    
    if (isOutlier) {
      this.consecutiveOutliers++;
      console.log(`⚠️ Potential outlier: ${newReading} (ratio: ${ratio.toFixed(2)}x from median ${median}), consecutive: ${this.consecutiveOutliers}`);
      
      // If we see 3+ consecutive "outliers", it's likely a real change - reset buffer
      if (this.consecutiveOutliers >= 3) {
        console.log('🔄 Consecutive outliers detected - accepting as real change and resetting buffer');
        this.readingsBuffer = [newReading];
        this.consecutiveOutliers = 0;
        return newReading;
      }
      
      // Otherwise, reject the outlier and use median
      console.log('❌ Rejecting outlier, using median:', median);
      return median;
    }
    
    // Not an outlier - reset counter and add to buffer
    this.consecutiveOutliers = 0;
    this.readingsBuffer.push(newReading);
    
    // Keep only last N readings
    if (this.readingsBuffer.length > this.BUFFER_SIZE) {
      this.readingsBuffer.shift();
    }
    
    console.log('📈 Buffer:', this.readingsBuffer);
    
    // Average all readings in buffer
    const average = Math.round(
      this.readingsBuffer.reduce((sum, val) => sum + val, 0) / this.readingsBuffer.length
    );
    
    console.log('✅ Average:', average);
    
    return average;
  }

  stopCapture() {
    this.stopOcrLoop();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    this.readingsBuffer = [];
  }

  getPreviewFrame(): string | null {
    if (!this.canvas) return null;
    return this.canvas.toDataURL('image/png');
  }
}

export const screenCaptureService = new ScreenCaptureService();
