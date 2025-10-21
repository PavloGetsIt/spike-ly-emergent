# Correlation Engine - FastAPI Integration Summary

## Overview

Migrated correlation engine from Supabase to FastAPI backend for easier deployment and maintenance.

---

## Changes Made

### Backend
- Added `/api/generate-insight` endpoint to FastAPI
- Integrated Claude Sonnet 4.5 API for tactical insights
- Added anthropic library to requirements.txt
- Claude API key stored securely in backend/.env (not tracked by Git)

### Frontend
- Updated correlationEngine.js to call FastAPI backend
- Changed from Supabase URL to Emergent backend URL
- Enabled ENABLE_EXTENSION_AI flag
- Dynamic threshold based on sensitivity slider

---

## Insight Format

**Tactical prompts with emotional cues:**

Examples:
- "Ask about their setups. Stay hyped"
- "Show product closeup. Stay excited"
- "Pivot to giveaway. Build excitement"
- "Ask their stories. Be authentic"

---

## Testing

**Endpoint:** `POST /api/generate-insight`

**Test with:**
```bash
curl -X POST https://stream-insights-2.preview.emergentagent.com/api/generate-insight \
  -H "Content-Type: application/json" \
  -d '{"transcript": "test", "viewerDelta": 10, "viewerCount": 100, "prevCount": 90}'
```

**In Chrome Extension:**
1. Reload extension
2. Start audio on live stream
3. Wait for viewer changes (±3 or more based on sensitivity)
4. Check console for Claude API calls
5. Verify blue card shows tactical insights

---

## Security

✅ All API keys stored in `.env` files
✅ `.env` files in `.gitignore`
✅ No secrets in tracked files
✅ Documentation contains no sensitive data

---

## Files Modified

- `/app/backend/server.py`
- `/app/backend/requirements.txt`
- `/app/backend/.env`
- `/app/frontend/extension/correlationEngine.js`
- `/app/frontend/extension/sidepanel.js`

---

**Status:** Fully deployed and ready to test!
