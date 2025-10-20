import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, X, GripVertical, Mic, AlertCircle, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { type Insight, pushViewer, setThresholds } from "@/services/correlationService";
import { extensionService } from "@/services/extensionService";
import { SpikeSettings, getStoredThresholds, type SpikeThresholds } from "./SpikeSettings";

interface SpikePanelProps {
  viewerCount: number;
  viewerDelta: number;
  onClose: () => void;
  sessionId: string;
  audioLevel?: number;
  latestInsight: Insight | null;
  sessionDuration: number;
}

interface TranscriptLine {
  id: string;
  text: string;
  timestamp: Date;
  confidence?: number;
}

interface ActionItem {
  id: string;
  toneLabel: string;
  emoji: string;
  transcriptSnippet: string;
  fullTranscript: string;
  delta: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  timestamp: Date;
}

export const SpikePanel = ({
  viewerCount,
  viewerDelta,
  onClose,
  sessionId,
  audioLevel = 0,
  latestInsight,
  sessionDuration
}: SpikePanelProps) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [transcriptCollapsed, setTranscriptCollapsed] = useState(false);
  const [lastTranscriptTime, setLastTranscriptTime] = useState<number>(Date.now());
  const [winningActions, setWinningActions] = useState<ActionItem[]>([]);
  const [losingActions, setLosingActions] = useState<ActionItem[]>([]);
  const [showFlash, setShowFlash] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // System Health State
  const [systemStatus, setSystemStatus] = useState<'IDLE' | 'OBSERVING' | 'ANALYZING' | 'READY'>('IDLE');
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0);
  const [lastViewerUpdate, setLastViewerUpdate] = useState<number>(Date.now());
  const [transcriptWordCount, setTranscriptWordCount] = useState<number>(0);

  // Initialize thresholds from localStorage
  useEffect(() => {
    const thresholds = getStoredThresholds();
    setThresholds(thresholds.minTrigger);
  }, []);

  const handleThresholdsChange = (thresholds: SpikeThresholds) => {
    setThresholds(thresholds.minTrigger);
    
    // Notify extension via WebSocket
    extensionService.send('THRESHOLD_UPDATE', { thresholds });
  };

  const getSystemStatusConfig = () => {
    const configs = {
      IDLE: { emoji: '🔴', text: 'IDLE', color: 'text-red-500' },
      OBSERVING: { emoji: '🟡', text: 'OBSERVING', color: 'text-yellow-500' },
      ANALYZING: { emoji: '🟢', text: 'ANALYZING', color: 'text-green-500' },
      READY: { emoji: '🔵', text: 'READY', color: 'text-blue-500' }
    };
    return configs[systemStatus];
  };

  const getTimeSinceLastUpdate = () => {
    const seconds = Math.floor((Date.now() - lastViewerUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  // Helper: Select emoji based on emotion and delta
  const selectEmojiForTone = (emotion: string | undefined, delta: number): string => {
    if (delta > 0) {
      if (emotion?.toLowerCase().includes('joy')) return '😄';
      if (emotion?.toLowerCase().includes('excitement')) return '🤩';
      if (emotion?.toLowerCase().includes('interest')) return '✨';
      if (emotion?.toLowerCase().includes('admiration')) return '😊';
      return '⚡';
    }
    
    if (emotion?.toLowerCase().includes('boredom')) return '😴';
    if (emotion?.toLowerCase().includes('distress')) return '😰';
    if (emotion?.toLowerCase().includes('sadness')) return '😒';
    if (emotion?.toLowerCase().includes('confusion')) return '🤔';
    if (emotion?.toLowerCase().includes('disgust')) return '😣';
    return '⚠️';
  };

  // Helper: Truncate transcript
  const truncateTranscript = (text: string, maxChars: number): string => {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars).trim() + '...';
  };

  // Helper: Format duration in milliseconds
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 
      ? `${minutes}m ${remainingSeconds}s` 
      : `${remainingSeconds}s`;
  };

  // Helper: Format session duration in seconds
  const formatSessionTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Border flash on viewer change
  useEffect(() => {
    if (Math.abs(viewerDelta) > 0) {
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), 500);
      return () => clearTimeout(timer);
    }
  }, [viewerDelta]);

  // Update system status based on viewer activity
  useEffect(() => {
    setLastViewerUpdate(Date.now());
    const thresholds = getStoredThresholds();
    if (Math.abs(viewerDelta) >= thresholds.minTrigger) {
      setSystemStatus('ANALYZING');
    } else if (viewerDelta !== 0) {
      setSystemStatus('OBSERVING');
    }
  }, [viewerCount, viewerDelta]);

  // Handle insight generation and start cooldown
  useEffect(() => {
    if (latestInsight) {
      setCooldownRemaining(5);
      setSystemStatus('ANALYZING');
    }
  }, [latestInsight]);

  // When a session starts, immediately reflect OBSERVING so users see activity
  useEffect(() => {
    if (sessionDuration > 0 && systemStatus === 'IDLE') {
      setSystemStatus('OBSERVING');
    }
  }, [sessionDuration, systemStatus]);

  // Cooldown timer countdown
  useEffect(() => {
    if (cooldownRemaining <= 0) {
      setSystemStatus('READY');
      return;
    }
    
    const timer = setInterval(() => {
      setCooldownRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Calculate transcript word count
  useEffect(() => {
    const words = transcriptLines
      .slice(-10)
      .reduce((sum, line) => sum + line.text.split(' ').filter(w => w.length > 0).length, 0);
    setTranscriptWordCount(words);
  }, [transcriptLines]);

  // Update actions list when new insight arrives
  useEffect(() => {
    if (!latestInsight) return;
    
    const thresholds = getStoredThresholds();
    const meetsThreshold = Math.abs(latestInsight.delta) >= Math.min(thresholds.minSpike, thresholds.minDrop);
    
    if (!meetsThreshold) return;

    const action: ActionItem = {
      id: `${Date.now()}-${Math.random()}`,
      toneLabel: latestInsight.emotionalLabel || latestInsight.topic || 'content',
      emoji: selectEmojiForTone(latestInsight.emotion, latestInsight.delta),
      transcriptSnippet: truncateTranscript(latestInsight.text, 40),
      fullTranscript: latestInsight.text,
      delta: latestInsight.delta,
      startTime: new Date(latestInsight.t),
      endTime: new Date(),
      timestamp: new Date(latestInsight.t)
    };

    // Calculate duration (estimate based on correlation window)
    action.duration = action.endTime.getTime() - action.startTime.getTime();

    if (latestInsight.delta > 0) {
      setWinningActions(prev => 
        [...prev, action]
          .sort((a, b) => b.delta - a.delta)
          .slice(0, 10)
      );
    } else {
      setLosingActions(prev => 
        [...prev, action]
          .sort((a, b) => a.delta - b.delta)
          .slice(0, 10)
      );
    }
  }, [latestInsight]);

  // Subscribe to live transcripts
  useEffect(() => {
    if (!sessionId) return;

    const transcriptChannel = supabase
      .channel('live-transcripts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_transcripts',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const newTranscript = payload.new as any;
          const newLine: TranscriptLine = {
            id: newTranscript.id,
            text: newTranscript.transcript,
            timestamp: new Date(newTranscript.timestamp),
            confidence: newTranscript.confidence
          };
          
          setTranscriptLines(prev => [...prev, newLine].slice(-50)); // Keep last 50 lines
          setLastTranscriptTime(Date.now());
          
          // Auto-scroll to bottom
          setTimeout(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(transcriptChannel);
    };
  }, [sessionId]);


  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Check for stale transcripts (>10s)
  const isTranscriptStale = Date.now() - lastTranscriptTime > 10000;

  return (
    <TooltipProvider>
      <div
        className="fixed z-50"
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y}px`,
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Card className={cn(
          "w-[400px] border-2 shadow-lg transition-all duration-300",
          showFlash && viewerDelta > 0 && "border-green-500",
          showFlash && viewerDelta < 0 && "border-red-500"
        )}>
          {/* Header - Live Viewer Tracking */}
          <div 
            className="flex items-center justify-between p-4 pb-3 cursor-grab active:cursor-grabbing border-b"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-start text-left">
              <div className="flex items-center gap-2">
                  <Eye className={cn(
                    "h-5 w-5",
                    viewerDelta > 0 ? "text-green-500" : viewerDelta < 0 ? "text-red-500" : "text-foreground/80"
                  )} />
                  <span className={cn(
                    "text-lg font-bold",
                    viewerDelta > 0 ? "text-green-500" : viewerDelta < 0 ? "text-red-500" : "text-foreground/80"
                  )}>
                    {viewerDelta > 0 ? '+' : ''}{viewerDelta}
                  </span>
                  <span className="text-2xl font-semibold text-foreground">{viewerCount}</span>
                </div>
                <p className="text-sm text-muted-foreground tracking-wide">Live viewer tracking</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold uppercase tracking-wide transition-all cursor-help",
                    systemStatus === 'IDLE' && "bg-red-500/10 animate-pulse",
                    systemStatus === 'OBSERVING' && "bg-yellow-500/10 animate-pulse",
                    systemStatus === 'ANALYZING' && "bg-green-500/10 animate-pulse",
                    systemStatus === 'READY' && "bg-blue-500/10"
                  )}>
                    <span className="text-xs">{getSystemStatusConfig().emoji}</span>
                    <span className={getSystemStatusConfig().color}>{getSystemStatusConfig().text}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">
                    {systemStatus === 'IDLE' && 'Waiting for session to start'}
                    {systemStatus === 'OBSERVING' && 'Monitoring viewer count and audio'}
                    {systemStatus === 'ANALYZING' && 'Processing correlation'}
                    {systemStatus === 'READY' && 'Ready for next insight'}
                  </p>
                </TooltipContent>
              </Tooltip>
              <div className="text-lg font-bold text-foreground tabular-nums">
                {formatSessionTime(sessionDuration)}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Live Transcription Section */}
          <Collapsible open={!transcriptCollapsed} onOpenChange={(open) => setTranscriptCollapsed(!open)} className="border-b">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-4 w-4 text-primary" />
                <Label className="text-sm font-semibold">
                  Live Transcription
                </Label>
                {audioLevel > 0.05 && !transcriptCollapsed && (
                  <div className="flex items-center gap-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                    <span className="text-xs text-success font-semibold">Audio detected</span>
                  </div>
                )}
                {isTranscriptStale && !transcriptCollapsed && audioLevel <= 0.05 && (
                  <AlertCircle className="h-4 w-4 text-warning" />
                )}
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                >
                  {transcriptCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent className="px-3 pb-3">
              {isTranscriptStale && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-warning/10 border border-warning/30 mb-2">
                  <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
                  <p className="text-xs text-warning">Waiting for audio input...</p>
                </div>
              )}
              <ScrollArea 
                ref={scrollRef}
                className="h-28 rounded-md border bg-background/50 p-2"
              >
                {transcriptLines.length > 0 ? (
                  <div className="space-y-1">
                    {transcriptLines.map((line, idx) => (
                      <div 
                        key={line.id} 
                        className={cn(
                          "text-xs animate-in fade-in slide-in-from-bottom-2 duration-300",
                          idx < transcriptLines.length - 3 && "opacity-70"
                        )}
                      >
                        <span className="text-muted-foreground font-mono text-[10px]">
                          {line.timestamp.toLocaleTimeString()}
                        </span>{' '}
                        <span className="text-foreground">{line.text}</span>
                        {line.confidence && line.confidence > 0 && (
                          <span className="text-muted-foreground ml-1 text-[10px]">
                            ({Math.round(line.confidence * 100)}%)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
                    <div className="text-center">
                      <Mic className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p>Listening for audio...</p>
                    </div>
                  </div>
                )}
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>

          {/* Next Move Section */}
          <div className="p-4 border-b">
            <div id="next-move-panel">
              {latestInsight ? (
                <div className="p-4 rounded-lg border bg-card space-y-2">
                  {/* Viewer delta with arrow icon and quality badge */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {latestInsight.delta > 0 ? (
                        <ArrowUp className="h-5 w-5 text-green-500" />
                      ) : (
                        <ArrowDown className="h-5 w-5 text-red-500" />
                      )}
                      <span className={cn(
                        "text-lg font-bold",
                        latestInsight.delta > 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {latestInsight.delta > 0 ? '+' : ''}{latestInsight.delta}
                      </span>
                      <span className="text-lg font-bold text-foreground">{viewerCount}</span>
                    </div>
                    
                    {/* Quality Indicator Badge */}
                    {latestInsight.correlationQuality && (
                      <Badge 
                        variant={
                          latestInsight.correlationQuality === 'EXCELLENT' || latestInsight.correlationQuality === 'GOOD' 
                            ? 'default' 
                            : latestInsight.correlationQuality === 'FAIR' 
                            ? 'secondary' 
                            : 'outline'
                        }
                        className={cn(
                          "text-[10px] h-5",
                          latestInsight.correlationQuality === 'EXCELLENT' && "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
                          latestInsight.correlationQuality === 'GOOD' && "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
                          latestInsight.correlationQuality === 'FAIR' && "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
                          latestInsight.correlationQuality === 'WEAK' && "bg-muted text-muted-foreground border-border"
                        )}
                      >
                        {latestInsight.correlationQuality === 'EXCELLENT' || latestInsight.correlationQuality === 'GOOD' 
                          ? '🟢 Hume AI' 
                          : latestInsight.correlationQuality === 'FAIR'
                          ? '🟡 Hume Partial'
                          : '🔴 Transcript Mode'
                        }
                      </Badge>
                    )}
                  </div>
                  
                  {/* Next move - big and bold */}
                  {latestInsight.nextMove && (
                    <p className="text-base font-semibold text-foreground leading-tight">
                      {latestInsight.nextMove}
                    </p>
                  )}
                  
                  {/* Transcript snippet */}
                  <p className="text-xs text-foreground/60 italic border-l-2 border-border pl-2 py-1">
                    "{truncateTranscript(latestInsight.text, 60)}"
                  </p>
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <div className="text-3xl mb-2">{systemStatus === 'IDLE' ? '⚪' : '🟡'}</div>
                  <p className="text-sm font-medium">{systemStatus === 'IDLE' ? 'Start session to begin' : 'Listening for viewer changes'}</p>
                  <p className="text-xs mt-1">{systemStatus === 'IDLE' ? 'Click Start Tracking' : 'Speak to generate insights'}</p>
                </div>
              )}
              
              {/* Cooldown Timer */}
              {cooldownRemaining > 0 && (
                <div className="text-center py-2 text-xs text-muted-foreground border-t border-border/50">
                  ⏱️ Next insight in {cooldownRemaining}s
                </div>
              )}
              {cooldownRemaining === 0 && latestInsight && (
                <div className="text-center py-2 text-xs text-muted-foreground border-t border-border/50">
                  🔍 Watching for changes...
                </div>
              )}
            </div>
          </div>

          {/* Top Winning / Losing Actions Section */}
          <div className="p-4 space-y-3">
            {/* Settings Toggle */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Top Actions</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
                className="h-7 text-xs"
              >
                {showSettings ? "Hide Settings" : "Settings"}
              </Button>
            </div>

            {(showSettings || !latestInsight) && (
              <>
                <SpikeSettings onThresholdsChange={handleThresholdsChange} />
                
                {/* System Health Panel */}
                <div className="mt-4 p-3 bg-card/30 rounded-lg border border-border/50">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    System Health
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">👁️ Viewer Tracking</span>
                      <span className="font-medium">{getTimeSinceLastUpdate()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">🎤 Transcript Buffer</span>
                      <span className="font-medium">{transcriptWordCount} words</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">🎭 Tone Analysis</span>
                      <span className="font-medium">{transcriptWordCount > 0 ? 'Active' : 'Waiting'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Top Winning Actions */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowUp className="h-3 w-3 text-green-500" />
                  <h3 className="text-xs font-semibold text-foreground">Top Winning</h3>
                </div>
                <ScrollArea className="h-40 rounded-md border border-green-500/30 bg-green-500/5">
                  {winningActions.length > 0 ? (
                    <div className="p-2 space-y-1.5">
                      {winningActions.map((action) => (
                        <Tooltip key={action.id}>
                          <TooltipTrigger asChild>
                            <div className="p-2 rounded hover:bg-accent transition-colors cursor-pointer space-y-0.5">
                              <div className="flex items-start justify-between gap-1">
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <span className="text-sm">{action.emoji}</span>
                                  <span className="text-xs font-medium text-foreground truncate">
                                    {action.toneLabel}
                                  </span>
                                </div>
                                <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs font-bold shrink-0">
                                  +{action.delta}
                                </Badge>
                              </div>
                              <p className="text-[10px] text-foreground/60 truncate pl-5">
                                {action.transcriptSnippet}
                              </p>
                              {action.startTime && action.endTime && (
                                <div className="text-[9px] text-muted-foreground pl-5 flex items-center gap-1">
                                  <span>{action.startTime.toLocaleTimeString()}</span>
                                  <span>→</span>
                                  <span>{action.endTime.toLocaleTimeString()}</span>
                                  {action.duration && (
                                    <span className="ml-1">({formatDuration(action.duration)})</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs font-semibold mb-1">{action.toneLabel}</p>
                            <p className="text-xs italic">"{action.fullTranscript}"</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {action.timestamp.toLocaleTimeString()}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-center p-3">
                      <div className="text-muted-foreground">
                        <p className="text-xs">No winning actions yet</p>
                        <p className="text-[10px] mt-1">Keep streaming!</p>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Top Losing Actions */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowDown className="h-3 w-3 text-red-500" />
                  <h3 className="text-xs font-semibold text-foreground">Top Losing</h3>
                </div>
                <ScrollArea className="h-40 rounded-md border border-red-500/30 bg-red-500/5">
                  {losingActions.length > 0 ? (
                    <div className="p-2 space-y-1.5">
                      {losingActions.map((action) => (
                        <Tooltip key={action.id}>
                          <TooltipTrigger asChild>
                            <div className="p-2 rounded hover:bg-accent transition-colors cursor-pointer space-y-0.5">
                              <div className="flex items-start justify-between gap-1">
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  <span className="text-sm">{action.emoji}</span>
                                  <span className="text-xs font-medium text-foreground truncate">
                                    {action.toneLabel}
                                  </span>
                                </div>
                                <Badge className="bg-red-500/20 text-red-500 border-red-500/30 text-xs font-bold shrink-0">
                                  {action.delta}
                                </Badge>
                              </div>
                              <p className="text-[10px] text-foreground/60 truncate pl-5">
                                {action.transcriptSnippet}
                              </p>
                              {action.startTime && action.endTime && (
                                <div className="text-[9px] text-muted-foreground pl-5 flex items-center gap-1">
                                  <span>{action.startTime.toLocaleTimeString()}</span>
                                  <span>→</span>
                                  <span>{action.endTime.toLocaleTimeString()}</span>
                                  {action.duration && (
                                    <span className="ml-1">({formatDuration(action.duration)})</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs font-semibold mb-1">{action.toneLabel}</p>
                            <p className="text-xs italic">"{action.fullTranscript}"</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {action.timestamp.toLocaleTimeString()}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-center p-3">
                      <div className="text-muted-foreground">
                        <p className="text-xs">No losing actions yet</p>
                        <p className="text-[10px] mt-1">Good job!</p>
                      </div>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </TooltipProvider>
  );
};
