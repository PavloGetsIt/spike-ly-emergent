# Spikely - Comprehensive Build Summary for Continuation

## Project Overview

**Spikely** is a Chrome extension + web app that provides real-time AI-powered tactical insights for live streamers. It combines transcription, emotional analysis, and live viewer tracking to generate specific, actionable micro-decisions that help streamers increase engagement and spike viewer counts.

**Tech Stack:**
- Frontend: Chrome Extension (Manifest V3) with vanilla JavaScript
- Backend: FastAPI (Python) running in Emergent environment
- AI Services: AssemblyAI (transcription), Hume AI (emotional analysis), Claude Sonnet 4.5 (tactical insights)
- Database: MongoDB
- Deployment: Emergent platform, Git-based deployment to local extension folder

**Extension Location:** `/Users/thebusko/Documents/GitHub/spike-ly-emergent/frontend/extension/`

---

## Architecture & Data Flow

### System Components:

```
Chrome Extension
├── sidepanel.html/js/css - User interface (blue card, countdown timer, controls)
├── background.js - Service worker, message routing, correlation engine
├── content.js - DOM scraping (viewer counts from TikTok/Twitch/YouTube/Kick)
├── correlationEngine.js - Core logic: aggregates data, triggers insights
├── audioProcessor.js - Audio capture and streaming to AssemblyAI
└── manifest.json - Extension configuration

FastAPI Backend (/app/backend/)
├── server.py - /api/generate-insight endpoint (calls Claude)
├── .env - ANTHROPIC_API_KEY=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
└── requirements.txt - anthropic library

Supabase Edge Functions (still in use for Hume AI)
├── hume-analyze-emotion/ - Hume AI prosody analysis
└── realtime-token/ - AssemblyAI token generation
```

### Complete Data Flow:

```
1. User clicks "Start Audio" in side panel
   ↓
2. System captures tab audio (microphone)
   ↓
3. Audio streams to AssemblyAI WebSocket → Real-time transcription
   ↓
4. Transcripts sent to Hume AI → Emotional analysis (prosody, bursts, language)
   ↓
5. Content script scrapes live viewer count from DOM
   ↓
6. Correlation Engine aggregates:
   - Last 20 seconds of transcripts
   - Last 10 prosody samples (Hume AI data)
   - Last 2000 viewer count samples
   ↓
7. Triggered by EITHER:
   a) Viewer delta ≥ sensitivity threshold (instant insight)
   b) 20-second timer expires (auto insight)
   ↓
8. Correlation Engine calls FastAPI: POST /api/generate-insight
   ↓
9. Backend calls Claude Sonnet 4.5 with aggregated data + tactical prompt
   ↓
10. Claude returns tactical insight (3-5 words + emotional cue)
    ↓
11. Backend returns to extension
    ↓
12. Insight displayed in blue card with 20-second countdown timer
    ↓
13. Timer resets, cycle repeats
```

---

## Features Successfully Implemented

### ✅ Phase 1: Priority One UI/UX Fixes

**Audio Button State Synchronization:**
- Initial state: "Start Audio" (green), "Audio: Stopped" (gray dot)
- Recording state: "Stop Audio" (red), "Audio: Recording" (red pulsing dot)
- Fixed multiple direct button manipulations to use centralized `updateAudioState()` function
- **Files:** sidepanel.js (updateAudioState function, 7 call sites fixed)

**Text Truncation & Tooltips:**
- Long transcripts truncated to 60 chars with "..."
- Hover shows full text in native tooltip
- Click expands/collapses text inline
- **Files:** sidepanel.js (addExpandableTooltip function)

**Animated Status Indicators:**
- CSS pulse animations for status dots
- Inline keyframes in HTML to prevent caching
- **Files:** sidepanel.html (inline <style>), sidepanel.css

**Delta Indicator Tooltips:**
- Hover tooltips for viewer delta (+5), count (360), threshold (±3)
- Color-coded: green (positive), red (negative), gray (zero)
- **Files:** sidepanel.js (updateViewerDeltaDisplay, setupTooltips)

**Timestamp Formatting:**
- Relative time: "just now", "5s ago", "2m ago"
- Auto-updates every 5 seconds
- **Files:** sidepanel.js (formatTimeAgo, startTimestampUpdater)

**CSS Cache Busting:**
- Added query strings to CSS/JS links
- Inline critical animations
- **Files:** sidepanel.html

