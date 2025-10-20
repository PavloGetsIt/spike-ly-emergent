import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Debug } from "@/services/debug";
import { Bug, Activity, AlertTriangle, Zap } from "lucide-react";

interface DebugEvent {
  t: number;
  gate: string;
  data: any;
}

interface FailureReason {
  reason: string;
  count: number;
}

export const DebuggerHUD = ({ onInjectDelta }: { onInjectDelta?: (delta: number) => void }) => {
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [failureReasons, setFailureReasons] = useState<FailureReason[]>([]);
  const [enabled, setEnabled] = useState(Debug.enabled);
  const [kpis, setKpis] = useState({
    segmentsPerMin: 0,
    viewerSamplesPerSec: 0,
    deltaHitRate: 0,
    medianSegToRender: 0
  });

  useEffect(() => {
    const handleDebugEvent = (e: Event) => {
      const evt = (e as CustomEvent).detail as DebugEvent;
      setEvents(prev => [...prev, evt].slice(-50));
      
      // Track failure reasons
      if (evt.gate === 'CORRELATED_FAIL') {
        setFailureReasons(prev => {
          const existing = prev.find(f => f.reason === evt.data.reason);
          if (existing) {
            return prev.map(f => 
              f.reason === evt.data.reason 
                ? { ...f, count: f.count + 1 }
                : f
            );
          }
          return [...prev, { reason: evt.data.reason, count: 1 }];
        });
      }
    };

    window.addEventListener("spikely:dbg", handleDebugEvent);
    
    // Calculate KPIs every 2 seconds
    const kpiInterval = setInterval(() => {
      calculateKPIs();
    }, 2000);

    return () => {
      window.removeEventListener("spikely:dbg", handleDebugEvent);
      clearInterval(kpiInterval);
    };
  }, []);

  const calculateKPIs = () => {
    const allEvents = Debug.getEvents();
    const now = Date.now();
    const oneMinAgo = now - 60000;
    const oneSecAgo = now - 1000;

    // Segments per minute
    const segmentsInLastMin = allEvents.filter(
      e => e.gate === 'SEGMENT_BUILT' && e.t > oneMinAgo
    ).length;

    // Viewer samples per second
    const samplesInLastSec = allEvents.filter(
      e => e.gate === 'VIEWER_SAMPLE' && e.t > oneSecAgo
    ).length;

    // Delta hit rate
    const deltas = allEvents.filter(e => e.gate === 'DELTA_DETECTED');
    const correlated = allEvents.filter(e => e.gate === 'CORRELATED');
    const hitRate = deltas.length > 0 ? (correlated.length / deltas.length) * 100 : 0;

    // Median seg→render latency
    const latencies = allEvents
      .filter(e => e.gate === 'LATENCY' && e.data.segToDelta !== undefined)
      .map(e => e.data.segToDelta)
      .sort((a, b) => a - b);
    const median = latencies.length > 0 
      ? latencies[Math.floor(latencies.length / 2)] 
      : 0;

    setKpis({
      segmentsPerMin: segmentsInLastMin,
      viewerSamplesPerSec: samplesInLastSec,
      deltaHitRate: Math.round(hitRate),
      medianSegToRender: Math.round(median)
    });
  };

  const toggleDebug = (checked: boolean) => {
    Debug.setEnabled(checked);
    setEnabled(checked);
  };

  const clearEvents = () => {
    Debug.clear();
    setEvents([]);
    setFailureReasons([]);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const time = date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit'
    });
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${time}.${ms}`;
  };

  const getGateColor = (gate: string) => {
    if (gate === 'CORRELATED') return 'bg-green-500/10 text-green-400 border-green-500/30';
    if (gate === 'CORRELATED_FAIL') return 'bg-red-500/10 text-red-400 border-red-500/30';
    if (gate === 'DELTA_DETECTED') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (gate === 'SEGMENT_BUILT') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <Card className="border-2 border-warning/30 bg-card/95 backdrop-blur">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">Correlation Debugger</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="debug-toggle" className="text-xs cursor-pointer">Active</Label>
            <Switch 
              id="debug-toggle"
              checked={enabled}
              onCheckedChange={toggleDebug}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={clearEvents} className="h-7 text-xs">
            Clear
          </Button>
          {onInjectDelta && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onInjectDelta(7)}
                className="h-7 text-xs"
              >
                +7 Δ
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => onInjectDelta(-5)}
                className="h-7 text-xs"
              >
                -5 Δ
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="p-2 border-b bg-muted/30 grid grid-cols-4 gap-2 text-xs">
        <div className="text-center">
          <div className="text-muted-foreground">Seg/min</div>
          <div className="font-bold text-foreground">{kpis.segmentsPerMin}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">Samples/s</div>
          <div className="font-bold text-foreground">{kpis.viewerSamplesPerSec}</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">Hit Rate</div>
          <div className="font-bold text-foreground">{kpis.deltaHitRate}%</div>
        </div>
        <div className="text-center">
          <div className="text-muted-foreground">Seg→Render</div>
          <div className="font-bold text-foreground">{kpis.medianSegToRender}ms</div>
        </div>
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="timeline" className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="reasons" className="text-xs">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Failures ({failureReasons.reduce((sum, f) => sum + f.count, 0)})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-0">
          <ScrollArea className="h-48">
            <div className="p-2 space-y-1">
              {events.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <Zap className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p>Waiting for pipeline events...</p>
                </div>
              ) : (
                events.slice().reverse().map((evt, idx) => (
                  <div 
                    key={idx} 
                    className="text-xs p-2 rounded border bg-card/50 hover:bg-card transition-colors font-mono"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-muted-foreground text-[10px]">
                        {formatTime(evt.t)}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${getGateColor(evt.gate)}`}>
                        {evt.gate}
                      </Badge>
                    </div>
                    <div className="text-foreground/80 ml-2 break-all">
                      {JSON.stringify(evt.data, null, 0)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="reasons" className="mt-0">
          <ScrollArea className="h-48">
            <div className="p-3 space-y-2">
              {failureReasons.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <p>No correlation failures yet</p>
                </div>
              ) : (
                failureReasons
                  .sort((a, b) => b.count - a.count)
                  .map((failure, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-2 rounded border bg-card/50"
                    >
                      <span className="text-xs font-medium text-foreground">
                        {failure.reason}
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        {failure.count}
                      </Badge>
                    </div>
                  ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  );
};
