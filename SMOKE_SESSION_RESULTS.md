# Smoke Session Results Log
# Version: 028-SMOKE-TEST
# Date: 2025-10-24
# Session Duration: TBD

## Session Configuration
- Claude Timeout: 3000ms
- Backend Validator: DISABLED
- Frontend Sanitizer: DISABLED (removed v021)
- CorrelationId: ENABLED (timestamp-sequence format)
- Total Clips: 20 (10 rich, 10 weak)

---

## Test Results

### Sample 1 - RICH-001 (Valorant Gaming)
**CorrelationId:** TBD  
**Timestamp:** TBD  
**Transcript:** "I'm playing Valorant on my brand new RTX 4090..."  
**NounCount:** 7  
**Keywords:** [gaming, tech]  
**ViewerDelta:** +15  
**Latency:** TBD  

**Raw Claude Output:**
```
TBD - Will be captured from backend logs
```

**Pre-Sanitizer:** N/A (disabled)

**Final UI Output:**
```
TBD - Will be captured from extension console
```

**Match:** TBD (YES/NO)

**Human QA Rating:**
- Actionable? (yes/no): TBD
- Specific? (yes/no): TBD
- Would streamer execute it? (yes/no): TBD
- Score: TBD/3

---

### Sample 2 - RICH-002 (Makeup Tutorial)
[Same format, TBD]

---

### Sample 3 - RICH-003 (Cooking Recipe)
[Same format, TBD]

---

### Sample 4 - RICH-004 (Tech Unboxing)
[Same format, TBD]

---

### Sample 5 - RICH-005 (Fitness Workout)
[Same format, TBD]

---

### Sample 6 - WEAK-001 (Filler Words)
**CorrelationId:** TBD  
**Timestamp:** TBD  
**Transcript:** "yeah um like okay cool so yeah I mean like you know..."  
**NounCount:** 0  
**Keywords:** []  
**ViewerDelta:** -3  
**Latency:** TBD  

**Raw Claude Output:**
```
TBD
```

**Final UI Output:**
```
TBD
```

**Match:** TBD

**Human QA Rating:**
- Actionable? (yes/no): TBD
- Specific? (yes/no): TBD
- Would streamer execute it? (yes/no): TBD
- Score: TBD/3

---

### Sample 7 - WEAK-002
[Same format, TBD]

---

### Sample 8 - WEAK-003
[Same format, TBD]

---

### Sample 9 - WEAK-004
[Same format, TBD]

---

### Sample 10 - WEAK-005
[Same format, TBD]

---

## Aggregate Metrics

**ActionabilityRate:** TBD% (X/10 rated actionable)  
**RawVsFinalDelta:** TBD% (X/10 modified between raw and UI)  
**Latency90:** TBD ms  
**SpikeLift10s:** TBD  
**SpikeLift30s:** TBD  
**FailureReasons:** TBD  

---

## Analysis & Findings

**Pattern Observed:** TBD

**Raw Claude Quality:**
- Rich transcripts: TBD
- Weak transcripts: TBD

**UI Transformation:**
- Modifications detected: TBD
- Sanitizer impact: TBD

---

## Recommendation

**Next Action:** TBD after analysis

**Options:**
A. Fix UI transformer (if raw good, UI bad)
B. Implement transcript routing + templates (if raw bad)
C. Re-enable validators (if working correctly)
D. Continue tuning prompts

**Selected:** TBD

---

## QA Rating Summary

**Rated by:** User  
**Total Rated:** 10 samples (5 rich, 5 weak)  
**Pass Criteria:** 3/3 on all questions  

**Results:**
- Perfect scores (3/3): TBD
- Partial scores (2/3): TBD
- Failed scores (0-1/3): TBD

**Overall Quality:** TBD%

---

**Status:** Template created, awaiting test session data
