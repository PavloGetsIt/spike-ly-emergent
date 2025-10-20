import { Debug } from "./debug";

type Line = { t: number; text: string; conf?: number };

export type Segment = {
  t: number;
  text: string;
};

const MIN_CONF = 0.3;  // lowered for testing
const MIN_WORDS = 5;   // lowered for testing
const MAX_WORDS = 30;
const MAX_GAP_MS = 1500;

export function buildSegments(lines: Line[]): Segment[] {
  console.log('[SEGMENTER] Building segments from', lines.length, 'lines');
  const segs: Segment[] = [];
  let cur: { start: number; end: number; words: string[] } = { start: 0, end: 0, words: [] };

  const pushIfReady = () => {
    const text = clean(cur.words.join(" "));
    const wordCount = countWords(text);
    if (wordCount >= MIN_WORDS) {
      segs.push({ t: cur.end, text });
      
      // Debug: Segment built
      Debug.emit('SEGMENT_BUILT', {
        words: wordCount,
        tEnd: cur.end,
        text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
      });
    }
    cur = { start: 0, end: 0, words: [] };
  };

  for (const l of lines) {
    // Drop noise: low confidence or no word characters
    if ((l.conf !== undefined && l.conf < MIN_CONF) || !/\w/.test(l.text)) continue;
    
    if (!cur.start) cur.start = l.t;
    const gap = cur.end ? l.t - cur.end : 0;
    cur.end = l.t;
    cur.words.push(l.text);

    // Push segment if: large gap, reached max words, or sentence end
    if (gap > MAX_GAP_MS || countWords(cur.words.join(" ")) >= MAX_WORDS || /[.!?]$/.test(l.text.trim())) {
      pushIfReady();
    }
  }
  
  // Push remaining words if any
  if (cur.words.length) pushIfReady();
  
  return segs;
}

function clean(s: string): string {
  return s
    .replace(/\b(\w+)(,?\s+\1\b)+/gi, "$1")  // de-stutter: "I I I" → "I"
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function hashText(s: string): string {
  // Simple hash for caching
  return String(Math.abs(Array.from(s).reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)));
}
