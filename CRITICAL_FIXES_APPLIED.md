# Critical Fixes Applied - Spikely v2.9.1

## Executive Summary

Fixed **3 critical bugs** causing audio capture to hang on "Processing..." indefinitely:

1. ✅ **Duplicate Message Handlers** - Removed conflicting START_AUDIO handler
2. ✅ **Missing Global Function** - Moved `ensureOffscreen()` to global scope  
3. ⚠️ **Missing Null Check** - Needs manual fix in sidepanel.js (line 1827)

## Detailed Changes

### File: `/frontend/extension/background.js`

#### Change 1: Added Global `ensureOffscreen()` Helper
**Location**: After line 30 (after `stopKeepAlive()`)

**Purpose**: Ensure offscreen document exists before audio capture

```javascript
// ==================== OFFSCREEN DOCUMENT HELPER ====================
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
    } else {
      console.log('[BG] ✅ Offscreen document already exists');
    }
  } catch (error) {
    if (error.message.includes('Only a single offscreen')) {
      console.log('[BG] ✅ Offscreen document already exists (caught exception)');
    } else {
      throw error;
    }
  }
}
// =================================================================
```

#### Change 2: Removed Duplicate START_AUDIO Handler
**Location**: Lines 544-718 (removed ~175 lines)

**Reason**: Two handlers were racing, causing unpredictable behavior

**Kept**: The second handler (now starting at line 544) which has:
- Better error handling
- RequestId tracking
- Activation hop for activeTab permission
- Proper timeout management
- Comprehensive diagnostics

### File: `/frontend/extension/sidepanel.js` (NEEDS MANUAL FIX)

#### Change 3: Add Null Response Check
**Location**: Line 1827 (after `clearTimeout(watchdog)`)

**Current Code**:
```javascript
}, (response) => {
  clearTimeout(watchdog);
  
  if (chrome.runtime.lastError) {
    // ... error handling
  }
  
  if (response?.ok) {  // ❌ PROBLEM: Doesn't check if response is null first
    // ... success handling
```

**Fixed Code**:
```javascript
}, (response) => {
  clearTimeout(watchdog);
  
  console.log('[AUDIO:SP] 📨 Response received:', response);
  
  if (chrome.runtime.lastError) {
    console.error('[AUDIO:SP] ❌ FAILED code=RUNTIME_ERROR msg=' + chrome.runtime.lastError.message);
    updateAudioState(false);
    startAudioBtn.disabled = false;
    startAudioBtn.textContent = 'Try Again';
    isSystemStarted = false;
    
    alert('⚠️ Extension Error\\n\\n' + chrome.runtime.lastError.message);
    return;
  }
  
  // ✅ ADD THIS NULL CHECK:
  if (!response) {
    console.error('[AUDIO:SP] ❌ FAILED code=NO_RESPONSE msg=Background did not respond');
    updateAudioState(false);
    startAudioBtn.disabled = false;
    startAudioBtn.textContent = 'Try Again';
    isSystemStarted = false;
    
    alert('⚠️ No Response\\n\\nBackground script did not respond. Try reloading the extension.');
    return;
  }
  
  if (response?.ok) {
    // ... existing success handling
```

## Why These Fixes Work

### Problem: "Processing..." Hang

**Root Cause Chain**:
1. User clicks "Start Audio" → sidepanel sends START_AUDIO message
2. Background receives message → **TWO handlers fire simultaneously**
3. First handler starts async work but doesn't complete properly
4. Second handler also starts async work
5. Race condition: responses conflict or get lost
6. Sidepanel never receives valid response → hangs on "Processing..."

**Fix Chain**:
1. ✅ Removed first handler → Only one handler processes message
2. ✅ Global `ensureOffscreen()` → No crashes during setup
3. ⚠️ Null check → Graceful failure if response missing

### MV3 Compliance

The remaining START_AUDIO handler follows MV3 best practices:

1. **User Gesture Preservation**
   - Tracks gesture timestamp
   - Completes within 1.5s window
   - Uses activation hop for activeTab permission

2. **Async Response Handling**
   - Returns `true` to keep message channel open
   - Sends response via `sendResponse()` callback
   - Includes diagnostics for debugging

3. **Error Recovery**
   - Timeout watchdog (3s for capture, 6s total)
   - Auto-retry once on failure
   - Clear error codes for user feedback

## Testing Checklist

### Pre-Test Setup
- [ ] Reload extension: `chrome://extensions` → Spikely → Reload
- [ ] Open TikTok Live stream in new tab
- [ ] Ensure tab is focused (click on it)
- [ ] Open Spikely sidepanel (click extension icon)

### Test 1: Successful Capture
**Steps**:
1. Click "Start Audio" button
2. Watch console logs (both sidepanel and service worker)
3. Wait 2-3 seconds

**Expected**:
- Button changes to "Stop Audio"
- Console shows: `[AUDIO:SP] ✅ STARTED streamId=...`
- No "Processing..." hang
- No error alerts

**If Fails**:
- Check service worker console for errors
- Verify TikTok tab is focused
- Try clicking TikTok tab once, then retry

