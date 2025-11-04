# v1.1-ROUTING-MVP Implementation Summary

## Date: 2025-10-24

## What Was Implemented

### 1. TranscriptScore Routing System ✅

**Purpose:** Route insights based on transcript quality to maintain ActionabilityRate

**Scoring Logic:**
```
Score = NounCount + (KeywordCount × 2)

HIGH:   Score >= 8  → Use Claude only
MEDIUM: Score 3-7   → Use Claude with template fallback
LOW:    Score < 3   → Skip insight (no insight shown)
```

**Example Scores:**
- "I'm playing Valorant on RTX 4090..." → 7 nouns + 2 keywords = 11 (HIGH)
- "Showing makeup with Huda palette..." → 5 nouns + 1 keyword = 7 (MEDIUM)
- "yeah um like okay cool..." → 0 nouns + 0 keywords = 0 (LOW) → SKIP

**Files Modified:**
- `/app/frontend/extension/correlationEngine.js`
  - Added `calculateTranscriptScore()` function
  - Added routing logic in `generateInsight()`
  - Added template fallback for MEDIUM quality

---

### 2. 30 Micro-Action Template Library ✅

**Purpose:** Fallback for MEDIUM quality transcripts when Claude fails

**Template Bank Structure:**
- **Gaming:** 5 templates
- **Makeup:** 5 templates
- **Cooking:** 5 templates
- **Fitness:** 5 templates
- **Tech:** 5 templates
- **General:** 5 templates
- **Total:** 30 specific micro-actions

**Template Examples:**
```javascript
"Ask 'What's your main game?'. Poll top 3"
"Hold product to camera. Show label closeup"
"Taste test on camera. React honestly"
"Demonstrate proper form. Side angle"
"Show specs screen. Read key numbers"
"Call out top 3 usernames. Thank them"
```

**Selection Logic:**
- Matches category to keywords
- Filters by trigger type (spike/drop/flatline)
- Avoids last 5 used templates
- Random selection from available pool

**Files Created:**
- `/app/frontend/extension/templateBank.js` - Complete library + selector

**Files Modified:**
- `/app/frontend/extension/correlationEngine.js`
  - Added `initializeTemplateSelector()` function
  - Added `selectTemplate()` function
  - Integrated into constructor

---

## Routing Flow Diagram

```
Transcript arrives (40s window)
        ↓
Calculate Score (nouns + keywords)
        ↓
    ┌───────┴───────┐
    ↓               ↓               ↓
  HIGH           MEDIUM           LOW
(Score>=8)      (Score 3-7)     (Score<3)
    ↓               ↓               ↓
Call Claude    Call Claude      SKIP
    ↓               ↓           (No Insight)
  Success?       Success?
    ↓               ↓
   YES             YES → Use Claude
    ↓               NO  → Use Template
Use Claude
```

---

## Key Design Decisions

### Decision 1: LOW Quality = Skip (No Insight)
**Rationale:** Per user preference "no insight" over generic
**Impact:** Better to show nothing than show weak advice
**Threshold:** Score < 3 (0-2 nouns, no keywords)

### Decision 2: MEDIUM Quality = Claude + Template Fallback
**Rationale:** Try Claude first, use template if fails
**Impact:** Maintains insight frequency while ensuring quality
**Threshold:** Score 3-7 (some nouns/keywords present)

### Decision 3: HIGH Quality = Claude Only
**Rationale:** Rich transcripts deserve AI analysis, not templates
**Impact:** Best insights for best content
**Threshold:** Score >= 8 (8+ nouns/keywords)

### Decision 4: Template Rotation
**Rationale:** Avoid repetition even in templates
**Impact:** Templates don't feel stale
**Mechanism:** Track last 5 used, exclude from selection

---

## Expected Behavior Changes

### Before (v1.0 Production)
```
Any transcript → Claude → Insight
- Rich: Specific insight ✅
- Medium: Specific insight ✅
- Weak filler: Generic insight ❌
```

### After (v1.1 Routing)
```
Rich transcript → Claude → Specific insight ✅
Medium transcript → Claude (or template if fails) → Specific insight ✅
Weak filler → SKIP → No insight ⏭️
```

**Benefit:** No more generic insights for filler talk

---

## Template Categories & Examples

### Gaming (5 templates)
1. "Ask 'What's your main game?'. Poll top 3"
2. "Show your gaming setup. Point at monitor"
3. "Ask 'Controller or keyboard?'. Count hands"
4. "Ask 'What rank are you?'. Read top answers"
5. "Share your best play. Describe moment"