### ✅ Phase 2: Branding

**Extension Identity:**
- Name: "Spikely"
- Description: "Real-time Live Stream Artificial Intelligence"
- Custom red eye logo created from user-provided image
- Icon sizes: 16px, 48px, 128px (PNG format)
- **Files:** manifest.json, icons/icon16.png, icons/icon48.png, icons/icon128.png

### ✅ Phase 3: Correlation Engine - Claude Integration

**Migration from Supabase to FastAPI:**
- Originally used Supabase edge function for insights
- Migrated to FastAPI backend for easier deployment (no external deployment needed)
- Endpoint: POST /api/generate-insight
- **URL:** https://stream-insights-2.preview.emergentagent.com/api/generate-insight
- **Files:** server.py, correlationEngine.js

**Claude Sonnet 4.5 Integration:**
- Model: claude-sonnet-4-20250514
- Library: anthropic (Python SDK)
- API Key: Stored in /app/backend/.env (NOT pushed to Git)
- **Files:** server.py (InsightRequest/Response models, generate_insight endpoint)

**Improved Prompt Engineering:**
- Format: 3-5 word tactical action + emotional/tonal cue
- Positive framing: Tell streamers what TO do, not what NOT to do
- Specific topics: gaming, makeup, cooking, fitness, story, chat, giveaway
- Action verbs: Ask, Show, Talk about, Tease, Reveal, Pivot to
- Tonal cues: Stay hyped, Go vulnerable, Build excitement, Keep energy up, Boost energy
- Examples:
  - Spike: "Ask about their setups. Stay hyped"
  - Drop: "Pivot to giveaway. Build excitement"
  - Dump: "Show product now. Go upbeat"
- **Files:** server.py (system_prompt variable)

**Dynamic Threshold:**
- Insights trigger when viewer delta ≥ sensitivity slider value
- Slider range: ±1 to ±200 (updated from ±15 for large TikTok streams)
- User-adjustable via UI slider
- Persists in chrome.storage.local
- **Files:** correlationEngine.js (minDelta property, setThresholds method)

**Enhanced Fallback:**
- Better topic-specific prompts when Claude fails or rate limited
- Improved from "Do more content talk" to "Double down gaming. Stay hyped"
- **Files:** server.py (except block in generate_insight)

### ✅ Phase 4: 20-Second Auto-Insight Timer

**Dual-Trigger System:**
1. **Delta-triggered:** Instant insight when viewer delta ≥ threshold
2. **Timer-triggered:** Insight every 20 seconds automatically
- Both work together - whichever triggers first
- Countdown resets after ANY insight
- **Files:** correlationEngine.js (startAutoInsightTimer, generateTimedInsight)

**Countdown Display:**
- Shows "Next insight in 20s" at top of blue card
- Decrements every second: 19s → 18s → 17s → 0s
- Resets to 20s after each insight
- Permanent, always-visible location (not hidden by status updates)
- **Files:** sidepanel.html (permanentCountdown div), sidepanel.js (updateCountdown, startCountdownInterval)

**Winning Action Reminders:**
- Tracks top 10 actions with +10 or more viewer gain
- When no data in 20s window: reminds of winning actions
- Example: "gaming worked. Try gaming again. Stay hyped"
- Fallback if no winning actions: "Keep engaging. Ask viewers a question"
- **Files:** correlationEngine.js (winningActions array, sendReminderInsight)

**Timer Lifecycle:**
- Starts: When audio capture begins (background.js line ~517)
- Stops: When audio stops or system resets
- **Files:** background.js (correlationEngine.startAutoInsightTimer call), correlationEngine.js (stopAutoInsightTimer in reset method)

### ✅ Phase 5: UI Cleanup

**Removed Distracting Status Messages:**
- Removed "Correlating...", "Collecting...", "Failed" UI elements
- Removed engine status spinner and badges
- Status logging preserved in console for debugging
- Clean, focused interface
- **Files:** sidepanel.html (removed engineStatus div)

---

## Major Debugging & Troubleshooting Sessions

### Issue 1: UI/UX Fixes Not Loading (Git/Deployment)

**Problem:** Initial Priority One fixes (tooltips, animations, audio state) weren't appearing in Chrome after deployment.

**Root Causes:**
1. Chrome loading from deployment location, not local files
2. Git conflicts preventing push to GitHub
3. Code changes in local files but not deployed

