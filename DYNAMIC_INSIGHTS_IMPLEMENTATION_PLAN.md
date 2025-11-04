# Dynamic Insights - Comprehensive Implementation Plan

## Goal
Transform Claude from generating repetitive insights to truly dynamic, context-aware tactical advice.

## Problem Analysis
- **Current:** Claude generates same 5-10 insights regardless of context
- **Root Cause:** Insufficient/poor quality data reaching Claude
- **Impact:** Streamers see "Pivot to Q&A" 10 times in a row

## Solution Architecture

### Phase 1: Enhanced Prompt Engineering (Backend)
**File:** `/app/backend/server.py`

**Changes:**
1. Add anti-repetition rules to system prompt
2. Require Claude to reference specific transcript content
3. Add "recent insights" to user prompt
4. Stricter validation of output quality
5. Add reasoning step before generating insight

**New Prompt Structure:**
```
SYSTEM:
- You are Spikely AI Coach
- Generate UNIQUE insights every time
- Reference SPECIFIC words from transcript
- Never repeat patterns from recent history

USER:
- Full transcript (40 words minimum)
- Recent 3 insights (DON'T REPEAT THESE)
- Detected keywords/topics
- Winning actions from past
- Viewer pattern history
```

### Phase 2: Transcript Buffer Improvement (Extension)
**File:** `/app/frontend/extension/correlationEngine.js`

**Changes:**
1. Increase transcript window: 20s → 40s
2. Add filler word filter ("um", "like", "uh", "yeah", "okay")
3. Minimum word count: 30 words (or skip insight)
4. Add transcript quality score
5. Consolidate multiple short transcripts into paragraphs

**Quality Checks:**
- Word count >= 30
- Unique word ratio > 40%
- No single word repeated > 25% of content
- At least 3 different sentence structures

### Phase 3: Smart Topic Detection (Extension)
**File:** `/app/frontend/extension/correlationEngine.js`

**Changes:**
1. Add keyword library for common stream topics
2. Keyword extraction from transcript
3. Topic momentum tracking (same topic = flag as repetitive)
4. Send top 3 keywords to Claude
5. Track which topics caused spikes

**Keyword Categories:**
```javascript
{
  gaming: ['game', 'play', 'level', 'controller', 'setup', 'fps', 'strategy'],
  makeup: ['makeup', 'lipstick', 'foundation', 'contour', 'blend', 'palette'],
  cooking: ['cook', 'recipe', 'ingredient', 'taste', 'bake', 'flavor'],
  personal: ['story', 'life', 'family', 'friend', 'relationship', 'feel'],
  tech: ['tech', 'phone', 'computer', 'app', 'software', 'code'],
  fitness: ['workout', 'exercise', 'gym', 'muscle', 'cardio', 'reps']
}
```

### Phase 4: Dynamic Examples (Extension + Backend)
**Files:** Both

**Extension Changes:**
1. Track last 5 insights sent to UI
2. Add to payload: `recentInsights: ["Pivot to Q&A", "Show product", ...]`
3. Track winning topics: Which topics caused +10 spikes?
4. Send winning topics to Claude

**Backend Changes:**
1. Receive `recentInsights` array
2. Add to prompt: "DON'T REPEAT THESE: ..."
3. Validate output doesn't match recent insights (fuzzy match)
4. If match detected, regenerate with stricter rules

### Phase 5: Context Enrichment
**New Data Points to Send:**

From Extension:
- `keywordsSaid: ["gaming", "setup", "controller"]`
- `recentInsights: [last 3 insights]`
- `winningTopics: ["gaming +15", "makeup +12"]`
- `topicMomentum: "gaming (2 min straight)"` 
- `transcriptQuality: "HIGH" | "MEDIUM" | "LOW"`
- `uniqueWordRatio: 0.65`
- `averageWordsPerSentence: 8.5`

To Claude:
- Full 40-second transcript (not truncated)
- Specific keywords detected
- What NOT to say (recent insights)
- What worked before (winning topics)

## Implementation Steps

### Step 1: Backend Prompt Enhancement
1. Update system prompt with anti-repetition rules
2. Add "recent insights" to user prompt
3. Add keyword analysis section
4. Add strict validation

### Step 2: Extension - Filler Word Filter
1. Create `filterFillerWords()` function
2. Apply before sending to backend
3. Log before/after for debugging

### Step 3: Extension - Increase Buffer
1. Change `getRecentSegment()` from 20s → 40s
2. Add minimum word count check
3. Skip insight if < 30 words

### Step 4: Extension - Keyword Detection
1. Create keyword library
2. Create `extractKeywords()` function
3. Add to payload

### Step 5: Extension - Recent Insights Tracking
1. Add `recentInsights` array to class
2. Store last 5 insights
3. Add to payload

### Step 6: Extension - Winning Topics
1. Track topics with +10 delta
2. Add `winningTopics` array
3. Include in payload

### Step 7: Backend - Recent Insights Validation
1. Parse `recentInsights` from request
2. Add to prompt
3. Validate output doesn't match

### Step 8: Testing & Iteration
1. Deploy changes
2. Test with real stream
3. Monitor insight variety
4. Adjust thresholds as needed

## Preflight Validation Checklist

### Before Deployment:
- [ ] Python syntax check: `python3 -m py_compile server.py`
- [ ] JavaScript syntax check: No console errors in correlationEngine.js
- [ ] Backend restart test: `sudo supervisorctl restart backend`
- [ ] Backend logs check: No import errors
- [ ] CORS still working: `curl -X OPTIONS ...`
- [ ] Extension version updated
- [ ] Git commit with clear message

### After Deployment:
- [ ] Extension loads without errors
- [ ] Console shows new data points
- [ ] Claude receives enriched context
- [ ] Insights are more varied
- [ ] No repetition in first 10 insights
- [ ] Performance acceptable (< 2s per insight)

## Success Metrics

### Before:
- Insight variety: 5-10 unique insights per session
- Repetition rate: 40-60%
- Context relevance: Low (generic)
- User satisfaction: "Not helpful"

### After (Target):
- Insight variety: 30-50 unique insights per session
- Repetition rate: < 10%
- Context relevance: High (specific to transcript)
- User satisfaction: "Actionable and varied"

## Rollback Plan

If anything breaks:
1. Git revert to current version
2. Check which step failed
3. Fix that step in isolation
4. Redeploy incrementally

## Risk Mitigation

### Risk 1: Performance Degradation
- Solution: Profile each function
- Fallback: Skip keyword detection if > 100ms

### Risk 2: Token Limit Exceeded
- Solution: Truncate transcript at 500 words
- Fallback: Reduce history to 3 items

### Risk 3: Claude Still Repetitive
- Solution: Add stricter validation
- Fallback: Use template-based variety (not pure fallback)

## Timeline

- Step 1-2: 15 minutes
- Step 3-4: 15 minutes
- Step 5-6: 15 minutes
- Step 7: 10 minutes
- Step 8: 10 minutes
- **Total: 65 minutes**

## Files to Modify

1. `/app/backend/server.py` - Enhanced prompt + validation
2. `/app/frontend/extension/correlationEngine.js` - All extension improvements
3. `/app/frontend/extension/sidepanel.html` - Version bump
4. `/app/frontend/extension/manifest.json` - Version bump

---

**Status:** Ready to implement
**Next:** Execute Step 1 - Backend Prompt Enhancement