### Makeup (5 templates)
1. "Hold product to camera. Show label closeup"
2. "Ask 'Matte or shimmer?'. Poll chat"
3. "Demonstrate blending. Go slow motion"
4. "Ask 'Drugstore or luxury?'. Count votes"
5. "Swatch two shades. Ask which wins"

### Cooking (5 templates)
1. "Show ingredients lineup. Name each one"
2. "Taste test on camera. React honestly"
3. "Demonstrate knife skill. Go slow"
4. "Ask 'Sweet or savory?'. Count responses"
5. "Share secret ingredient. Hold it up"

### Fitness (5 templates)
1. "Demonstrate proper form. Side angle"
2. "Ask 'Cardio or weights?'. Poll chat"
3. "Count reps out loud. Race timer"
4. "Ask 'Bulk or cut?'. Read answers"
5. "Share your top 3 tips. Number them"

### Tech (5 templates)
1. "Show specs screen. Read key numbers"
2. "Compare two options. List 3 differences"
3. "Ask 'Apple or Android?'. Count votes"
4. "Test main feature live. Show results"
5. "Show full setup. Pan camera slowly"

### General (5 templates)
1. "Call out top 3 usernames. Thank them"
2. "Ask 'Where you from?'. Read top 5"
3. "Start poll: Yes or No. Count votes"
4. "Ask viewers question. Read top 5 answers"
5. "Shoutout new followers. Wave at camera"

---

## Performance Impact

**Positive:**
- ✅ Reduces Claude API calls for weak transcripts
- ✅ Saves cost (no API call for LOW quality)
- ✅ Faster response for templates (~0ms vs 2000ms)

**Neutral:**
- Templates are instant (no latency)
- Routing calculation is fast (<10ms)

**Monitoring:**
- Track routing decisions (HIGH/MEDIUM/LOW %)
- Track template usage rate
- Track skip rate for LOW quality

---

## Success Metrics (Targets)

**Maintain from v1.0:**
- ActionabilityRate >= 70% (was 100%)
- RawVsFinalDelta <= 10%

**New Metrics:**
- Routing Distribution:
  - HIGH: 40-60% of transcripts
  - MEDIUM: 20-40% of transcripts
  - LOW (skipped): 10-30% of transcripts

- Template Usage:
  - Used for: 5-15% of total insights
  - Success rate: 100% (always specific)

- Skip Rate:
  - 10-30% of low-quality transcripts skipped
  - Per "no insight" preference

---

## Testing Plan

**Test Case 1: Rich Transcript (HIGH)**
- Input: "Playing Valorant on RTX 4090..."
- Expected Score: HIGH (11 points)
- Expected Route: Claude
- Expected Output: Specific Claude insight

**Test Case 2: Medium Transcript (MEDIUM)**
- Input: "Cooking pasta with sauce and cheese..."
- Expected Score: MEDIUM (5 points)
- Expected Route: Claude first, template if fails
- Expected Output: Claude or template insight

**Test Case 3: Weak Transcript (LOW)**
- Input: "yeah um like okay cool so yeah..."
- Expected Score: LOW (0 points)
- Expected Route: Skip
- Expected Output: null (no insight shown)

**Test Case 4: Template Fallback**
- Input: Medium transcript + Claude timeout
- Expected: Template selected from appropriate category
- Expected Output: Specific template action

---

## Rollback Plan

**If ActionabilityRate drops below 70%:**

**Option A:** Adjust thresholds
```javascript
// Make HIGH threshold lower
if (score >= 6) return "HIGH";  // was 8
```

**Option B:** Disable routing
```javascript
// Skip routing, always use Claude
const transcriptScore = { tier: 'HIGH' };
```

**Option C:** Full revert
```bash
git checkout v1.0
```

---

## Files Modified/Created

**Created (2 files):**
1. `/app/frontend/extension/templateBank.js` - 30 templates + selector
2. `/app/TEST_TRANSCRIPTS_LIBRARY.js` - 20 test transcripts

**Modified (4 files):**
3. `/app/frontend/extension/correlationEngine.js` - Routing + scoring logic
4. `/app/frontend/extension/sidepanel.html` - v1.1
5. `/app/frontend/extension/sidepanel.js` - v1.1
6. `/app/frontend/extension/manifest.json` - v1.1.0

---

## Status

✅ Implementation complete  
✅ Syntax validated  
✅ Ready for testing  

**Version:** 1.1-ROUTING-MVP  
**Features:** Transcript scoring, 30 templates, intelligent routing  
**Risk:** Low (maintains current quality, adds fallback)  

**Next:** Test with live streams to verify routing decisions
