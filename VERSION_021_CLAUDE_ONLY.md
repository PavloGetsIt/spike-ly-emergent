# Version 021 - Claude Quality Only Mode

## Date: 2025-06-22

## Problem Statement

User reported that Claude was generating excellent tactical insights like:
- "Ask about their streaming setup. Stay direct"
- "Ask spicy controversial takes. Stay curious"
- "Show barbecue closeup. Get hyped"

But UI was showing low-quality fallback messages like:
- "amusement (laugh) killed momentum. switch to engaging content"
- Generic template-based insights

## Root Cause Analysis

The correlation engine had extensive fallback logic that would run even after Claude successfully generated insights. The fallback code checked prosody quality (GOOD/EXCELLENT) and would override Claude's tactical insights with template-based messages like:

```javascript
// Line 549 in correlationEngine.js
return `${burstName} killed momentum. Switch to ${opposite}`;
```

This was happening because:
1. Claude successfully set `emotionalLabel` and `nextMove`
2. Backend returned proper tactical insights
3. BUT frontend had sanitization and fallback checks that would replace them

## Solution Implemented

**Complete removal of fallback logic.** New behavior:

1. ✅ **If Claude succeeds:** Show Claude insight (tactical, specific, 3-5 words format)
2. ❌ **If Claude fails:** Return `null` and skip insight (no low-quality fallback)

## Files Modified

### `/app/frontend/extension/correlationEngine.js`

**Removed (Lines 764-880):**
- All fallback template generation logic
- `generateSpikeFeedback()` calls
- `generateDropFeedback()` calls  
- `generateDumpFeedback()` calls
- Prosody quality-based fallback
- Transcript bleed detection in frontend
- Word frequency sanitization

**Replaced with (Lines 764-784):**
```javascript
// Claude Quality Check - NO FALLBACK LOGIC
if (!nextMove) {
  console.warn('⚠️ CLAUDE INSIGHT FAILED - SKIPPING INSIGHT');
  console.warn('⚠️ No low-quality fallback - waiting for next Claude insight');
  return null; // Skip this insight
}

// If we reach here, Claude succeeded - use Claude insight only
console.log('✅ USING CLAUDE INSIGHT (Quality-Only Mode)');
console.log('✅ Label:', emotionalLabel);
console.log('✅ Move:', nextMove);
```

**Removed (Lines 882-915):**
- Final sanitization pass (`sanitizeAgainstTranscript()`)
- Frontend transcript bleed detection
- Automatic replacement of Claude insights

**Replaced with:**
```javascript
// Trust Claude insights - NO sanitization that could replace them
// Backend already handles transcript bleed detection
console.log('[Correlation] ✅ Trusting Claude insight as-is');
```

### `/app/frontend/extension/sidepanel.html`
- Updated title: `Spikely v021`
- Updated CSS cache bust: `?v=20250622021`

### `/app/frontend/extension/sidepanel.js`
- Updated version: `2025-06-22-021`
- Updated log: "Claude Quality Only"

### `/app/frontend/extension/manifest.json`
- Updated version: `1.0.21`

## Expected Behavior After Fix

### Success Case (Claude works):
1. User triggers insight (delta-based or 20s timer)
2. Extension calls FastAPI backend
3. Backend calls Claude Sonnet 4.5
4. Claude returns tactical insight: "Ask about their pets. Stay curious"
5. Extension receives insight
6. UI displays: **"Ask about their pets. Stay curious"**
7. ✅ No fallback interference

### Failure Case (Claude fails):
1. User triggers insight
2. Extension calls FastAPI backend
3. Backend fails (timeout, rate limit, API error)
4. Extension catches error
5. `nextMove` remains empty/null
6. Correlation engine returns `null`
7. ❌ No insight displayed (clean, no low-quality message)
8. Next insight attempt in 20 seconds

## Console Logging for Debugging

**When Claude succeeds:**
```
✅ CLAUDE INSIGHT RECEIVED (Extension)
✅ Response Time: 450 ms
✅ Emotional Label: Ask about pets
✅ Next Move: Stay curious
✅ Using Claude insight - Label: Ask about pets Move: Stay curious
[Correlation] 🔍 Quality Check - emotionalLabel: Ask about pets nextMove: Stay curious
✅ USING CLAUDE INSIGHT (Quality-Only Mode)
✅ Label: Ask about pets
✅ Move: Stay curious
[Correlation] ✅ Trusting Claude insight as-is
```

**When Claude fails:**
```
❌ CLAUDE API FAILED (Extension)
❌ Status: 500
❌ Error: Internal Server Error
❌ Duration: 1200 ms
[Correlation] 🔍 Quality Check - emotionalLabel: analyzing nextMove: null
⚠️ CLAUDE INSIGHT FAILED - SKIPPING INSIGHT
⚠️ No low-quality fallback - waiting for next Claude insight
```

## Benefits of This Approach

1. **Quality Guarantee:** Every insight shown is Claude-generated tactical advice
2. **No Confusion:** Users only see high-quality, specific guidance
3. **Clear Failure:** If Claude fails, UI stays clean (no bad advice)
4. **Faster Iteration:** Removes 150+ lines of complex fallback logic
5. **Backend Trust:** Lets backend handle validation/bleed detection

## Potential Issues & Mitigations

### Issue: Too many skipped insights if Claude fails frequently

**Monitoring:**
- Check console for "CLAUDE INSIGHT FAILED" frequency
- If >30% failure rate, investigate backend/API issues

**Mitigations:**
- Increase AI timeout from 1.5s to 3s (if needed)
- Add retry logic (1 retry on timeout)
- Implement simple fallback: "Keep engaging. Ask viewers a question"

### Issue: Users see no guidance during failure periods

**Current behavior:** 20-second timer continues, next attempt in 20s

**Potential enhancement:** Show status message:
- "Generating insight..." (during API call)
- "Connection issue. Retrying in 20s..." (on failure)

## Testing Checklist

- [ ] Load extension in Chrome
- [ ] Check console shows Version 021
- [ ] Start audio capture on TikTok Live
- [ ] Verify insights appear in blue card
- [ ] Check console shows "USING CLAUDE INSIGHT" logs
- [ ] Verify NO "Fallback" or "killed momentum" messages
- [ ] Test for 10+ minutes to ensure stability
- [ ] Check insight format: tactical, 3-5 words, emotional cue
- [ ] Verify 20-second timer continues working
- [ ] Test with different viewer deltas (±1, ±10, ±50)

## Success Criteria

✅ All insights in blue card use Claude format: "Ask about X. Stay hyped"  
✅ NO template messages like "killed momentum" or "switch to X"  
✅ Console shows "USING CLAUDE INSIGHT" for all displayed insights  
✅ If Claude fails, no insight shown (clean UI)  
✅ Timer continues working (insights every 20s)  

## Rollback Plan

If this breaks functionality:

1. Git revert to Version 020
2. Restore fallback logic from lines 764-880
3. Add flag: `const ALLOW_FALLBACK = false` to disable selectively

## Next Steps After Validation

1. Monitor Claude API success rate
2. Consider adding simple retry on timeout
3. Add optional "Analyzing..." status during API call
4. Consider minimal fallback: "Keep momentum. Ask viewers questions"

---

**Version:** 021  
**Status:** Ready for manual testing  
**Deploy Command:** Git push → Reload extension in Chrome  
