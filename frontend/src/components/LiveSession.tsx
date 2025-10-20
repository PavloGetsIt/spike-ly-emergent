import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Square, Monitor, Mic, Eye, AlertCircle } from "lucide-react";
import { SpikePanel } from "./SpikePanel";
import { CalibrationOverlay } from "./CalibrationOverlay";
import { screenCaptureService } from "@/services/screenCaptureService";
import { SystemAudioService } from "@/services/systemAudioService";
import { audioProsodyService, type ProsodyMetrics } from "@/services/audioProsodyService";
import { calibrationService, CropSettings } from "@/services/calibrationService";
import { pushTranscript, pushViewer, onInsight, reset as resetCorrelation, type Insight } from "@/services/correlationService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { detectBrowser } from "@/utils/browserDetection";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { extensionService } from "@/services/extensionService";

interface LiveSessionProps {
  onCalibrationChange: (isCalibrating: boolean) => void;
}

export const LiveSession = ({ onCalibrationChange }: LiveSessionProps) => {
  const [isActive, setIsActive] = useState(false);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [viewerDelta, setViewerDelta] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [systemAudioService, setSystemAudioService] = useState<SystemAudioService | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [prosodyMetrics, setProsodyMetrics] = useState<ProsodyMetrics | null>(null);
  const [hasSystemAudio, setHasSystemAudio] = useState(false);
  const [showBrowserDialog, setShowBrowserDialog] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [sessionId] = useState(`session_${Date.now()}`);
  const [insightsCount, setInsightsCount] = useState(0);
  const [latestInsight, setLatestInsight] = useState<Insight | null>(null);
  
  // Extension state
  const [useExtension, setUseExtension] = useState(false);
  const [extensionAvailable, setExtensionAvailable] = useState(false);
  const [currentPlatform, setCurrentPlatform] = useState<string>('');
  const { toast } = useToast();
  const browserInfo = detectBrowser();

  // Check if extension is available on mount
  useEffect(() => {
    if (isActive) return;
    
    // Check if extension is available (optional - don't block if not)
    const checkExtension = async () => {
      try {
        const available = await extensionService.isExtensionAvailable();
        setExtensionAvailable(available);
        
        if (available) {
          console.log('✅ Extension detected - attempting connection...');
          await extensionService.connect();
          const ready = await extensionService.awaitExtensionReady(2000); // 2s timeout
          if (ready) {
            console.log('✅ Extension ready');
            setUseExtension(true);
          } else {
            console.log('⚠️ Extension not ready, will use calibration mode');
            setUseExtension(false);
          }
        }
      } catch (error) {
        console.log('⚠️ Extension check failed, will use calibration mode:', error);
        setExtensionAvailable(false);
        setUseExtension(false);
      }
    };
    
    checkExtension();
  }, [isActive]);

  const handleStartClick = () => {
    console.log('🌐 Browser detected:', browserInfo.name);
    // Force calibration mode (extension disabled to avoid permission issues)
    startCalibration();
  };
  const startExtensionSession = async () => {
    setShowBrowserDialog(false);
    
    // Check if extension is connected first
    if (!extensionService.isConnected) {
      console.warn('Extension not connected, falling back to calibration');
      toast({
        title: "Extension Not Ready",
        description: "Falling back to screen capture mode.",
      });
      startCalibration();
      return;
    }
    
    try {
      // Request microphone for transcription
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Initialize session state and services
      setIsActive(true);
      setOverlayVisible(true);
      resetCorrelation();

      // Subscribe to correlation insights
      onInsight(insight => setLatestInsight(insight));

      // Start STT from microphone using SystemAudioService
      const { SystemAudioService } = await import('@/services/systemAudioService');
      const micAudioService = new SystemAudioService(sessionId);
      
      micAudioService.setOnTranscript((chunk) => {
        if (chunk.isFinal) {
          pushTranscript(chunk.transcript, chunk.confidence || 0);
        }
      });

      micAudioService.setOnAudioLevel((level) => {
        setAudioLevel(level);
      });

      await micAudioService.startCapture(micStream);

      // Subscribe to prosody updates
      audioProsodyService.onProsodyUpdate((metrics) => {
        console.log('🎭 [LiveSession] ==========================================');
        console.log('🎭 [LiveSession] 📊 PROSODY UPDATE RECEIVED');
        console.log('🎭 [LiveSession]   Excitement:', (metrics.excitement * 100).toFixed(1) + '%');
        console.log('🎭 [LiveSession]   Confidence:', (metrics.confidence * 100).toFixed(1) + '%');
        console.log('🎭 [LiveSession]   Energy:', (metrics.energy * 100).toFixed(1) + '%');
        console.log('🎭 [LiveSession]   Top Emotions:', metrics.topEmotions.map(e => e.name).join(', '));
        console.log('🎭 [LiveSession] 🔄 Updating state...');
        setProsodyMetrics(metrics);
        console.log('🎭 [LiveSession] ✅ State updated - UI will re-render');
        console.log('🎭 [LiveSession] ==========================================');
      });

      toast({
        title: "Extension Mode Active",
        description: "Viewer tracking via extension. Mic for transcripts."
      });
    } catch (error) {
      console.error('Extension session error:', error);
      setIsActive(false);
      toast({
        title: "Starting Calibration Instead",
        description: "Extension mode unavailable, using screen capture.",
      });
      startCalibration();
    }
  };

  const startCalibration = async () => {
    setShowBrowserDialog(false);
    try {
      const stream = await screenCaptureService.startCapture();

      // Check if audio tracks are present
      const audioTracks = stream.getAudioTracks();
      const audioDetected = audioTracks.length > 0;
      setHasSystemAudio(audioDetected);
      console.log('🎙️ System audio detected:', audioDetected);

      // Load saved crop settings
      const saved = calibrationService.loadCropSettings();
      const dimensions = screenCaptureService.getVideoDimensions();
      if (saved && dimensions) {
        screenCaptureService.setCropArea(saved.x, saved.y, saved.width, saved.height);
      } else if (dimensions) {
        const defaults = calibrationService.getDefaultSettings(dimensions.width, dimensions.height);
        screenCaptureService.setCropArea(defaults.x, defaults.y, defaults.width, defaults.height);
      }
      setCalibrationMode(true);
      onCalibrationChange(true);
      toast({
        title: "Calibration Mode",
        description: "Adjust the red box to match the viewer count area"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start calibration. Please allow screen access.",
        variant: "destructive"
      });
    }
  };
  const handleCalibrationSave = async (settings: CropSettings) => {
    setCalibrationMode(false);
    onCalibrationChange(false);
    try {
      // Subscribe to prosody updates
      audioProsodyService.onProsodyUpdate((metrics) => {
        console.log('🎭 [LiveSession] ==========================================');
        console.log('🎭 [LiveSession] 📊 PROSODY UPDATE RECEIVED (Calibration Mode)');
        console.log('🎭 [LiveSession]   Excitement:', (metrics.excitement * 100).toFixed(1) + '%');
        console.log('🎭 [LiveSession]   Confidence:', (metrics.confidence * 100).toFixed(1) + '%');
        console.log('🎭 [LiveSession]   Energy:', (metrics.energy * 100).toFixed(1) + '%');
        console.log('🎭 [LiveSession]   Top Emotions:', metrics.topEmotions.map(e => e.name).join(', '));
        console.log('🎭 [LiveSession] 🔄 Updating state...');
        setProsodyMetrics(metrics);
        console.log('🎭 [LiveSession] ✅ State updated - UI will re-render');
        console.log('🎭 [LiveSession] ==========================================');
      });

      // Get the screen stream and start system audio capture
      const videoElement = screenCaptureService.getVideoElement();
      if (videoElement && videoElement.srcObject) {
        const screenStream = videoElement.srcObject as MediaStream;

        // Create and start system audio service
        const audioService = new SystemAudioService(sessionId);
        audioService.setOnTranscript(chunk => {
          if (chunk.isFinal) {
            console.log('📝 Final transcript received:', chunk.transcript);
            setCurrentTranscript(chunk.transcript);
            pushTranscript(chunk.transcript, chunk.confidence);
          }
        });
        audioService.setOnAudioLevel(level => {
          setAudioLevel(level);
        });
        try {
          await audioService.startCapture(screenStream);
          setSystemAudioService(audioService);
          console.log('✅ System audio service started');
        } catch (audioError) {
          console.warn('System audio service failed:', audioError);
          toast({
            title: "Audio Capture Error",
            description: audioError instanceof Error ? audioError.message : "Failed to capture system audio",
            variant: "destructive"
          });
        }
      }
      setIsActive(true);
      setOverlayVisible(true);
      resetCorrelation();

      // Subscribe to correlation insights
      onInsight(insight => {
        setLatestInsight(insight);
      });

      // Show appropriate toast based on audio status
      if (hasSystemAudio) {
        toast({
          title: "✅ System Audio Connected",
          description: "Transcribing TikTok Live audio in real-time"
        });
      } else {
        const warningMsg = browserInfo.name === 'Brave' ? "No system audio detected. Make sure you selected 'Tab' and checked 'Share tab audio'. Lower Shields if needed." : browserInfo.name === 'Chrome' ? "No system audio detected. Select 'Chrome Tab' and check 'Share tab audio'." : "No system audio detected. Enable audio sharing in your browser.";
        toast({
          title: "⚠️ Using Microphone Only",
          description: warningMsg,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start audio capture. Please allow microphone access.",
        variant: "destructive"
      });
      screenCaptureService.stopCapture();
    }
  };
  const handleCalibrationClose = () => {
    setCalibrationMode(false);
    onCalibrationChange(false);
    screenCaptureService.stopCapture();
  };
  const stopSession = () => {
    screenCaptureService.stopCapture();
    audioProsodyService.reset();
    if (systemAudioService) {
      systemAudioService.stopCapture();
      setSystemAudioService(null);
    }
    setIsActive(false);
    toast({
      title: "Session Ended",
      description: `Monitored for ${Math.floor(sessionDuration / 60)} minutes`
    });
  };

  // Viewer tracking: Extension (100% accurate) OR OCR (fallback)
  useEffect(() => {
    if (!isActive) return;

    if (useExtension && extensionAvailable) {
      // EXTENSION MODE: 100% accurate DOM reading
      console.log('▶️ Starting EXTENSION-based viewer tracking (100% accuracy)');
      
      extensionService.connect();
      
      extensionService.onViewerCount((result) => {
        const newCount = result.count;
        if (newCount === 0) return;
        
        console.log(`👁️ Viewer (${result.platform}):`, newCount);
        setCurrentPlatform(result.platform);
        
        // Update correlation service and viewer count
        pushViewer(newCount);
        
        // Calculate delta from correlation service history
        setViewerCount(newCount);
      });

      // Listen for transcripts from extension
      extensionService.onTranscript(async (transcript) => {
        console.log('📝 Extension transcript received:', transcript.text, 'isFinal:', transcript.isFinal);
        
        // Always update current transcript
        setCurrentTranscript(transcript.text);
        pushTranscript(transcript.text, transcript.confidence);
        
        // Store ALL transcripts (both partial and final) in database for UI display
        try {
          console.log('📝 Storing transcript in database...');
          const { data, error } = await supabase.from('live_transcripts').insert({
            session_id: sessionId,
            transcript: transcript.text,
            timestamp: new Date(transcript.timestamp).toISOString(),
            confidence: transcript.confidence,
            viewer_count: viewerCount
          });
          
          if (error) {
            console.error('❌ Failed to store transcript:', error);
          } else {
            console.log('✅ Transcript stored successfully');
          }
        } catch (error) {
          console.error('❌ Exception storing transcript:', error);
        }
      });
      
      return () => {
        extensionService.disconnect();
        console.log('⏹️ Extension tracking stopped');
      };
    } else {
      // FALLBACK MODE: OCR (original method)
      console.log('▶️ Starting OCR-based viewer tracking (fallback)');
      
      screenCaptureService.startOcrLoop(viewerResult => {
        const newCount = viewerResult.count;
        if (newCount === 0) return; // Skip invalid readings
        
        console.log('👁️ Viewer (OCR):', newCount);
        
        // Update correlation service and viewer count
        pushViewer(newCount);
        setViewerCount(newCount);
      });
      
      return () => {
        screenCaptureService.stopOcrLoop();
        console.log('⏹️ OCR loop stopped');
      };
    }
  }, [isActive, useExtension, extensionAvailable]);

  // Session duration timer
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setSessionDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Track insights count with realtime updates
  useEffect(() => {
    if (!isActive) return;

    // Fetch initial count
    const fetchCount = async () => {
      const {
        count,
        error
      } = await supabase.from('transcript_viewer_events').select('*', {
        count: 'exact',
        head: true
      }).eq('session_id', sessionId);
      if (!error && count !== null) {
        setInsightsCount(count);
      }
    };
    fetchCount();

    // Subscribe to new events
    const channel = supabase.channel('insights-counter').on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'transcript_viewer_events',
      filter: `session_id=eq.${sessionId}`
    }, () => {
      setInsightsCount(prev => prev + 1);
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isActive, sessionId]);
  const detectKeywordsInTranscript = (transcript: string): string[] => {
    const keywords = ['instagram', 'follow', 'giveaway', 'comment', 'like', 'subscribe', 'truth', 'cap'];
    const lowerTranscript = transcript.toLowerCase();
    return keywords.filter(keyword => lowerTranscript.includes(keyword));
  };
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {!isActive ? (
        // Pre-Session: Clean Start Screen
        <Card className="p-12 border border-border bg-card text-center">
          <div className="max-w-md mx-auto space-y-6">
            <div>
              <h2 className="text-3xl font-bold mb-3">Ready to Spike Your Viewers?</h2>
              <p className="text-muted-foreground">
                Start tracking and get real-time AI insights on what increases your live viewers
              </p>
            </div>
            
            <Button onClick={handleStartClick} size="lg" className="w-full h-14 text-lg">
              <Play className="h-6 w-6 mr-2" />
              Start Spikely
            </Button>
          </div>
        </Card>
      ) : (
        // Active Session: Clean Dashboard
        <div className="space-y-6">
          {/* Live Viewer Tracking - Exact Format from Mission */}
          <Card className="p-6 border border-border bg-card">
            <div className="flex items-start gap-3">
              <Eye className="h-6 w-6 text-destructive mt-1" />
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold ${viewerDelta > 0 ? 'text-green-500' : viewerDelta < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {viewerDelta > 0 ? '+' : ''}{viewerDelta}
                </span>
                <span className="text-4xl font-semibold text-foreground">{viewerCount}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground tracking-wide mt-2 ml-9">
              Live viewer tracking
            </p>
          </Card>

          {/* Multi-Signal Energy Metrics from Hume AI */}
          {prosodyMetrics && (
            <div className="space-y-4">
              {/* Voice Energy Card with Signal Quality Indicator */}
              <Card className="p-6 border border-border bg-card relative">
                <div className="absolute top-2 right-2 flex items-center gap-2">
                  <div 
                    className={`w-2 h-2 rounded-full animate-pulse ${
                      prosodyMetrics.correlationQuality === 'EXCELLENT' ? 'bg-green-500' : 
                      prosodyMetrics.correlationQuality === 'GOOD' ? 'bg-blue-500' : 
                      prosodyMetrics.correlationQuality === 'FAIR' ? 'bg-yellow-500' : 
                      'bg-red-500'
                    }`}
                    title={`Signal Quality: ${prosodyMetrics.correlationQuality} (${(prosodyMetrics.avgSignalStrength * 100).toFixed(0)}%)`}
                  ></div>
                  <span className="text-xs text-muted-foreground">
                    {prosodyMetrics.dominantSignal}
                  </span>
                </div>
                
                <h3 className="text-lg font-semibold mb-3">Voice Energy</h3>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Excitement</p>
                    <p className="text-2xl font-bold text-green-500">
                      {(prosodyMetrics.excitement * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Confidence</p>
                    <p className="text-2xl font-bold text-blue-500">
                      {(prosodyMetrics.confidence * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Energy</p>
                    <p className="text-2xl font-bold text-orange-500">
                      {(prosodyMetrics.energy * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                {prosodyMetrics.topEmotions.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Top Emotions</p>
                    <div className="flex flex-wrap gap-2">
                      {prosodyMetrics.topEmotions.slice(0, 3).map((emotion, i) => (
                        <Badge key={i} variant="secondary">
                          {emotion.name} {(emotion.score * 100).toFixed(0)}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* NEW: Vocal Bursts Card */}
              {prosodyMetrics.topBursts.length > 0 && (
                <Card className="p-6 border border-border bg-card">
                  <h3 className="text-lg font-semibold mb-3">💥 Vocal Bursts Detected</h3>
                  <div className="space-y-2">
                    {prosodyMetrics.topBursts.slice(0, 3).map((burst, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-sm">{burst.name}</span>
                        <span className="text-sm font-semibold">{(burst.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* NEW: Language Emotion Card */}
              {prosodyMetrics.topLanguageEmotions.length > 0 && (
                <Card className="p-6 border border-border bg-card">
                  <h3 className="text-lg font-semibold mb-3">📝 Language Tone</h3>
                  <div className="space-y-2">
                    {prosodyMetrics.topLanguageEmotions.slice(0, 3).map((emotion, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <span className="text-sm">{emotion.name}</span>
                        <span className="text-sm font-semibold">{(emotion.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Latest AI Insight */}
          {latestInsight && (
            <Card className="p-6 border border-border bg-card">
              <h3 className="text-lg font-semibold mb-3">Latest Insight</h3>
              <p className="text-foreground leading-relaxed">
                {latestInsight.text}
              </p>
            </Card>
          )}

          {/* Spike Panel with Transcript & Top Actions */}
          {overlayVisible && (
            <SpikePanel 
              viewerCount={viewerCount} 
              viewerDelta={viewerDelta} 
              onClose={() => setOverlayVisible(false)} 
              sessionId={sessionId} 
              audioLevel={audioLevel} 
              latestInsight={latestInsight} 
              sessionDuration={sessionDuration} 
            />
          )}

          <div className="space-y-3">
            <Button onClick={stopSession} variant="destructive" size="lg" className="w-full">
              <Square className="h-5 w-5 mr-2" />
              End Session
            </Button>
          </div>
        </div>
      )}

      {calibrationMode && (
        <CalibrationOverlay 
          onSave={handleCalibrationSave} 
          onClose={handleCalibrationClose} 
        />
      )}

      <AlertDialog open={showBrowserDialog} onOpenChange={setShowBrowserDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {browserInfo.name === 'Brave' && '🦁'} 
              {browserInfo.name === 'Chrome' && '🌐'} 
              Enable System Audio for Best Results
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p className="font-semibold text-primary">
                ⚠️ CRITICAL: You must share system audio for live transcription!
              </p>
              <p className="font-semibold">
                You're using {browserInfo.name}. Follow these steps:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                {browserInfo.detailedInstructions.map((instruction, i) => <li key={i} className="text-foreground">{instruction}</li>)}
              </ol>
              <div className="p-3 rounded-md bg-warning/10 border border-warning/30">
                <p className="text-xs text-warning font-semibold">
                  📢 Make sure to check "Share tab audio" or "Share system audio" checkbox in the browser dialog!
                </p>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Without system audio, transcription will not work and you'll only see "Waiting for audio input..."
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowBrowserDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startCalibration}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};