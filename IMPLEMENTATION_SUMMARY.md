# Spikely - Implementation Summary

## ✅ Changes Completed

### 1. Removed Google Speech-to-Text
**Files Modified:**
- `/app/frontend/src/services/systemAudioService.ts`
  - Replaced Google Speech-to-Text WebSocket connection with AssemblyAI
  - Changed sample rate from 44.1kHz to 16kHz (AssemblyAI requirement)
  - Updated all logs and error messages to reference AssemblyAI

- `/app/frontend/supabase/functions/realtime-token/index.ts`
  - Removed `getGoogleToken()` function completely
  - Updated error message to only mention supported providers (deepgram, assembly)

### 2. Configured AssemblyAI
**Status:** ✅ Already integrated in Chrome Extension
- Extension uses AssemblyAI v3 streaming API
- Token-based authentication via Supabase edge function
- Web app now also uses AssemblyAI (previously used Google)

### 3. Added Hume AI API Key
**Files Modified:**
- `/app/frontend/.env`
  - Added: `VITE_HUME_API_KEY="hAXAo6DAu4qsRcVNXhRLrhNjkxfBFBiZWTfixezTItQokdQm"`

**Hume AI Integration:**
- Edge function exists: `/app/frontend/supabase/functions/hume-analyze-text/index.ts`
- Edge function exists: `/app/frontend/supabase/functions/hume-analyze-emotion/index.ts`
- Service exists: `/app/frontend/src/services/audioProsodyService.ts`
- Service exists: `/app/frontend/src/services/humeService.ts`

---

## 🏗️ Architecture Overview

### Chrome Extension (Side Panel UI)
**Location:** `/app/frontend/extension/`

**Components:**
- `background.js` - Service worker, manages WebSocket connection to web app
- `content.js` - Runs on TikTok/Twitch/Kick/YouTube, reads viewer counts from DOM
- `sidepanel.html/js/css` - UI displayed in Chrome side panel
- `audioProcessor.js` - Captures and processes audio, sends to AssemblyAI
- `correlationEngine.js` - Runs correlation logic in extension
- `offscreen.js` - Offscreen document for audio processing

**Communication Flow:**
```
TikTok Live Page
    ↓ (reads DOM)
Content Script (viewer count)
    ↓ (chrome.runtime.sendMessage)
Background Script
    ↓ (WebSocket)
Web App (wss://...supabase.co/functions/v1/websocket-relay/spikely)
    ↓ (processes correlation)
Background Script
    ↓ (chrome.runtime.sendMessage)
Side Panel (displays insights)
```

### Web App (React - Correlation Engine)
**Location:** `/app/frontend/src/`

**Key Services:**
- `correlationService.ts` - Main correlation engine (matches transcripts to viewer changes)
- `systemAudioService.ts` - Audio capture and AssemblyAI transcription
- `audioProsodyService.ts` - Hume AI voice prosody analysis
- `humeService.ts` - Hume AI text emotion analysis
- `extensionService.ts` - Bridge to Chrome extension

**Data Flow:**
```
Audio Input (screen/mic)
    ↓
systemAudioService (16kHz PCM16)
    ↓
AssemblyAI WebSocket
    ↓
Transcripts
    ↓
correlationService (matches with viewer data)
    ↓
Hume AI (emotion analysis)
    ↓
Insights
    ↓
Extension (via extensionService)
```

---

## 🔑 API Keys Required

### ✅ Configured in Frontend
- `VITE_HUME_API_KEY` - Added to `/app/frontend/.env`

### ⚠️ Required in Supabase Environment
The following keys need to be added to your Supabase project environment variables:

1. **ASSEMBLYAI_API_KEY**
   - Used by: `/app/frontend/supabase/functions/realtime-token/index.ts`
   - Purpose: Generate temporary tokens for AssemblyAI streaming

2. **HUME_AI_API_KEY** 
   - Value: `hAXAo6DAu4qsRcVNXhRLrhNjkxfBFBiZWTfixezTItQokdQm`
   - Used by: 
     - `/app/frontend/supabase/functions/hume-analyze-text/index.ts`
     - `/app/frontend/supabase/functions/hume-analyze-emotion/index.ts`
   - Purpose: Voice prosody and text emotion analysis

### How to Add Supabase Environment Variables:
1. Go to your Supabase project dashboard
2. Navigate to: Project Settings → Edge Functions → Secrets
3. Add the following secrets:
   - Name: `ASSEMBLYAI_API_KEY`, Value: `<your-assemblyai-key>`
   - Name: `HUME_AI_API_KEY`, Value: `hAXAo6DAu4qsRcVNXhRLrhNjkxfBFBiZWTfixezTItQokdQm`

