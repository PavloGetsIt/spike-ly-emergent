# Quick Test Guide - Spikely v2.9.1

## 🚀 2-Minute Test

### 1. Load Extension
```
chrome://extensions → Developer mode ON → Load unpacked → Select: /vercel/sandbox/frontend/extension
```

### 2. Open TikTok Live
Navigate to any live stream: `https://www.tiktok.com/@username/live`

### 3. Open Sidepanel
Press `Ctrl+Shift+S` or click extension icon

### 4. Start Audio
Click "Start Audio" button

### ✅ Success Indicators
- Button shows "Processing..." for <2 seconds
- Chrome permission popup (first time)
- Button changes to "Stop Audio" 🎤
- Recording indicator pulses

### ❌ Failure Indicators
- Button stuck on "Processing..." >6 seconds
- Alert: "Audio Capture Timed Out"
- Button becomes "Try Again"

---

## 🔍 Console Checks

### Sidepanel Console
```javascript
// Should see:
[AUDIO:SP] ▶ START click
[AUDIO:SP] ⏳ waiting response requestId=...
[AUDIO:SP] ✅ STARTED streamId=...
```

### Background Console
```javascript
// Should see:
[AUDIO:BG] ▶ START requestId=...
[AUDIO:BG] 🔎 targetTab url=... eligible=true
[AUDIO:BG] 🪄 activation-hop injected ok
[AUDIO:BG] 🟢 tabCapture OK with capture options
[AUDIO:BG] ✅ Audio capture complete for requestId=...
```

---

## 🐛 Quick Fixes

### Stuck on "Processing..."
1. Reload extension: `chrome://extensions` → Reload
2. Close and reopen sidepanel
3. Focus TikTok tab, then retry

### "Chrome pages can't be captured"
- Navigate to TikTok Live (not chrome:// pages)

### "No active tab found"
- Ensure TikTok tab is open
- Reopen sidepanel from that tab

---

## 🧪 Diagnostic Test

### Run in Sidepanel Console:
```javascript
// Copy/paste test_audio_capture.js contents, then:
__SPIKELY_AUDIO_TESTS__.runAll()
```

### Expected Output:
```
✅ tabEligibility: PASS
✅ offscreenDocument: PASS
✅ permissions: PASS
✅ dryRun: PASS

✅ ALL TESTS PASSED
```

---

## 📊 What Changed in v2.9.1

1. ✅ Removed duplicate START_AUDIO handlers
2. ✅ Added global ensureOffscreen() function
3. ✅ Fixed async response channel handling
4. ✅ Improved error messages

---

## 🎯 Next: Test Viewer Count

After audio works, test viewer detection:

```javascript
// In TikTok Live page console:
window.__SPIKELY_TEST__()

// Expected:
{
  count: 127,
  delta: 0,
  pattern: "Viewers • 127"
}
```

---

**Version**: 2.9.1  
**Test Time**: 2 minutes  
**Status**: Ready ✅
