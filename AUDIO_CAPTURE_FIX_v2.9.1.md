# Audio Capture Fix - v2.9.1

## Root Cause Analysis

After deep analysis of the codebase, I've identified **3 critical bugs** causing the "Processing..." hang:

### Bug #1: Duplicate Message Handlers ✅ FIXED
- **Location**: `background.js` had TWO `START_AUDIO` handlers (lines 544 and 720)
- **Impact**: Race conditions, unpredictable behavior, responses sent to wrong handler
- **Fix**: Removed first duplicate handler, kept the more complete second one

### Bug #2: Missing Offscreen Helper Function ✅ FIXED  
- **Location**: `ensureOffscreen()` was defined inside message handler scope
- **Impact**: Function unavailable in some execution paths, causing crashes
- **Fix**: Moved `ensureOffscreen()` to global scope after `startKeepAlive()`/`stopKeepAlive()`

### Bug #3: Response Validation Missing
- **Location**: `sidepanel.js` line 1827 - doesn't check if response is null
- **Impact**: If background doesn't respond, sidepanel hangs on "Processing..."
- **Status**: Needs fix (edit tool failed due to whitespace matching)

## Changes Made

### 1. background.js
- ✅ Removed duplicate START_AUDIO handler (lines 544-718)
- ✅ Added global `ensureOffscreen()` helper function
- ✅ Verified remaining handler has `return true` for async response

### 2. sidepanel.js (NEEDS MANUAL FIX)
Add null check after line 1827:

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
  
  // ADD THIS NULL CHECK:
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

## Testing Instructions

1. **Reload Extension**
   ```
   chrome://extensions → Spikely → Reload
   ```

2. **Open TikTok Live**
   - Navigate to any TikTok Live stream
   - Ensure tab is focused

3. **Open Sidepanel**
   - Click Spikely extension icon
   - Sidepanel should open on right side

4. **Test Audio Capture**
   - Click "Start Audio" button
   - Watch console logs:
     - `[AUDIO:SP] ▶ START click`
     - `[AUDIO:BG] ▶ START requestId=...`
     - `[AUDIO:BG] 🔎 targetTab url=...`
     - `[AUDIO:BG] 🪄 activation-hop injected ok`
     - `[AUDIO:BG] 🟢 tabCapture starting...`
     - `[AUDIO:BG] 🟢 tabCapture OK`
     - `[AUDIO:SP] 📨 Response received: {ok: true, ...}`
     - `[AUDIO:SP] ✅ STARTED streamId=...`

5. **Expected Behavior**
   - Button changes to "Stop Audio" within 2-3 seconds
   - No "Processing..." hang
   - If error occurs, clear error message with retry option

## Diagnostic Commands

### Check Service Worker Console
```
chrome://extensions → Spikely → service worker → inspect
```

### Check Sidepanel Console  
```
Right-click sidepanel → Inspect
```

### Test Content Script
```javascript
// In TikTok Live tab console:
window.__SPIKELY_TEST__()
// Should return viewer count object
```

## Known Limitations

1. **User Gesture Window**: Chrome requires tabCapture to be called within ~1.5s of user gesture
2. **Tab Focus**: Target tab must be active/focused for capture to work
3. **Chrome Pages**: Cannot capture chrome:// or chrome-extension:// pages
4. **Muted Tabs**: If tab is muted, capture succeeds but no audio tracks

## Next Steps

1. Apply manual fix to sidepanel.js (null check)
2. Test with real TikTok Live stream
3. Verify viewer count detection works
4. Test full insight generation flow
5. Update version to 2.9.1 in manifest.json

## Rollback Plan

If issues persist:
```bash
git checkout HEAD~1 frontend/extension/background.js
```

Then restore the working version from git history.