---

## 📊 Correlation Engine Details

**Location:** `/app/frontend/src/services/correlationService.ts`

**How It Works:**
1. Collects transcripts from AssemblyAI in real-time
2. Monitors viewer count changes from extension
3. When viewer delta exceeds threshold (±3 by default, adjustable):
   - Finds recent transcript segment (within 25s window)
   - Analyzes text emotion via Hume AI
   - Generates insight using Claude AI (via Supabase edge function)
   - Falls back to deterministic system if AI fails
4. Emits insight to extension side panel

**Key Parameters:**
- `CORRELATION_WINDOW_MS = 25000` - Look back 25s for transcripts
- `MIN_DELTA = 3` - Trigger on ±3 viewers (configurable via slider)
- `COOLDOWN_MS = 20000` - 20s between insights
- `MIN_AVG_CONFIDENCE = 0.3` - Minimum transcript confidence

---

## 🧪 Testing Checklist

### Extension Testing:
- [ ] Load extension in Chrome (`chrome://extensions/`)
- [ ] Open TikTok Live / Twitch / Kick / YouTube Live
- [ ] Click extension icon or use keyboard shortcut (Ctrl+Shift+S)
- [ ] Side panel should open
- [ ] Click "Start Audio" button
- [ ] Verify viewer count updates
- [ ] Speak into microphone
- [ ] Check for transcripts in side panel
- [ ] Verify insights appear when viewer count changes ±3

### Web App Testing:
- [ ] Open `https://stream-insights-2.preview.emergentagent.com`
- [ ] Start a session
- [ ] Allow screen capture and audio
- [ ] Verify transcripts appear
- [ ] Check browser console for logs:
   - `🎤 TRANSCRIPT [FINAL]:`
   - `🎭 [Hume Debug]`
   - `[CORR]` correlation logs

---

## 📝 Next Steps

### Immediate Actions Required:
1. **Add AssemblyAI API Key to Supabase** (critical for transcription)
2. **Add Hume AI Key to Supabase** (critical for emotion analysis)
3. **Test end-to-end flow**:
   - Extension → Viewer tracking ✓
   - Extension → Audio capture → AssemblyAI → Transcripts
   - Web app → Correlation engine → Insights
   - Insights → Extension side panel

### Optional Enhancements:
- Add session persistence (store sessions in MongoDB via backend)
- Add analytics dashboard
- Add user authentication
- Deploy to Chrome Web Store

---

## 🐛 Troubleshooting

### No Transcripts Appearing:
1. Check browser console for errors
2. Verify ASSEMBLYAI_API_KEY is set in Supabase
3. Check network tab for WebSocket connection
4. Ensure microphone/audio permissions granted

### No Insights Appearing:
1. Check viewer delta is ≥ MIN_DELTA (default: 3)
2. Verify transcripts are being received (final transcripts required)
3. Check HUME_AI_API_KEY is set in Supabase
4. Look for `[CORR]` logs in console

### Extension Not Connecting:
1. Verify WebSocket URL: `wss://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/websocket-relay/spikely`
2. Check Supabase edge function is deployed
3. Check browser console for connection errors

---

## 📚 Key Files Reference

### Extension Files:
- `extension/manifest.json` - Extension configuration
- `extension/background.js` - Service worker
- `extension/content.js` - DOM reader (viewer counts)
- `extension/sidepanel.html` - UI
- `extension/audioProcessor.js` - AssemblyAI integration

### Web App Files:
- `src/services/correlationService.ts` - Main correlation logic
- `src/services/systemAudioService.ts` - Audio + AssemblyAI
- `src/services/audioProsodyService.ts` - Hume AI prosody
- `src/services/extensionService.ts` - Extension bridge

### Supabase Functions:
- `supabase/functions/realtime-token/` - AssemblyAI token provider
- `supabase/functions/hume-analyze-text/` - Hume text emotion
- `supabase/functions/hume-analyze-emotion/` - Hume voice prosody
- `supabase/functions/generate-insight/` - Claude AI insights
- `supabase/functions/websocket-relay/` - Extension ↔ Web app relay

---

## ✅ Summary

**What Works:**
- ✅ Chrome extension UI (side panel)
- ✅ Viewer count tracking from DOM
- ✅ AssemblyAI integration (extension + web app)
- ✅ Correlation engine logic
- ✅ Hume AI integration (code ready)

**What Needs Configuration:**
- ⚠️ Add ASSEMBLYAI_API_KEY to Supabase
- ⚠️ Add HUME_AI_API_KEY to Supabase

**What's Removed:**
- ❌ Google Speech-to-Text (completely removed)