**Solutions:**
- Resolved Git conflicts (created branch vs. force push)
- Confirmed extension loads from: /Users/thebusko/Documents/GitHub/spike-ly-emergent/frontend/extension/
- Added version logging to confirm code loading
- Added alert() popup to definitively prove new code loads

**Key Learning:** Extension deployment requires Git push → sync to local folder → Chrome reload

### Issue 2: Audio Button State Not Updating

**Problem:** Audio button showed "Stop" (red) while status showed "Audio: Stopped" (gray dot). Status label and dot weren't updating.

**Root Cause:** Code was directly manipulating button text (`startAudioBtn.textContent = 'Stop'`) instead of calling `updateAudioState()` function, which updates button + label + dot together.

**Solution:** Replaced 7 instances of direct button manipulation with `updateAudioState(true/false)` calls.

**Locations fixed:**
- Main audio start success
- Audio start error handling
- Screen share fallback success
- Screen share fallback error
- Audio stop via tabCapture
- Full system reset
- Audio processor stop

**Files:** sidepanel.js

### Issue 3: Claude API 401 Errors

**Problem:** Original Claude API key returned "401 Unauthorized - invalid x-api-key"

**Attempted Solutions:**
1. Tried Emergent LLM Key (budget exceeded after 2 calls)
2. User provided new Claude API key

**Final Solution:** Using user's personal Claude API key: `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`

**Files:** backend/.env

### Issue 4: GitHub Secret Protection

**Problem:** Git push blocked because API keys exposed in documentation files (CORRELATION_ENGINE_CLAUDE_UPGRADE.md, SUPABASE_DEPLOYMENT_GUIDE.md)

**Solution:** 
- Deleted documentation files containing keys
- Created clean docs with placeholders
- Keys kept only in .env files (gitignored)
- User allowed secret via GitHub unblock URL

**Files:** Deleted problematic .md files, created FASTAPI_MIGRATION_SUMMARY.md

### Issue 5: Threshold Slider Not Syncing

**Problem:** Slider set to ±10 but insights triggered for ±2 changes. Slider set to ±1 but no insights appeared.

**Root Causes:**
1. Correlation engine initialized with hardcoded `minDelta = 10`
2. Duplicate THRESHOLD_UPDATE handler in background.js
3. Threshold not loading from storage on init

**Solutions:**
1. Removed duplicate THRESHOLD_UPDATE handler (line 656-660 in background.js)
2. Attempted storage loading in constructor (caused race condition - reverted)
3. Final: Default to 3, rely on slider THRESHOLD_UPDATE messages to set value
4. Increased slider max from ±15 to ±200 for large TikTok streams

**Files:** correlationEngine.js, background.js

### Issue 6: Audio Button Completely Broken

**Problem:** After implementing threshold storage loading, audio button stopped working entirely. No click response, no animation.

**Error:** "Uncaught (in promise) Error: Could not establish connection. Receiving end does not exist" from background.js

**Root Cause:** Called `chrome.storage.local.get()` in correlationEngine constructor during module import, before Chrome APIs were ready. Promise rejection broke entire background script initialization.

**Attempted Fixes:**
1. setTimeout delay (100ms) - didn't work
2. Try-catch error handling - didn't work

**Final Solution:** Removed ALL Chrome API calls from constructor completely. No storage loading at init. Rely on THRESHOLD_UPDATE message from slider.

**Files:** correlationEngine.js

### Issue 7: Duplicate Function Syntax Error

**Problem:** After implementing countdown timer code, audio button broken again.

**Error:** "Uncaught SyntaxError: Identifier 'setupTooltips' has already been declared" at sidepanel.js:239

**Root Cause:** Accidentally duplicated entire `setupTooltips()` function when adding countdown code. JavaScript won't allow duplicate function declarations.

**Solution:** Removed duplicate function (kept original at line 146, deleted duplicate at line 239)

**Files:** sidepanel.js

### Issue 8: 20-Second Timer Not Visible

**Problem:** Timer logic working (logs showed success), countdown messages being sent/received, but no visual timer in UI. Element size: 0x0 pixels.

**Root Causes:**
1. Countdown element (`<span id="countdownDisplay">`) inside `<div id="cooldownTimer">` which was hidden/shown by engine status updates (COLLECTING → CORRELATING → COMPLETE)
2. Element only visible for split second when status = COMPLETE
3. Chrome caching old HTML without countdown element

