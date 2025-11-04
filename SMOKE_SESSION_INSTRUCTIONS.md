# Smoke Session Testing Instructions - v028

## Pre-Test Setup

**1. Reload Extension:**
- Chrome → `chrome://extensions/`
- Click Reload on Spikely
- Verify console shows: "Version 2025-10-24-028-SMOKE-TEST"

**2. Open Two Windows:**
- Window 1: TikTok Live stream
- Window 2: DevTools console (to capture logs)

**3. Prepare Log Capture:**
- Console → Right-click → Save as... → `extension_logs.txt`
- Terminal: `tail -f /var/log/supervisor/backend.err.log > backend_logs.txt`

---

## Test Execution (20 Clips)

### RICH Transcripts (10 clips)

**Clip 1 - Gaming (Valorant)**
1. Start audio capture
2. Speak/play: "I'm playing Valorant on my brand new RTX 4090 gaming PC with dual 4K monitors and custom RGB lighting setup. Just hit Diamond rank yesterday."
3. Wait for insight (20s timer or delta trigger)
4. Record:
   - CorrelationId from console: `📊 CORRELATION_ID: ________`
   - Raw Claude from backend: `📊 Full Claude Response: ________`
   - Final UI: `Move: ________`
   - Latency: `✅ Response Time: ___ms`
5. Rate insight:
   - Actionable? yes/no
   - Specific? yes/no
   - Would execute? yes/no

**Clip 2 - Makeup**
(Repeat same process with makeup transcript)

**Clip 3-10**
(Continue with remaining rich transcripts)

---

### WEAK Transcripts (10 clips)

**Clip 11 - Filler**
1. Start audio
2. Speak/play: "yeah um like okay cool so yeah I mean like you know what I'm saying guys um yeah so basically like yeah"
3. Wait for insight
4. Record same data as above
5. Rate insight

**Clip 12-20**
(Continue with remaining weak transcripts)

---

## Data Collection Format

**For Each Clip, Capture:**

**Extension Console:**
```
📊 CORRELATION_ID: 1729801234567-0001
🤖 Transcript (FULL): [transcript]
🤖 Keywords Detected: [keywords]
🤖 Transcript Quality: HIGH/MEDIUM/LOW
✅ CLAUDE INSIGHT RECEIVED
✅ Next Move: [insight]
```

**Backend Logs:**
```
📊 CORRELATION_ID: 1729801234567-0001
📊 Transcript: [transcript]
📊 Transcript word count: X
📊 Keywords Sent: [keywords]
📊 Full Claude Response: {"emotionalLabel": "X", "nextMove": "Y"}
📊 FINAL OUTPUT: {"emotionalLabel": "X", "nextMove": "Y"}
```

---

## QA Rating Form

**For 10 Selected Samples (5 rich, 5 weak):**

```
Sample ID: RICH-001
CorrelationId: 1729801234567-0001
Insight: "Ask 'What's your Valorant rank?'. Share your loadout"

Q1: Is this actionable (can streamer do it in 30s)? 
    [ ] Yes  [ ] No
    
Q2: Is this specific (includes concrete noun/question)?
    [ ] Yes  [ ] No
    
Q3: Would a real streamer execute this advice?
    [ ] Yes  [ ] No
    
Score: ___/3
Notes: ___________
```

---

## Post-Session Analysis

**After 20 clips tested:**

**1. Calculate Metrics:**
- ActionabilityRate = (# with 3/3 scores) / 10 = ___%
- RawVsFinalDelta = (# where raw ≠ final) / 20 = ___%
- Latency90 = 90th percentile latency = ___ms

**2. Identify Pattern:**
- Rich transcripts → Specific insights? YES/NO
- Weak transcripts → Generic insights? YES/NO
- UI matches raw? YES/NO

**3. Document Finding:**
- If raw=specific but UI=generic → **Frontend transformer bug**
- If raw=generic → **Prompt/input quality issue**
- If raw varies → **Inconsistent behavior**

**4. Make Recommendation:**
- Fix transformer
- OR implement routing
- OR use templates
- OR tune prompts more

---

## Expected Timeline

**Phase 1: Setup** (5 min)
- Reload extension
- Open windows
- Start logging

**Phase 2: Rich Transcripts** (30-40 min)
- 10 clips × 3 min each
- Includes recording and rating

**Phase 3: Weak Transcripts** (30-40 min)
- 10 clips × 3 min each
- Includes recording and rating

**Phase 4: Analysis** (20-30 min)
- Calculate metrics
- Identify patterns
- Write recommendation

**Total: 85-115 minutes (1.5-2 hours)**

---

## Success Criteria

**Minimum Requirements:**
- ✅ 20 clips tested
- ✅ 10 rated samples
- ✅ CorrelationIds captured for all
- ✅ Raw Claude outputs documented
- ✅ Pattern identified
- ✅ Clear recommendation provided

**Quality Bar:**
- ActionabilityRate > 70% = GOOD
- RawVsFinalDelta < 10% = GOOD (not being modified)
- Latency90 < 2000ms = ACCEPTABLE

---

## Deliverable

**File:** `/app/SMOKE_SESSION_RESULTS.md`

**Must Include:**
- 10 sample correlationIds
- 5 rich raw→UI pairs
- 5 weak raw→UI pairs
- QA pass rate
- Metrics summary
- Clear recommendation

---

**Status:** Instructions ready  
**Next:** Deploy v028, then execute smoke session
