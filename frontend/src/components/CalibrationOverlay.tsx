import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { X, Save, RotateCcw, Scan, CheckCircle } from "lucide-react";
import { screenCaptureService } from "@/services/screenCaptureService";
import { calibrationService, CropSettings } from "@/services/calibrationService";
import { useToast } from "@/hooks/use-toast";

interface CalibrationOverlayProps {
  onSave: (settings: CropSettings) => void;
  onClose: () => void;
}

export const CalibrationOverlay = ({ onSave, onClose }: CalibrationOverlayProps) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const cropRef = useRef<CropSettings>({ x: 0, y: 5, width: 300, height: 60 });
  const [videoWidth, setVideoWidth] = useState(1920);
  const [videoHeight, setVideoHeight] = useState(1080);
  const [cropSettings, setCropSettings] = useState<CropSettings>({
    x: 0,
    y: 5,
    width: 300,
    height: 60
  });
  const [ocrResult, setOcrResult] = useState<{ count: number; rawText: string; confidence: number } | null>(null);
  const [isTestingOCR, setIsTestingOCR] = useState(false);

  useEffect(() => {
    // Initialize with video dimensions and load saved settings
    const videoElement = (screenCaptureService as any).videoElement;
    if (videoElement) {
      const vw = videoElement.videoWidth || 1920;
      const vh = videoElement.videoHeight || 1080;
      setVideoWidth(vw);
      setVideoHeight(vh);

      // Load saved settings or use defaults
      const saved = calibrationService.loadCropSettings();
      if (saved) {
        setCropSettings(saved);
      } else {
        setCropSettings(calibrationService.getDefaultSettings(vw, vh));
      }
    }

    // Start drawing loop
    const interval = setInterval(drawFrame, 100);
    return () => clearInterval(interval);
  }, []);

  // Sync crop ref and update preview instantly
  useEffect(() => {
    cropRef.current = cropSettings;
    screenCaptureService.setCropArea(cropSettings.x, cropSettings.y, cropSettings.width, cropSettings.height);
    drawCroppedPreview();
  }, [cropSettings]);

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const videoElement = (screenCaptureService as any).videoElement;
    
    if (!canvas || !videoElement) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    // Draw the video frame
    ctx.drawImage(videoElement, 0, 0);

    // Draw crop area overlay
    const s = cropRef.current;
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(s.x, s.y, s.width, s.height);

    // Draw semi-transparent fill
    ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
    ctx.fillRect(s.x, s.y, s.width, s.height);

    // Draw crop labels
    ctx.fillStyle = 'rgba(255, 0, 0, 1)';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`X: ${s.x}px`, s.x + 5, s.y + 20);
    ctx.fillText(`Y: ${s.y}px`, s.x + 5, s.y + 40);
    ctx.fillText(`W: ${s.width}px`, s.x + s.width - 100, s.y + 20);
    ctx.fillText(`H: ${s.height}px`, s.x + s.width - 100, s.y + 40);

    // Draw cropped preview
    drawCroppedPreview();
  };

  const drawCroppedPreview = () => {
    const previewCanvas = previewCanvasRef.current;
    const videoElement = (screenCaptureService as any).videoElement;
    
    if (!previewCanvas || !videoElement) return;

    const ctx = previewCanvas.getContext('2d');
    if (!ctx) return;

    const s = cropRef.current;
    previewCanvas.width = s.width;
    previewCanvas.height = s.height;

    ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    ctx.drawImage(
      videoElement,
      s.x,
      s.y,
      s.width,
      s.height,
      0,
      0,
      s.width,
      s.height
    );
  };

  const testOCR = async () => {
    setIsTestingOCR(true);
    try {
      screenCaptureService.setCropArea(cropSettings.x, cropSettings.y, cropSettings.width, cropSettings.height);
      
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('OCR test timeout')), 5000);
      });
      
      // Create OCR promise
      const ocrPromise = new Promise<void>((resolve) => {
        screenCaptureService.startOcrLoop((result) => {
          screenCaptureService.stopOcrLoop();
          setOcrResult(result);
          
          if (result.confidence < 70) {
            toast({
              title: "Low Confidence",
              description: `OCR detected "${result.rawText}" but confidence is ${Math.round(result.confidence)}%. Try adjusting the crop area.`,
              variant: "destructive"
            });
          } else {
            toast({
              title: "Test Successful",
              description: `Detected viewer count: ${result.count}`,
            });
          }
          resolve();
        });
      });
      
      // Race between OCR and timeout
      await Promise.race([ocrPromise, timeoutPromise]);
    } catch (error) {
      screenCaptureService.stopOcrLoop();
      toast({
        title: "Test Failed",
        description: error instanceof Error && error.message === 'OCR test timeout' 
          ? "OCR test timed out. Make sure screen capture is active."
          : "Could not extract viewer count. Adjust the crop area.",
        variant: "destructive"
      });
    } finally {
      setIsTestingOCR(false);
    }
  };

  const handleSave = () => {
    calibrationService.saveCropSettings(cropSettings);
    screenCaptureService.setCropArea(cropSettings.x, cropSettings.y, cropSettings.width, cropSettings.height);
    toast({
      title: "Settings Saved",
      description: "OCR calibration has been saved successfully",
    });
    onSave(cropSettings);
  };

  const handleReset = () => {
    const defaults = calibrationService.getDefaultSettings(videoWidth, videoHeight);
    setCropSettings(defaults);
    calibrationService.clearCropSettings();
    toast({
      title: "Reset to Defaults",
      description: "Calibration settings have been reset",
    });
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-xl z-50 overflow-auto">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="p-6 rounded-container border-2 border-primary/30 bg-card/20 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold">OCR Calibration</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Adjust the red box to capture the TikTok viewer count area
              </p>
            </div>
            <Button onClick={onClose} variant="ghost" size="icon" className="rounded-full">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Preview */}
          <Card className="lg:col-span-2 p-6 rounded-container border-2 border-primary/30 bg-card/20 backdrop-blur-xl">
            <h3 className="text-xl font-bold mb-4">Live Preview</h3>
            <div className="relative bg-background/50 rounded-lg overflow-hidden" style={{ aspectRatio: `${videoWidth}/${videoHeight}` }}>
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain"
              />
            </div>
          </Card>

          {/* Controls */}
          <Card className="p-6 rounded-container border-2 border-primary/30 bg-card/20 backdrop-blur-xl space-y-6">
            <div>
              <h3 className="text-xl font-bold mb-4">Crop Settings</h3>
              
              {/* X Position */}
              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium">X Position: {cropSettings.x}px</label>
                <Slider
                  value={[cropSettings.x]}
                  onValueChange={([x]) => setCropSettings({ ...cropSettings, x })}
                  min={0}
                  max={videoWidth - cropSettings.width}
                  step={1}
                />
              </div>

              {/* Y Position */}
              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium">Y Position: {cropSettings.y}px</label>
                <Slider
                  value={[cropSettings.y]}
                  onValueChange={([y]) => setCropSettings({ ...cropSettings, y })}
                  min={0}
                  max={videoHeight - cropSettings.height}
                  step={1}
                />
              </div>

              {/* Width */}
              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium">Width: {cropSettings.width}px</label>
                <Slider
                  value={[cropSettings.width]}
                  onValueChange={([width]) => setCropSettings({ ...cropSettings, width })}
                  min={50}
                  max={videoWidth - cropSettings.x}
                  step={1}
                />
              </div>

              {/* Height */}
              <div className="space-y-2 mb-4">
                <label className="text-sm font-medium">Height: {cropSettings.height}px</label>
                <Slider
                  value={[cropSettings.height]}
                  onValueChange={([height]) => setCropSettings({ ...cropSettings, height })}
                  min={20}
                  max={videoHeight - cropSettings.y}
                  step={1}
                />
              </div>
            </div>

            {/* Cropped Preview */}
            <div>
              <h3 className="text-sm font-bold mb-2">Cropped Region</h3>
              <div className="bg-background/50 rounded-lg p-2 mb-4">
                <canvas
                  ref={previewCanvasRef}
                  className="w-full border-2 border-primary/30 rounded"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            {/* OCR Results - Compact */}
            {ocrResult && (
              <div className="flex items-center justify-between p-2 bg-card/10 border border-primary/30 rounded-lg">
                <div className="flex items-center gap-2">
                  {ocrResult.confidence > 70 && (
                    <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium">Count: {ocrResult.count}</span>
                </div>
                <Badge 
                  variant={ocrResult.confidence > 70 ? "default" : "destructive"}
                  className="text-xs h-5"
                >
                  {Math.round(ocrResult.confidence)}%
                </Badge>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button 
                onClick={testOCR} 
                className="w-full rounded-full"
                disabled={isTestingOCR}
                variant="outline"
              >
                <Scan className="h-4 w-4 mr-2" />
                {isTestingOCR ? 'Testing...' : 'Test OCR'}
              </Button>
              
              <Button 
                onClick={handleSave} 
                className="w-full rounded-full"
              >
                <Save className="h-4 w-4 mr-2" />
                Save & Continue
              </Button>
              
              <Button 
                onClick={handleReset} 
                className="w-full rounded-full"
                variant="secondary"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Defaults
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