**Solutions Applied (Progressive):**
1. Dynamic element creation if missing (fallback for cache)
2. Added inline styles to force visibility
3. Moved countdown to permanent location (`<div id="permanentCountdown">`) at top of insight card
4. Removed dependency on cooldownTimer status updates
5. Inline CSS in HTML ensures styling even if stylesheet cached

**Files:** sidepanel.html, sidepanel.js (updateCountdown function)

---

## Current Status (as of Version 020)

### ✅ Working Features:

1. **Extension loads without errors** - Version 2025-06-22-020
2. **Audio button functional** - Start/Stop with correct visual states
3. **20-second countdown timer** - Visible, decrements correctly, resets after insights
4. **Sensitivity slider** - Range ±1 to ±200, updates correlation engine
5. **Claude API integration** - Backend successfully calls Claude Sonnet 4.5
6. **Branding** - Custom logo, proper name/description
7. **Clean UI** - No distracting "Correlating/Collecting" status messages

### ⚠️ Current Issues (Active Debugging):

**CRITICAL - Insight Quality Problem:**

**Symptom:**
- Backend logs show Claude generating EXCELLENT tactical insights:
  - "Ask about their streaming setup. Stay direct"
  - "Ask spicy controversial takes. Stay curious"
  - "Show barbecue closeup. Get hyped"
  - "Tease when you'll reveal. Build anticipation"
  
- BUT UI shows generic fallback insights:
  - "Amusement (laugh) killed momentum. Switch to engaging content"
  - Top actions labeled "Neutral" (not specific)

**Hypothesis:**
Claude's good insights are being REPLACED by fallback logic in correlationEngine.js. The fallback checks prosody quality and if "GOOD" or "EXCELLENT", uses old template-based messages like `"${emotion} killed momentum. Switch to ${opposite}"` (line 549).

**Debugging Added (Version 020):**
- Log Claude response assignment: `[Correlation] ✅ Using Claude insight`
- Log before fallback check: `[Correlation] 🔍 Before fallback check - emotionalLabel: X nextMove: Y`
- Will reveal if Claude's values exist before fallback or if they're being overridden

**Next Steps:**
1. Check console logs to see "Before fallback check" values
2. If Claude values exist but fallback still runs → Bug in fallback condition
3. If Claude values missing → Issue in AI call or response parsing
4. Likely fix: Prevent fallback from running when Claude succeeds

**Files to modify:** correlationEngine.js (fallback logic around line 764-787)

---

## Recent Deployments (Last 10 Versions)

**Version 011:** Audio button fix attempt #1 (setTimeout for storage loading) - FAILED
**Version 012:** Audio button fix attempt #2 (removed storage loading) - FAILED (duplicate function error)
**Version 013:** Removed duplicate setupTooltips function - Audio button FIXED
**Version 014:** Added timer debug logging - Timer logs appeared but not visible
**Version 015:** Dynamic countdown element creation - Still not visible (0x0 pixels)
**Version 016:** Variable scoping fix for countdown - Still not visible
**Version 017:** Forced inline styles on countdown - Still not visible
**Version 018:** Moved countdown to permanent location - TIMER VISIBLE! (but flickering)
**Version 019:** Removed engine status UI noise - Clean UI achieved
**Version 020:** (Current) Added insight flow debugging to trace Claude vs. fallback issue

---

## Current Work In Progress

### Task: Fix Claude Insights Being Replaced by Fallback

**Goal:** Ensure Claude's tactical insights (from backend) reach the UI without being overridden by correlation engine's fallback logic.

**Current Evidence:**
- Backend: Claude generates "Ask about their pets. Stay curious"
- UI shows: "Amusement (laugh) killed momentum. Switch to engaging content"
- Discrepancy suggests frontend fallback is overriding

**Debugging Strategy:**
- Version 020 adds logs before fallback check
- User will test and share console output
- Expected to see Claude values present but fallback still triggering

**Suspected Code Location:**
- correlationEngine.js lines 763-787 (fallback logic)
- Condition `if (!nextMove)` should prevent fallback if Claude succeeded
- But prosody quality check (line 776) may be creating alternate path

