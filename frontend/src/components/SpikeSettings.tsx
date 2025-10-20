import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Settings } from "lucide-react";

export interface SpikeThresholds {
  minTrigger: number;  // Minimum delta to trigger correlation analysis
  minSpike: number;    // Minimum positive change to count as spike
  minDrop: number;     // Minimum negative change to count as drop (absolute value)
  minDump: number;     // Minimum negative change to count as dump (absolute value)
}

const DEFAULT_THRESHOLDS: SpikeThresholds = {
  minTrigger: 10,
  minSpike: 5,
  minDrop: 3,
  minDump: 10
};

interface SpikeSettingsProps {
  onThresholdsChange: (thresholds: SpikeThresholds) => void;
}

export const SpikeSettings = ({ onThresholdsChange }: SpikeSettingsProps) => {
  const [thresholds, setThresholds] = useState<SpikeThresholds>(() => {
    const saved = localStorage.getItem('spikeThresholds');
    return saved ? JSON.parse(saved) : DEFAULT_THRESHOLDS;
  });

  useEffect(() => {
    localStorage.setItem('spikeThresholds', JSON.stringify(thresholds));
    onThresholdsChange(thresholds);
  }, [thresholds, onThresholdsChange]);

  const handleChange = (field: keyof SpikeThresholds, value: string) => {
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      setThresholds(prev => ({ ...prev, [field]: numValue }));
    }
  };

  return (
    <Card className="p-4 space-y-4 bg-card/50 border-border/50">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Viewer Spike Thresholds</h3>
      </div>
      
      <div className="space-y-3">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="minTrigger" className="text-xs">
              Minimum Trigger Delta
            </Label>
            <span className="text-xs text-muted-foreground font-mono">
              ±{thresholds.minTrigger}
            </span>
          </div>
          <Slider
            id="minTrigger"
            min={1}
            max={50}
            step={1}
            value={[thresholds.minTrigger]}
            onValueChange={(value) => handleChange('minTrigger', value[0].toString())}
            className="w-full"
          />
          <p className="text-[10px] text-muted-foreground">
            Triggers insights when viewers change by at least this amount
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minSpike" className="text-xs">
            Minimum Spike (positive change)
          </Label>
          <Input
            id="minSpike"
            type="number"
            min="1"
            value={thresholds.minSpike}
            onChange={(e) => handleChange('minSpike', e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minDrop" className="text-xs">
            Minimum Drop (negative change)
          </Label>
          <Input
            id="minDrop"
            type="number"
            min="1"
            value={thresholds.minDrop}
            onChange={(e) => handleChange('minDrop', e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="minDump" className="text-xs">
            Minimum Dump (large negative change)
          </Label>
          <Input
            id="minDump"
            type="number"
            min="1"
            value={thresholds.minDump}
            onChange={(e) => handleChange('minDump', e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setThresholds(DEFAULT_THRESHOLDS)}
        className="w-full text-xs"
      >
        Reset to Defaults
      </Button>
    </Card>
  );
};

export function getStoredThresholds(): SpikeThresholds {
  const saved = localStorage.getItem('spikeThresholds');
  return saved ? JSON.parse(saved) : DEFAULT_THRESHOLDS;
}
