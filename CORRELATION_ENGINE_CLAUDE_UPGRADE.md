# Correlation Engine - Claude Sonnet 4.5 Upgrade

## Overview

Upgraded the correlation engine to generate tactical, actionable insights using Claude Sonnet 4.5 API.

---

## Changes Made

### 1. Claude API Key Added
**File:** `/app/frontend/supabase/.env`
- Added `ANTHROPIC_API_KEY` with your provided key
- Supabase edge function will use this key

### 2. Improved Prompt Engineering
**File:** `/app/frontend/supabase/functions/generate-insight/index.ts`

**New Prompt Focus:**
- 3-5 word tactical actions (what to do next 30 seconds)
- Emotional/tonal cues (how to deliver it)
- Positive framing (tell them what TO do, not what NOT to do)
- Specific topic references (gaming, makeup, cooking, etc.)
- Pattern-based advice (not generic suggestions)

**Insight Format:**
```json
{
  "emotionalLabel": "makeup demo spikes",
  "nextMove": "Show closeup. Stay excited"
}
```

**Examples:**
- Spike: `{"emotionalLabel": "gaming talk wins", "nextMove": "Ask about their setups. Stay hyped"}`
- Drop: `{"emotionalLabel": "tech rant dips", "nextMove": "Pivot to giveaway. Build excitement"}`
- Dump: `{"emotionalLabel": "complaining kills vibe", "nextMove": "Show product now. Go upbeat"}`

### 3. Enabled Extension AI
**File:** `/app/frontend/extension/correlationEngine.js`
- Changed `ENABLE_EXTENSION_AI = false` → `true`
- Increased timeout: 900ms → 1500ms (Claude needs more time)

### 4. Dynamic Threshold
**File:** `/app/frontend/extension/correlationEngine.js`
- AI calls now trigger based on user's **sensitivity slider** setting
- Changed from hardcoded `±15` to dynamic `this.minDelta`
- If user sets sensitivity to `±3`, insights trigger at ±3 viewer change
- If user sets sensitivity to `±10`, insights trigger at ±10 viewer change

---

## Data Flow (Confirmed)

### Input Data Sources:
1. ✅ **AssemblyAI Transcripts** → `addTranscript()` in correlationEngine
2. ✅ **Hume AI Prosody** → `addProsodyMetrics()` with:
   - Top emotions
   - Vocal bursts
   - Language emotions
   - Energy/excitement levels
3. ✅ **Live Viewer Count** → DOM tracking from TikTok/Twitch/etc.

### Processing Flow:
```
Every 20 seconds or when viewer delta >= minDelta:
  ↓
Aggregate data from last 20s window:
  - Transcript buffer (last 50 lines)
  - Prosody history (last 10 samples)
  - Viewer buffer (last 2000 samples)
  ↓
Call Supabase edge function: generate-insight
  ↓
Edge function calls Claude Sonnet 4.5 with improved prompt
  ↓
Claude returns tactical insight
  ↓
Display on blue card in side panel
```

---

## Insight Quality Improvements

### Before (Generic):
```
emotionalLabel: "positive"
nextMove: "Keep doing what you're doing"
```

### After (Tactical):
```
emotionalLabel: "makeup demo spikes"
nextMove: "Show closeup. Stay excited"
```

### Pattern Types:

**1. Spike Insights (viewers increasing):**
- Identifies WHAT worked (specific topic/action)
- Tells them to amplify it
- Includes energy/tone guidance

**2. Drop Insights (viewers decreasing):**
- Identifies what's losing traction
- Suggests specific pivot
- Provides constructive alternative

**3. Flatline Insights (viewers stable):**
- Suggests engagement drivers
- Prompts questions to ask viewers
- Creates movement opportunities

---

## Prompt Engineering Strategy

### Action Verbs Used:
- Ask (e.g., "Ask about their setups")
- Show (e.g., "Show product closeup")
- Talk about (e.g., "Talk about gaming more")
- Tease (e.g., "Tease giveaway now")
- Pivot to (e.g., "Pivot to story")

### Tonal Cues Used:
- Stay hyped
- Go vulnerable
- Build excitement
- Keep energy up
- Soften tone
- Be authentic
- Speed up
- Be direct
- Stay present

### Topic Categories:
- Gaming, makeup, cooking, fitness
- Story, chat, giveaway
- Product, tutorial, interaction

---

## Configuration

