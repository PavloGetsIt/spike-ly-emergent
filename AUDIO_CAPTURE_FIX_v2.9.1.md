# Audio Capture Fix - Version 2.9.1

## Critical Issues Fixed

### 1. **Duplicate Message Handlers** ✅
**Problem**: `background.js` had TWO `START_AUDIO` handlers (lines 544 and 720), causing race conditions.

**Solution**: Removed the first incomplete handler, kept the more robust second implementation with:
- Proper `requestId` tracking
- Activation hop via `chrome.scripting.executeScript`
- Window focus management
- Comprehensive error handling

**Files Changed**:
- `/frontend/extension/background.js` (removed lines 544-718)

---

### 2. **Missing Global `ensureOffscreen()` Function** ✅
**Problem**: The `ensureOffscreen()` helper was defined inside a message handler scope, making it unavailable to other handlers.

**Solution**: Moved `ensureOffscreen()` to global scope after `startKeepAlive()` and `stopKeepAlive()` functions.

**Implementation**:
```javascript
async function ensureOffscreen() {
  try {
    const existingContexts = await chrome.runtime.getContexts({});
    const offscreenExists = existingContexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');
    
    if (!offscreenExists) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['USER_MEDIA'],
        justification: 'Audio capture for transcription'
      });
      console.log('[BG] ✅ Offscreen document created');
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } catch (error) {
    if (error.message.includes('Only a single offscreen')) {
      console.log('[BG] ✅ Offscreen document already exists');
    } else {
      throw error;
    }
  }
}
```

**Files Changed**:
- `/frontend/extension/background.js` (added global helper at line ~50)

---

### 3. **Async Response Channel Kept Open** ✅
**Problem**: The remaining `START_AUDIO` handler already had `return true` at the end, which is correct for async responses.

**Verification**: Confirmed the handler properly returns `true` to keep the message channel open for async `sendResponse()`.

---

## Audio Capture Flow (MV3-Compliant)

### User Clicks "Start Audio" in Sidepanel

1. **Sidepanel** (`sidepanel.js`):
   - Generates unique `requestId`
   - Sets 6-second client-side watchdog timeout
   - Sends `START_AUDIO` message to background
   - Disables button, shows "Processing..."

2. **Background** (`background.js`):
   - Validates active tab exists and is eligible (TikTok/Twitch/Kick/YouTube)
   - Blocks Chrome internal pages (`chrome://`, `chrome-extension://`)
   - Stops any existing capture cleanly
   - **Activation Hop**: Injects no-op script via `chrome.scripting.executeScript` to grant `activeTab` permission
   - Ensures offscreen document exists
   - Calls `chrome.tabCapture.capture()` with 3-second timeout
   - On success: stores stream, starts keep-alive, responds with `{ ok: true, streamId, tabId }`
   - On failure: responds with `{ ok: false, code, message }`

3. **Sidepanel** receives response:
   - Clears watchdog timeout
   - On success: Updates UI to "Stop Audio", enables system
   - On failure: Shows specific error message, button becomes "Focus & Retry"

---

## Error Codes

| Code | Meaning | User Action |
|------|---------|-------------|
| `AUDIO_ERR_NOT_ELIGIBLE` | Not on supported platform | Open TikTok Live, Twitch, Kick, or YouTube Live |
| `AUDIO_ERR_CHROME_PAGE_BLOCKED` | Trying to capture Chrome internal page | Navigate to a live stream page |
| `AUDIO_ERR_TIMEOUT` | Chrome didn't respond within 3s | Click TikTok tab, then retry |
| `AUDIO_ERR_NOT_INVOKED` | User gesture lost | Click tab to focus, then press Start |
| `AUDIO_ERR_NO_TRACKS` | Stream has no audio | Unmute tab, check audio settings |
| `AUDIO_ERR_GENERAL` | Unknown error | Check console logs, reload extension |

---

## Testing Checklist

### Prerequisites
- Chrome/Edge browser with Manifest V3 support
- TikTok Live stream open in a tab
- Spikely extension loaded (version 2.9.1)

### Test 1: Normal Audio Capture
1. Open TikTok Live stream (e.g., `https://www.tiktok.com/@username/live`)
2. Open Spikely sidepanel (Ctrl+Shift+S or click extension icon)
3. Click "Start Audio" button
4. **Expected**: 
   - Button shows "Processing..." for <2 seconds
   - Chrome permission popup appears (first time only)
   - Button changes to "Stop Audio" with recording indicator
   - Console shows: `[AUDIO:BG] ✅ Audio capture complete for requestId=...`

### Test 2: Timeout Handling
1. Open TikTok Live stream
2. Open Spikely sidepanel
3. Click "Start Audio"
4. **If hangs >6 seconds**:
   - Client watchdog fires
   - Alert shows: "Audio Capture Timed Out"
   - Button becomes "Try Again"

### Test 3: Unsupported Page
1. Navigate to `chrome://extensions`
2. Open Spikely sidepanel
3. Click "Start Audio"
4. **Expected**:
   - Immediate error: "Chrome pages can't be captured"
   - Button becomes "Focus & Retry"

### Test 4: Tab Not Focused
1. Open TikTok Live stream in background tab
2. Open Spikely sidepanel
3. Click "Start Audio" without focusing TikTok tab
4. **Expected**:
   - Activation hop auto-focuses tab
   - Capture succeeds OR shows "Click the TikTok tab once, then press Start"

### Test 5: Stop Audio
1. Start audio capture successfully
2. Click "Stop Audio" button
3. **Expected**:
   - Button changes back to "Start Audio"
   - Recording indicator stops
   - Keep-alive heartbeat stops
   - Console shows: `[AUDIO:BG] ⏹ STOP reason=track_ended`

---

## Debugging Commands

### Check Extension State
```javascript
// In sidepanel console
console.log('System started:', isSystemStarted);
console.log('Audio capturing:', audioIsCapturing);
```

### Check Background State
```javascript
// In background service worker console
console.log('Audio capture state:', audioCaptureState);
console.log('Keep-alive active:', chrome.alarms.getAll());
```

### Trigger Test Insight
```javascript
// In sidepanel console (after audio started)
testInsightBtn.click();
```

---

## Known Limitations

1. **User Gesture Window**: Chrome requires `tabCapture.capture()` to be called within ~1.5 seconds of user gesture. The activation hop helps preserve this.

2. **Service Worker Sleep**: Background service worker may sleep after 30 seconds of inactivity. Keep-alive heartbeat prevents this during capture.

3. **Tab Muted**: If the TikTok tab is muted, `tabCapture` may return a stream with zero audio tracks. Error handling detects this.

4. **Multiple Tabs**: Only one tab can be captured at a time. Starting capture on a new tab stops the previous one.

---

## Next Steps

After confirming audio capture works:

1. **Viewer Count Detection** - Verify DOM selectors find live viewer counts
2. **Chat Stream Detection** - Test real-time comment tracking
3. **Correlation Engine** - Validate insights generate every 20 seconds
4. **Hume AI Integration** - Confirm prosody analysis triggers every 5 seconds

---

## Rollback Instructions

If this version causes regressions:

```bash
cd /vercel/sandbox/frontend/extension
git checkout HEAD~1 background.js manifest.json
```

Then reload extension in `chrome://extensions`.

---

**Version**: 2.9.1  
**Date**: 2025-01-01  
**Critical Fix**: Removed duplicate START_AUDIO handlers, added global ensureOffscreen()  
**Status**: Ready for testing