### Test 2: Error Handling
**Steps**:
1. Navigate to `chrome://extensions`
2. Click "Start Audio" button

**Expected**:
- Alert: "Chrome pages can't be captured"
- Button shows "Try Again"
- No hang

### Test 3: Timeout Recovery
**Steps**:
1. Open TikTok Live but don't focus tab
2. Click "Start Audio"
3. Wait 6 seconds

**Expected**:
- Alert: "Audio Capture Timed Out"
- Button shows "Try Again"
- No infinite "Processing..."

### Test 4: Viewer Count Detection
**Steps**:
1. After successful audio capture
2. Open TikTok Live tab console
3. Run: `window.__SPIKELY_TEST__()`

**Expected**:
- Returns viewer count object: `{count: 127, delta: 0, ...}`
- Console shows: `[SPIKELY] 👀 Viewer Count: 127`

## Console Log Reference

### Successful Flow
```
[AUDIO:SP] ▶ START click
[AUDIO:SP] ⏳ waiting response requestId=1730000000000-abc123
[AUDIO:BG] ▶ START requestId=1730000000000-abc123
[AUDIO:BG] 🔎 targetTab url=https://www.tiktok.com/@user/live focused=true eligible=true
[AUDIO:BG] 🪄 activation-hop starting...
[AUDIO:BG] 🪄 activation-hop injected ok
[BG] ✅ Offscreen document already exists
[AUDIO:BG] 🟢 tabCapture starting...
[AUDIO:BG] 🟢 tabCapture OK with capture options
[AUDIO:BG] ✅ Audio capture complete for requestId=1730000000000-abc123
[AUDIO:SP] 📨 Response received: {ok: true, streamId: "...", tabId: 123, diagnostics: {...}}
[AUDIO:SP] ✅ STARTED streamId=...
```

### Error Flow (Chrome Page)
```
[AUDIO:SP] ▶ START click
[AUDIO:BG] ▶ START requestId=...
[AUDIO:BG] ❌ tabCapture FAIL code=CHROME_PAGE_BLOCKED
[AUDIO:SP] 📨 Response received: {ok: false, code: "AUDIO_ERR_CHROME_PAGE_BLOCKED", message: "..."}
[AUDIO:SP] ❌ FAILED code=AUDIO_ERR_CHROME_PAGE_BLOCKED msg=Chrome pages cannot be captured
```

### Timeout Flow
```
[AUDIO:SP] ▶ START click
[AUDIO:BG] ▶ START requestId=...
[AUDIO:BG] 🔎 targetTab url=...
[AUDIO:BG] 🪄 activation-hop starting...
[AUDIO:BG] 🟢 tabCapture starting...
[AUDIO:BG] ❌ tabCapture FAIL code=TIMEOUT
[AUDIO:SP] 📨 Response received: {ok: false, code: "AUDIO_ERR_TIMEOUT", message: "..."}
[AUDIO:SP] ❌ FAILED code=AUDIO_ERR_TIMEOUT msg=Chrome didn't grant capture in time
```

## Known Issues & Workarounds

### Issue 1: "Not invoked for current page"
**Symptom**: Error even when on TikTok Live
**Cause**: Tab not focused or user gesture expired
**Workaround**: Click TikTok tab once, then immediately click "Start Audio"

### Issue 2: Service Worker Goes to Sleep
**Symptom**: Audio stops after 30 seconds
**Status**: Mitigated by keep-alive heartbeat
**Workaround**: If happens, click "Stop Audio" then "Start Audio" again

### Issue 3: Viewer Count Shows 0
**Symptom**: Viewer count displays 0 instead of actual count
**Status**: Separate issue, not fixed in this PR
**Next Steps**: Debug DOM selector in content_minimal.js

## Version Update

Update `manifest.json`:
```json
{
  "version": "2.9.1",
  ...
}
```

## Rollback Instructions

If critical issues arise:

```bash
# Rollback background.js
git checkout HEAD~1 frontend/extension/background.js

# Or restore from specific commit
git log --oneline frontend/extension/background.js
git checkout <commit-hash> frontend/extension/background.js
```

## Next Phase: Viewer Count Fix

After audio capture is stable, address viewer count detection:

1. Inspect TikTok Live DOM structure
2. Update selectors in content_minimal.js
3. Test with various viewer count formats (127, 2.1K, 15.3K, etc.)
4. Add fallback patterns for different TikTok layouts

## Support & Debugging

### Enable Verbose Logging
In `background.js`, set:
```javascript
const DEBUG_HUME = true; // Already enabled
```

### Check Extension Context
```javascript
// In service worker console:
chrome.runtime.getContexts({}).then(console.log)
```

### Verify Permissions
```javascript
// In service worker console:
chrome.permissions.getAll().then(console.log)
```

### Test TabCapture Availability
```javascript
// In service worker console:
console.log('tabCapture available:', !!chrome.tabCapture)
console.log('tabCapture.capture:', typeof chrome.tabCapture?.capture)
```

---

**Status**: ✅ Ready for Testing
**Priority**: P0 - Critical Path Blocker
**Estimated Fix Time**: 2-3 minutes (manual sidepanel.js edit)
**Testing Time**: 5-10 minutes