### Current Settings:
- **Insight Interval:** 20 seconds minimum between insights
- **AI Timeout:** 1500ms (1.5 seconds)
- **Trigger Threshold:** User-adjustable via sensitivity slider (±3 to ±15)
- **Model:** Claude Sonnet 4.5
- **Max Tokens:** 150 (keeps responses short)

### Adjustable Parameters:
- `minInsightInterval` in correlationEngine.js (currently 20000ms)
- `AI_MAX_LATENCY_MS` in correlationEngine.js (currently 1500ms)
- User's sensitivity slider (±1 to ±15)

---

## Next Steps for Deployment

### Required: Deploy Supabase Edge Function

The updated `generate-insight` function needs to be deployed to Supabase:

```bash
# Deploy from your local machine (not from this container)
cd /Users/thebusko/Documents/GitHub/spike-ly-emergent/frontend/supabase

supabase functions deploy generate-insight --project-ref hnvdovyiapkkjrxcxbrv
```

### Set Environment Variable in Supabase:

**Option A: Via Supabase Dashboard (Recommended)**
1. Go to: https://supabase.com/dashboard/project/hnvdovyiapkkjrxcxbrv
2. Settings → Edge Functions → Secrets
3. Add secret:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `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`

**Option B: Via CLI**
```bash
supabase secrets set ANTHROPIC_API_KEY=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 --project-ref hnvdovyiapkkjrxcxbrv
```

---

## Testing the Improved Insights

### Step 1: Deploy Edge Function
(See commands above)

### Step 2: Reload Extension
```
chrome://extensions/ → Spikely → Reload
```

### Step 3: Test on Live Stream
1. Open TikTok Live or any platform
2. Open Spikely side panel
3. Start audio capture
4. Wait for viewer count to change by ±sensitivity value

### Step 4: Check Console Logs
Look for:
```
🤖 CALLING CLAUDE API FOR INSIGHT (Extension)
🤖 Viewer Delta: +5
🤖 Transcript: "..."
✅ CLAUDE INSIGHT RECEIVED (Extension)
✅ Emotional Label: gaming talk wins
✅ Next Move: Ask about their setups. Stay hyped
```

### Step 5: Verify Blue Card Display
Insight card should show:
- Delta indicator: +5 or -3
- Emotional label: "gaming talk wins" (2-3 words)
- Next move: "Ask about their setups. Stay hyped" (3-5 words + tone)

---

## Expected Insight Examples

### Scenario 1: Streamer talks about makeup, viewers spike +12
```json
{
  "emotionalLabel": "makeup demo spikes",
  "nextMove": "Show closeup. Stay excited"
}
```

### Scenario 2: Streamer complains about tech, viewers drop -8
```json
{
  "emotionalLabel": "tech rant dips",
  "nextMove": "Pivot to giveaway. Build excitement"
}
```

### Scenario 3: Streamer tells story, viewers spike +20
```json
{
  "emotionalLabel": "story connects",
  "nextMove": "Ask their stories. Be authentic"
}
```

### Scenario 4: Slow pacing, viewers flatline
```json
{
  "emotionalLabel": "energy steady",
  "nextMove": "Ask where they're from. Create buzz"
}
```

---

## Troubleshooting

### If Insights Still Generic:
- Check console for `🤖 CALLING CLAUDE API` message
- If not appearing, threshold may be too high
- Lower sensitivity slider to ±3 to trigger more insights

### If Claude API Errors:
- Check Supabase dashboard for function logs
- Verify `ANTHROPIC_API_KEY` secret is set correctly
- Check if API key has sufficient credits

### If Insights Don't Update:
- Correlation engine may be in cooldown (20s between insights)
- Check console for `[AI:GATE] willCallAI: false`
- Viewer delta may be below threshold

---

## Performance Metrics

**Expected Latency:**
- Claude API call: 500-1200ms
- Total insight generation: <1500ms
- Fallback if timeout: Deterministic template

**Token Usage per Insight:**
- Input: ~400-600 tokens
- Output: ~50-80 tokens
- Cost: ~$0.006 per insight (Claude Sonnet 4.5)

**Insight Frequency:**
- Minimum 20 seconds between insights
- Triggered by viewer delta >= sensitivity threshold
- Average: 1-3 insights per minute during active stream

---

## Summary

✅ **Claude API integrated** with your provided key
✅ **Prompt engineering upgraded** for tactical, specific insights
✅ **Extension AI enabled** to call Claude on viewer changes
✅ **Dynamic thresholds** based on user's sensitivity setting
✅ **Data flow verified** - AssemblyAI + Hume AI + viewer tracking all feeding correlation engine

**Next:** Deploy the updated Supabase edge function and test on a live stream!