**Likely Fix:**
Add flag to prevent fallback when Claude API call succeeded:
```javascript
let claudeSucceeded = false;
if (ENABLE_EXTENSION_AI && isHighImpact) {
  // ... Claude call ...
  if (response.ok) {
    claudeSucceeded = true;
  }
}

if (!nextMove && !claudeSucceeded) {
  // Only use fallback if Claude didn't succeed
}
```

---

## Next 1-3 Steps for Spikely

Based on deployment history and user feedback:

### Step 1: Fix Insight Quality (IMMEDIATE - Currently Debugging)

**Priority:** CRITICAL
**Issue:** Claude insights being replaced by fallback
**Action:**
1. Analyze Version 020 console logs from user
2. Identify exact point where Claude insights are lost
3. Prevent fallback from overriding Claude responses
4. Verify blue card shows tactical Claude insights

**Success Criteria:**
- Blue card displays: "Ask about their pets. Stay curious"
- NOT: "Amusement (laugh) killed momentum"
- All insights in 3-5 word + emotional cue format

### Step 2: Verify 20-Second Timer Continuous Operation

**Priority:** HIGH
**Status:** Timer visible but needs extended testing
**Action:**
1. Test timer for 5-10 minute stream session
2. Verify it generates insights every 20s
3. Confirm countdown resets correctly
4. Test reminder mode (no data available)

**Success Criteria:**
- Timer never stops or freezes
- Insights appear at 0s countdown
- Countdown resets to 20s after each insight
- Winning action reminders work when no transcripts

### Step 3: Optimize Insight Triggering Logic

**Priority:** MEDIUM
**Current Behavior:**
- Delta-triggered insights require threshold to be met
- Timer-triggered insights happen every 20s regardless

**Improvements Needed:**
1. Add "Next Insight" button to manually request insight before timer expires
2. Insight queue - show next insight preview
3. Adjustable timer interval (let user choose 10s, 20s, or 30s)
4. Smart cooldown - don't generate insight if no meaningful data

**Files to create/modify:**
- sidepanel.html - Add "Next Insight" button
- sidepanel.js - Button click handler
- correlationEngine.js - Manual insight request method

---

## Technical Configuration

### Environment Variables:

**Frontend (.env):**
```
REACT_APP_BACKEND_URL=https://stream-insights-2.preview.emergentagent.com
```

**Backend (.env):**
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
CORS_ORIGINS="*"
ANTHROPIC_API_KEY=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
```

**Supabase (.env):**
```
ANTHROPIC_API_KEY=[old key - not used anymore]
```

### Key Settings:

- **Insight interval:** 20000ms (20 seconds)
- **AI timeout:** 1500ms (1.5 seconds)
- **Default threshold:** 3 viewers
- **Slider range:** 1-200 viewers
- **Transcript buffer:** Last 50 lines
- **Viewer buffer:** Last 2000 samples
- **Prosody buffer:** Last 10 samples
- **Winning actions:** Top 10 tracked

### Service Control:

```bash
# Restart backend (applies .env changes, requirement.txt updates)
sudo supervisorctl restart backend

# Check backend logs
tail -n 100 /var/log/supervisor/backend.err.log

