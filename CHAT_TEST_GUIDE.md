# 🧪 Quick Testing Guide - Chat Stream Detection

## 30-Second Test

```bash
# 1. Go to any TikTok Live stream
# 2. Open DevTools Console (F12)
# 3. Run:
window.__SPIKELY_TEST_CHAT__()
```

**Expected Output:**
```
============================================================
🧪 SPIKELY CHAT DETECTION TEST
============================================================
✅ SUCCESS! Found chat container
   Element: DIV
   Classes: live-chat-list-container ...
   Children count: 47
   Current buffer: 0 comments
   Selector "[data-e2e='live-chat-list']": found 1 comments
   Comment 1: user123 → hello everyone!
   Comment 2: user456 → nice stream
   Comment 3: user789 → what song is this?
✅ Successfully parsed 3 comments

📊 Chat tracking status: INACTIVE
💡 Run startChatTracking() to begin tracking
============================================================
```

## 2-Minute Full Test

### Step 1: Start Tracking
1. Load extension in Chrome
2. Go to active TikTok Live (with chat activity)
3. Click "Start Audio" button

### Step 2: Watch Console Logs

**Expected logs:**
```
[CHAT] 🚀 Starting chat stream tracking...
[CHAT] ✅ Setting up observer on container
[CHAT] 👀 Observer active, watching for comments...

# As comments appear:
[CHAT] 💬 user123: hello everyone!
[CHAT] 💬 user456: nice stream
[CHAT] 💬 user789: what song is this?

# Every 2 seconds:
[CHAT] 📤 Emitted batch: 3 comments, rate: 6/min

# In background console:
[CHAT:BG:RX] CHAT_STREAM_UPDATE { commentCount: 3, chatRate: 6, platform: 'tiktok' }
[CHAT:BG] Sample: user123: hello everyone! | user456: nice stream | ...
```

### Step 3: Verify Insight Integration

**Wait for insight to be generated (viewer change or timer), then check:**

```
# In main console:
[Correlation] Chat stream updated: 3 new comments, rate: 6/min, buffer: 15
🤖 Calling Claude | CID: 1737... | Delta: +5 | Keywords: song, dance | Chat: 15 comments

# Insight should reference chat if relevant:
✅ Emotional Label: song request spike
✅ Next Move: Answer 'what song is this'. Name it now
```

## Common Issues & Fixes

### ❌ "No chat container found"

**Cause:** TikTok DOM changed or you're not on a Live page

**Fix:**
1. Make sure you're on `tiktok.com/@username/live` (not regular video)
2. Inspect chat area → Right-click → Inspect
3. Find scrollable container with comments
4. Copy class names
5. Update `CHAT_SELECTORS.tiktok.containers` in `content.js`

### ❌ "Found container but could not parse"

**Cause:** Comment element structure changed

**Fix:**
1. Inspect a single comment element
2. Find username element (copy class)
3. Find text element (copy class)
4. Update `CHAT_SELECTORS.tiktok.usernames` and `.text` in `content.js`

### ❌ Chat tracking not starting

**Cause:** Platform not supported or tracking already active

**Fix:**
1. Check console for: `[CHAT] Already tracking`
2. Run: `stopChatTracking()` then `startChatTracking()`
3. Verify platform is 'tiktok' (run `detectPlatform()`)

### ❌ Comments not reaching Claude

**Cause:** Integration issue in data flow

**Fix:**
1. Check console for all 3 logs:
   - `[CHAT] 📤 Emitted batch` (content.js working)
   - `[CHAT:BG:RX]` (background.js receiving)
   - `[Correlation] Chat stream updated` (engine receiving)
2. If any missing, check that file's console
3. Verify `chatData` in network tab `/api/generate-insight` request

## Success Checklist

- [ ] Test command shows found container ✅
- [ ] Test command parses 3+ comments ✅
- [ ] Start Audio begins chat tracking ✅
- [ ] Comments appear in console as posted ✅
- [ ] Batch emitted every 2 seconds ✅
- [ ] Background receives CHAT_STREAM_UPDATE ✅
- [ ] Correlation engine logs chat update ✅
- [ ] Claude insight references chat context ✅

## Performance Check

**Monitor these metrics during 10-minute test:**

- **CPU:** Should stay under 5% (check Task Manager)
- **Memory:** Should stay under 100 MB total
- **Comments buffered:** Should max at ~200
- **No errors:** Check for red console errors
- **Latency:** Comments should appear < 500ms after posting

## Next Steps After Testing

Once chat detection is confirmed working:

1. ✅ Test on 3+ different TikTok streams
2. ✅ Verify insights reference viewer questions
3. ✅ Check correlation: chat spike → viewer spike
4. ✅ Move to Phase 1 Priority 2: Hearts/Gifts detection

---

**Version:** 1.0  
**Testing Time:** 2-10 minutes  
**Difficulty:** Easy  
**Status:** Ready for testing
