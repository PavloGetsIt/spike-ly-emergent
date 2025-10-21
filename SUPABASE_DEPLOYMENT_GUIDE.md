# Supabase Edge Function Deployment Guide

## Deploying the Updated generate-insight Function

The correlation engine improvements require deploying the updated Supabase edge function.

---

## Prerequisites

1. **Supabase CLI installed** on your local machine
   ```bash
   # Install if needed
   npm install -g supabase
   ```

2. **Logged in to Supabase**
   ```bash
   supabase login
   ```

---

## Deployment Commands

### Step 1: Navigate to Project Directory
```bash
cd /Users/thebusko/Documents/GitHub/spike-ly-emergent/frontend
```

### Step 2: Deploy the Function
```bash
supabase functions deploy generate-insight --project-ref hnvdovyiapkkjrxcxbrv
```

### Step 3: Set the Claude API Key Secret
```bash
supabase secrets set ANTHROPIC_API_KEY=YOUR_CLAUDE_API_KEY_HERE --project-ref hnvdovyiapkkjrxcxbrv
```

---

## Alternative: Set Secret via Dashboard

1. Go to: https://supabase.com/dashboard/project/hnvdovyiapkkjrxcxbrv/settings/functions
2. Click on "Edge Function Secrets" or "Secrets"
3. Add new secret:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Value:** `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`
4. Save

---

## Verification

### Check Deployment Status:
```bash
supabase functions list --project-ref hnvdovyiapkkjrxcxbrv
```

Should show `generate-insight` with recent deployment timestamp.

### Test the Function:
```bash
curl -X POST https://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/generate-insight \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Hey guys check out this new game its so cool",
    "viewerDelta": 15,
    "viewerCount": 200,
    "prevCount": 185,
    "topic": "gaming"
  }'
```

**Expected Response:**
```json
{
  "emotionalLabel": "gaming talk wins",
  "nextMove": "Show gameplay. Keep energy high"
}
```

---

## Monitoring

### View Function Logs:
1. Go to: https://supabase.com/dashboard/project/hnvdovyiapkkjrxcxbrv/functions
2. Click on `generate-insight`
3. View "Logs" tab
4. Monitor for:
   - `🤖 CALLING CLAUDE API`
   - `✅ CLAUDE INSIGHT GENERATED`
   - Any errors

---

## Expected Behavior After Deployment

### In Chrome Extension Console:
```
[AI:GATE] delta: 8, minDelta: 7, isHighImpact: true, willCallAI: true
🤖 CALLING CLAUDE API FOR INSIGHT (Extension)
🤖 Viewer Delta: +8
🤖 Transcript: "talking about makeup tutorial..."
✅ CLAUDE INSIGHT RECEIVED (Extension)
✅ Response Time: 850 ms
✅ Emotional Label: makeup demo spikes
✅ Next Move: Show closeup. Stay excited
```

### On Blue Card (Side Panel):
```
+8 ↑

makeup demo spikes

Show closeup. Stay excited

"talking about makeup tutorial..."

🔍 Watching for changes...
```

---

## Troubleshooting

### Issue: "ANTHROPIC_API_KEY is not configured"
**Solution:** Run the secrets set command or add via dashboard

### Issue: Claude API returns 401 Unauthorized
**Solution:** Verify API key is valid and has sufficient credits

### Issue: Insights still generic/fallback
**Solution:** 
- Check function logs for errors
- Ensure ENABLE_EXTENSION_AI = true in correlationEngine.js
- Verify deployment was successful

### Issue: No insights appearing
**Solution:**
- Check viewer delta is >= sensitivity threshold
- Verify audio is capturing (transcripts coming through)
- Check 20-second cooldown hasn't blocked insights

---

## Rollback Instructions

If issues occur, revert to fallback mode:

```javascript
// In /app/frontend/extension/correlationEngine.js
const ENABLE_EXTENSION_AI = false;  // Disable Claude calls
```

This will use deterministic template-based insights until issues are resolved.

---

## Cost Monitoring

**Claude Sonnet 4.5 Pricing:**
- Input: $3 per million tokens
- Output: $15 per million tokens

**Expected Usage:**
- ~500 tokens per insight
- ~1-3 insights per minute
- ~100-200 insights per hour stream
- Cost: ~$0.50-$1.00 per hour of streaming

Monitor usage in Anthropic dashboard: https://console.anthropic.com/

---

## Next Steps

1. ✅ Deploy edge function (use commands above)
2. ✅ Set API key secret in Supabase
3. ✅ Reload Chrome extension
4. ✅ Test on live stream
5. ✅ Monitor console for Claude API calls
6. ✅ Verify blue card shows tactical insights

**After successful deployment, the correlation engine will provide much more actionable, specific, and helpful insights!**