# Check backend status
sudo supervisorctl status backend
```

Frontend has hot reload - changes apply automatically.

---

## Known Issues & Workarounds

### Issue: Hume AI / AssemblyAI Rate Limiting

**Symptom:** "Rate limited" errors in console, blue card shows "Failed - Rate limited"

**Cause:**
- Hume AI free tier: 20 requests per month
- AssemblyAI rate limits on concurrent connections

**Workaround:** Enhanced fallback provides better insights when rate limited

**Future Fix:** Upgrade API tiers for production use

### Issue: Generic "Neutral" Labels in Top Actions

**Symptom:** Top winning/losing actions show "Neutral" instead of specific topics

**Cause:** Action labels use `tone.emotion || segment.topic || 'Speech'`, but tone.emotion often returns generic values

**Fix Needed:** Improve topic classification or use Claude to label actions

### Issue: Slider Threshold Timing

**Symptom:** Occasionally insights trigger below threshold, or don't trigger when they should

**Debugging:** Added detailed [AI:GATE] logging showing threshold calculation

**Status:** Monitoring - may be timing issue with threshold updates

---

## File Structure & Key Code Locations

### Extension Files (/app/frontend/extension/):

**sidepanel.html:**
- Line 77: Slider (min=1, max=200, default=10)
- Line 113-116: Permanent countdown timer container
- Line 127-136: Insight content div

**sidepanel.js:**
- Lines 1-5: Version logging
- Lines 75-110: updateAudioState() - Audio button state management
- Lines 143-179: setupTooltips() - Hover tooltips
- Lines 199-236: Countdown functions (updateCountdown, startCountdownInterval, stopCountdownInterval)
- Lines 659-664: COUNTDOWN_UPDATE message handler
- Lines 972-1030: updateInsight() - Render insights in blue card

**correlationEngine.js:**
- Lines 12-39: Constructor + default values
- Lines 41-99: Timer methods (startAutoInsightTimer, stopAutoInsightTimer, resetCountdown, emitCountdown, generateTimedInsight, sendReminderInsight)
- Lines 243-312: addViewerCount() - Threshold check, insight triggering
- Lines 569-900: generateInsight() - Main insight generation with Claude call and fallback
- Lines 763-830: Fallback logic (SUSPECTED BUG LOCATION)
- Line 1005: Export singleton instance

**background.js:**
- Line 2: Import correlationEngine
- Lines 217-233: THRESHOLD_UPDATE handler (updates correlation engine)
- Lines 267, 599, 848: Add data to correlation engine (viewer counts, transcripts, prosody)
- Line ~517: Start auto-insight timer after audio capture

**manifest.json:**
- Lines 3-5: Extension name, version, description

### Backend Files (/app/backend/):

**server.py:**
- Lines 1-13: Imports (includes Anthropic)
- Lines 54-90: Pydantic models (InsightRequest, InsightResponse, etc.)
- Lines 92-285: POST /api/generate-insight endpoint
- Lines 121-187: Claude system prompt (tactical insight instructions)
- Lines 189-210: User prompt (formatted data for Claude)
- Lines 212-256: Claude API call, JSON parsing, validation
- Lines 287-310: Fallback insights (enhanced for rate limiting)

**requirements.txt:**
- Line 25: anthropic>=0.39.0

**.env:**
- Line 4: ANTHROPIC_API_KEY=[user's key]

---

## Debugging Protocols Established

### Console Logging Conventions:

**Correlation Engine:**
- `[Correlation]` - General correlation engine logs
- `[AI:GATE]` - Threshold/AI call decision logging
- `[Correlation] ⏰` - Timer-related logs

**Countdown Timer:**
- `[COUNTDOWN]` - UI countdown functions
- `[Correlation] ⏰ Emitting countdown` - Message sending

**Audio:**
- `[AUDIO:BG:*]` - Background script audio handling
- `[AUDIO:SP:*]` - Side panel audio handling

**Insights:**
- `[Correlation] 🎯 Generated insight to send` - Outgoing from engine
- `[SIDEPANEL] 🎯 INSIGHT received` - Incoming to UI
- `[Spikely Side Panel] 🎯 After sanitization` - Final display values

### Testing Workflow:

1. Make code changes
2. Update version number (increment)
3. Add console logging for new features
4. Save to GitHub (if needed for deployment)
5. Reload extension: chrome://extensions/ → Reload
6. Check console for version number
7. Check console for expected logs
8. Visual verification in UI
9. Share screenshots if issues persist

---

## API Keys & Credentials

**Claude API Key:** `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`
- Location: /app/backend/.env
- NOT pushed to Git (in .gitignore)
- Used by: server.py to call Claude API

**AssemblyAI API Key:** Managed via Supabase edge function (realtime-token)

**Hume AI API Key:** Managed via Supabase edge function

**Emergent LLM Key:** `sk-emergent-6978dE540Ef3228Ab2`
- Available but not used (budget too small for production)
- Can be retrieved via emergent_integrations_manager tool

---

## Deployment & Testing Context

### Git Workflow Issues Encountered:

**Problem:** Auto-generated commits, conflicts with main branch, secret protection blocking pushes

**Solution:** User unblocked secrets via GitHub URL, uses force push or new branches as needed

**Current Behavior:**
- Code changes made in /app/ (Emergent environment)
- Git push to GitHub (sometimes requires conflict resolution)
- Changes sync to local deployment folder
- Chrome loads extension from: /Users/thebusko/Documents/GitHub/spike-ly-emergent/frontend/extension/
- Extension reload required to see changes

### Chrome Extension Caching Issues:

**Aggressive caching of:**
- HTML files (sidepanel.html)
- CSS files (sidepanel.css)
- JavaScript files (sidepanel.js)

**Solutions applied:**
- Query string cache busting: `?v=20250622015`
- Inline critical CSS in HTML
- Dynamic element creation as fallback
- Title version indicator: `<title>Spikely v015</title>`

**Nuclear cache clear when needed:**
1. Remove extension completely
2. Close all Chrome windows
3. Clear Chrome cache (Ctrl+Shift+Delete)
4. Reload fresh

---

## User Preferences & Decisions

**Confirmed Decisions:**
1. ✅ Keep AssemblyAI + Hume AI (NOT using TikTok captions)
   - Reason: Need emotional analysis from audio for tactical insights
   - TikTok captions = text only, loses prosody data
   
2. ✅ Use FastAPI backend instead of Supabase
   - Reason: Easier deployment, no CLI needed, faster iteration
   
3. ✅ Slider range ±1 to ±200
   - Reason: TikTok streams can have thousands of viewers
   
4. ✅ Clean UI - remove status messages
   - Reason: "Correlating/Collecting" distracts from insights
   
5. ✅ 20-second auto-insights
   - Reason: Proactive guidance even during viewer flatlines

---

## Next Session Continuation Guide

### Immediate Priority: Fix Insight Quality

**What to do first:**
1. Ask user for screenshot of console showing:
   - `[Correlation] 🔍 Before fallback check` log
   - What emotionalLabel and nextMove values are shown
   
2. If values show Claude's good insights:
   - Bug is fallback running AFTER Claude succeeds
   - Fix: Add `claudeSucceeded` flag to skip fallback
   
3. If values show fallback already:
   - Bug is earlier in flow
   - Check if AI call actually succeeded
   - Check response parsing

**Expected fix location:** correlationEngine.js around lines 693-698 (set flag), 764 (check flag)

### Secondary Priority: Timer Stability

**Test for 10-20 minutes:**
- Does timer continue running?
- Does countdown reset after each insight?
- Does 20-second auto-insight work?
- Any console errors over time?

### Tertiary Priority: Enhancements

**After quality issues resolved:**
1. "Next Insight" button (skip countdown)
2. Adjustable timer interval
3. Stream-level context and pattern learning
4. A/B testing for insight formats

---

## Important Notes for Continuation

### Git/Deployment:
- User loads extension from local Git folder
- Must push to GitHub first, then reload extension
- Sometimes encounters conflicts (force push or new branch)
- API keys in .env files (NOT in Git)

### Chrome Extension Quirks:
- Service worker (background.js) can crash if errors during import
- Module scope errors break entire script
- Chrome caching very aggressive - use query string cache busters
- DOM elements from HTML sometimes not available immediately

### API Usage:
- Claude Sonnet 4.5 costs ~$0.006-0.01 per insight
- Hume AI has free tier rate limits
- AssemblyAI has concurrent connection limits
- Backend handles all API calls (extension just triggers)

### User Testing Workflow:
- User tests on TikTok Live streams
- Viewer counts range from hundreds to thousands
- Tests with slider at various values (±1, ±10, ±50)
- Wants insights every 20s minimum
- Expects tactical, specific guidance (not generic)

### Code Quality:
- Always lint JavaScript before deployment
- Add version number for tracking
- Console log all major operations
- Use emoji in logs for easy scanning (🎯 🔍 ⏰ ✅ ❌)

---

## Critical Success Criteria

**For Next Session:**

✅ **Insight Quality:**
- Blue card shows Claude's tactical insights
- Format: "Ask about X. Stay hyped"
- NOT generic fallback messages

✅ **Timer Reliability:**
- Countdown visible and functional
- Decrements every second
- Resets after insights
- Works for extended periods (20+ minutes)

✅ **Threshold Accuracy:**
- Slider value correctly controls when insights trigger
- ±1: Triggers for every 1 viewer change
- ±200: Only triggers for 200+ viewer changes

---

## End of Summary

This document contains complete context for continuing Spikely development. The immediate focus is fixing the insight quality issue where Claude's excellent tactical insights are being replaced by generic fallback messages in the UI.

**Current Version:** 2025-06-22-020
**Status:** Debugging insight quality issue
**Blocking Issue:** Claude insights not reaching UI correctly
**Next Action:** Analyze Version 020 console logs to identify where Claude insights are being overridden
