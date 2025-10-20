import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Zap, Eye, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TranscriptViewerEvent {
  id: string;
  viewer_count: number;
  viewer_trend: 'up' | 'down' | 'flat';
  transcript_segment: string;
  tone_label?: string;
  timestamp: string;
}

export const SessionRecap = () => {
  const [transcriptEvents, setTranscriptEvents] = useState<TranscriptViewerEvent[]>([]);
  const viewerHistory: Array<{ count: number; timestamp: number }> = [];
  const promptHistory: Array<{ id: string; text: string; ruleId: string }> = [];

  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('transcript_viewer_events')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);

      if (!error && data) {
        setTranscriptEvents(data.map(event => ({
          ...event,
          viewer_trend: event.viewer_trend as 'up' | 'down' | 'flat'
        })));
      }
    };

    fetchEvents();
  }, []);

  const chartData = viewerHistory.map((tick, index) => ({
    time: index * 5, // Every 5 seconds
    viewers: tick.count,
    timestamp: tick.timestamp
  }));

  const topPrompts = promptHistory
    .reduce((acc, prompt) => {
      const existing = acc.find(p => p.ruleId === prompt.ruleId);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ ...prompt, count: 1 });
      }
      return acc;
    }, [] as (typeof promptHistory[0] & { count: number })[])
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const avgViewers = chartData.length > 0
    ? Math.round(chartData.reduce((sum, d) => sum + d.viewers, 0) / chartData.length)
    : 0;

  const peakViewers = chartData.length > 0
    ? Math.max(...chartData.map(d => d.viewers))
    : 0;

  const totalSpikes = promptHistory.filter(p => p.text.includes('📈')).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Session Recap</h2>
        <p className="text-sm text-muted-foreground">
          Review your performance and top winning actions
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Peak Viewers</p>
              <p className="text-2xl font-bold">{peakViewers}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Zap className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Average Viewers</p>
              <p className="text-2xl font-bold">{avgViewers}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Spikes</p>
              <p className="text-2xl font-bold">{totalSpikes}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Viewer Timeline</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="time" 
                stroke="hsl(var(--muted-foreground))"
                label={{ value: 'Time (seconds)', position: 'insideBottom', offset: -5 }}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                label={{ value: 'Viewers', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px'
                }}
              />
              <ReferenceLine y={avgViewers} stroke="hsl(var(--primary))" strokeDasharray="3 3" label="Avg" />
              <Line 
                type="monotone" 
                dataKey="viewers" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No data yet. Start a session to see your viewer timeline.
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Top Winning Actions</h3>
        {topPrompts.length > 0 ? (
          <div className="space-y-3">
            {topPrompts.map((prompt, index) => (
              <div key={prompt.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Badge className="mt-1">{index + 1}</Badge>
                <div className="flex-1">
                  <p className="text-sm">{prompt.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggested {prompt.count} time{prompt.count > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            No suggestions yet. Start a session to get AI coaching prompts.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-4">Transcript-Viewer Correlations</h3>
        {transcriptEvents.length > 0 ? (
          <div className="space-y-3">
            {transcriptEvents.map((event) => (
              <div
                key={event.id}
                className={`p-4 rounded-lg border ${
                  event.viewer_trend === 'up'
                    ? 'bg-success/10 border-success/20'
                    : event.viewer_trend === 'down'
                    ? 'bg-destructive/10 border-destructive/20'
                    : 'bg-muted/50 border-border'
                }`}
              >
                <div className={`flex items-center gap-2 mb-2 font-bold ${
                  event.viewer_trend === 'up'
                    ? 'text-success'
                    : event.viewer_trend === 'down'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }`}>
                  <Eye className="h-5 w-5" />
                  {event.viewer_trend === 'up' && <ArrowUp className="h-4 w-4" />}
                  {event.viewer_trend === 'down' && <ArrowDown className="h-4 w-4" />}
                  <span className="text-lg">{event.viewer_count} viewers</span>
                </div>
                <p className="text-sm italic mb-2">"{event.transcript_segment}"</p>
                {event.tone_label && (
                  <p className="text-xs text-muted-foreground">
                    Tone: <span className="font-semibold capitalize">{event.tone_label}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            No transcript-viewer correlations yet. Start a session to see how your words affect viewer count.
          </p>
        )}
      </Card>
    </div>
  );
};
