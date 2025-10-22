# Known Issues & Fixes

## Issue 1: Rate Limited Error

**Symptoms:**
- Blue card shows "Failed - Rate limited"
- Console shows rate limit errors from Hume AI or AssemblyAI

**Cause:**
- Hume AI free tier: 20 requests per month
- AssemblyAI rate limits on concurrent connections

**Temporary Solution:**
Add to backend to skip Hume AI if rate limited and still generate insights from transcript only.

---

## Issue 2: Slider Threshold Not Respected

**Symptoms:**
- Slider set to ±1
- Insights trigger for +4, +7 changes
- Should only trigger for ±1

**Cause:**
Need to investigate if minDelta is being synced properly from slider to correlation engine.

---

## Issue 3: Insights Not Displaying

**Symptoms:**
- Blue card stuck on "Collecting..." or "Analyzing viewer patterns"
- Claude generates insights in backend
- Insights don't reach blue card UI

**Cause:**
- Message passing issue between background.js and sidepanel.js
- OR insight data format mismatch
- OR sanitization stripping data

**Added debugging to trace the issue.**

---

## Next Steps

1. Handle rate limiting gracefully (skip Hume AI, use transcript only)
2. Debug slider threshold sync issue
3. Trace insight message flow with new logging
4. Test and verify fixes

