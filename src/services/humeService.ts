import { supabase } from "@/integrations/supabase/client";
import { hashText } from "./segmenter";

type ToneResult = {
  emotion: string;
  score: number;
  confidence: number;
};

type QueueItem = {
  text: string;
  t: number;
  callback: (result: ToneResult) => void;
};

const queue: QueueItem[] = [];
const cache = new Map<string, ToneResult>();
const MIN_TONE_SCORE = 0.6;
let isProcessing = false;

export function enqueueHumeAnalysis(
  text: string,
  t: number,
  callback: (result: ToneResult) => void
) {
  const key = hashText(text);
  
  // Return cached result immediately if available
  if (cache.has(key)) {
    const cached = cache.get(key)!;
    callback(cached);
    return;
  }

  // Add to queue
  queue.push({ text, t, callback });
  processQueue();
}

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  
  isProcessing = true;
  
  while (queue.length > 0) {
    const item = queue.shift()!;
    const key = hashText(item.text);
    
    // Check cache again in case it was added while waiting
    if (cache.has(key)) {
      item.callback(cache.get(key)!);
      continue;
    }

    try {
      const { data, error } = await supabase.functions.invoke('hume-analyze-text', {
        body: { text: item.text }
      });

      if (error) throw error;

      const result: ToneResult = {
        emotion: data.emotion || 'Neutral',
        score: data.score || 0,
        confidence: data.confidence || 0
      };

      // Mark as inconclusive if below threshold
      if (result.score < MIN_TONE_SCORE) {
        result.emotion = 'Inconclusive';
        result.score = 0;
      }

      cache.set(key, result);
      item.callback(result);

      // Rate limiting: wait 400ms between requests
      await new Promise(resolve => setTimeout(resolve, 400));
    } catch (error) {
      console.error('[HUME] Analysis failed:', error);
      const neutralResult: ToneResult = {
        emotion: 'Neutral',
        score: 0,
        confidence: 0
      };
      cache.set(key, neutralResult);
      item.callback(neutralResult);
    }
  }
  
  isProcessing = false;
}

export function resetHumeCache() {
  cache.clear();
  queue.length = 0;
  isProcessing = false;
}
