# LVT R15 Validation Checklist - TikTok DOM Viewer Count

## ✅ Fixes Applied

### 1. Background.js Syntax Error (CRITICAL) ✅
**Problem:** "Unexpected end of input" at line 1126 prevented extension from loading
**Fix:** Corrected indentation in HUME_ANALYZE handler (line 828-1019)
- Fixed misaligned `try` block after `if (DEBUG_HUME)` 
- Normalized indentation throughout try-catch-finally block
**Status:** ✅ FIXED - No linter errors

### 2. lvtContent.js Validation Logs ✅
**Added:**
- Line 5: `console.log('[LVT:R15] === SCRIPT START ===')` - First line executed
- Line 6: `window.__SPIKELY_LVT_LOADED = true` - Validation marker
- Line 13: Enhanced boot guard with logging
**Status:** ✅ COMPLETE - Script can now be validated in console

### 3. Manifest URL Patterns ✅
**Problem:** Overly broad/incorrect patterns might miss TikTok Live URLs
**Fix:** Optimized patterns for `https://www.tiktok.com/@username/live`
```json
"matches": [
  "https://www.tiktok.com/@*/live",      // /@username/live (exact)
  "https://www.tiktok.com/@*/live?*",    // /@username/live?query=string
  "https://www.tiktok.com/live/*",       // /live/... (alternative format)
  "https://m.tiktok.com/@*/live",        // Mobile web (exact)
  "https://m.tiktok.com/@*/live?*"       // Mobile web (with query)
]
```
**Also changed:** `all_frames: false` → `all_frames: true` (in case Live renders in iframe)
**Status:** ✅ OPTIMIZED

### 4. Message Chain ✅
**Verified full pipeline:**
- lvtContent.js: `chrome.runtime.sendMessage({type: 'VIEWER_COUNT_UPDATE', value: X})`
- background.js: Receives at line 193, validates, forwards to sidepanel (line 233-242)
- sidepanel.js: Handles at line 802-819, updates UI immediately
**Status:** ✅ VERIFIED - No breaks in chain

---

## 🧪 Testing Instructions

### Step 1: Reload Extension
```bash
# In Chrome:
1. Go to chrome://extensions/
2. Enable "Developer mode" (top right)
3. Click "Reload" on Spikely extension
4. Check for errors in service worker console
```

**Expected Result:**
- ✅ No "Unexpected end of input" error
- ✅ Extension icon shows active state
- ✅ Service worker console shows: `[Spikely] Background script loaded`

---

### Step 2: Open TikTok Live Page
```
URL: https://www.tiktok.com/@username/live
(Replace @username with any active TikTok Live stream)
```

**Actions:**
1. Navigate to a TikTok Live stream
2. Open DevTools (F12)
3. Go to **Sources** tab → **Content scripts** (left sidebar)

**Expected Result:**
- ✅ See `lvtContent.js` listed under "Content scripts"
- ✅ If not visible, check Console for errors

---

### Step 3: Check TikTok Console Logs
**In TikTok Live tab console, verify:**

```javascript
// 1. Check if script loaded
window.__SPIKELY_LVT_LOADED
// Expected: true

// 2. Check boot marker
window.__spikelyLVT_R15
// Expected: true

// 3. Look for startup logs in console:
```

**Expected Console Output:**
```
[LVT:R15] === SCRIPT START ===
[LVT:R15] booted
[LVT:R15] viewer node detected
[LVT:R15] emit value=123
```

**If you see:**
- ❌ `window.__SPIKELY_LVT_LOADED` is undefined → Content script not loading
- ❌ No `[LVT:R15]` logs → Script not executing
- ✅ `[LVT:R15] emit value=X` → ✅ DOM detection working!

---

### Step 4: Check Background Console
**Open Service Worker console:**
1. Go to `chrome://extensions/`
2. Find Spikely
3. Click "service worker" link

**Expected Logs:**
```
[BG:R15] forwarding value=123
[BG:R15] sent to sidepanel
```

**If you see:**
- ❌ No `[BG:R15]` logs → Message not reaching background
- ✅ `[BG:R15] forwarding value=X` → ✅ Message relay working!

---

### Step 5: Check Sidepanel UI
**Open Spikely sidepanel:**
1. Click Spikely extension icon
2. Sidepanel should open on the right

**Expected Behavior:**
- ✅ Viewer count displays **real number** from TikTok (not 0 or 888)
- ✅ Updates in real-time as viewer count changes
- ✅ Console shows: `[SP:R15] recv value=X`

**If you see:**
- ❌ Stuck at 0 or 888 → Message not reaching sidepanel
- ❌ No updates → DOM watcher not triggering
- ✅ Live updating viewer count → ✅ FULL PIPELINE WORKING!

---

## 🎯 Success Criteria (All Must Pass)

| Check | Expected | Status |
|-------|----------|--------|
| Extension loads without errors | No console errors in service worker | ⬜ |
| lvtContent.js in Sources → Content scripts | Visible on TikTok Live page | ⬜ |
| `window.__SPIKELY_LVT_LOADED === true` | Returns true in TikTok console | ⬜ |
| Console shows `[LVT:R15] booted` | Logged on page load | ⬜ |
| Console shows `[LVT:R15] viewer node detected` | Logged after DOM scan | ⬜ |
| Console shows `[LVT:R15] emit value=X` | Logged when viewer count found | ⬜ |
| Background shows `[BG:R15] forwarding value=X` | Message received in background | ⬜ |
| Background shows `[BG:R15] sent to sidepanel` | Message forwarded to sidepanel | ⬜ |
| Sidepanel shows live viewer count | Real number, not 0 or 888 | ⬜ |
| Viewer count updates in real-time | Changes as TikTok count changes | ⬜ |

---

## 🐛 Troubleshooting

### Problem: Content script not loading
**Symptoms:** No `lvtContent.js` in Sources → Content scripts

**Solutions:**
1. Verify URL matches pattern exactly
2. Try hard refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac)
3. Check manifest.json for syntax errors
4. Reload extension in chrome://extensions/

---

### Problem: Script loads but no viewer node detected
**Symptoms:** See `[LVT:R15] booted` but no `[LVT:R15] viewer node detected`

**Solutions:**
1. Verify TikTok Live page is **actually live** (not offline)
2. Check if viewer count is visible in TikTok UI
3. Wait 15 seconds (script retries every 1 second, 15 times)
4. Try different TikTok Live stream
5. Check if TikTok changed their DOM structure (run in console):
   ```javascript
   // Look for viewer count text
   document.body.innerText.match(/Viewers?\s*[·•]\s*\d+/gi)
   ```

---

### Problem: Viewer count emitted but not in sidepanel
**Symptoms:** See `[LVT:R15] emit value=X` but sidepanel shows 0/888

**Solutions:**
1. Check background console for `[BG:R15]` logs
2. Verify sidepanel is actually open
3. Try closing and reopening sidepanel
4. Check for JavaScript errors in sidepanel console

---

## 📊 Performance Notes

- **Detection retry:** 15 attempts at 1-second intervals (max 15 seconds)
- **DOM scan:** Full page scan on startup, then MutationObserver on detected node
- **Debounce:** 250ms debounce on MutationObserver to prevent spam
- **SPA navigation:** Automatically rebinds on URL changes (history.pushState, replaceState, popstate)
- **Sanity bounds:** Rejects values ≤0 or >5,000,000

---

## 🔄 Next Steps After Validation

**If all checks pass:**
1. Test on multiple TikTok Live streams
2. Test SPA navigation (click between streams without full reload)
3. Monitor for 5+ minutes to ensure stability
4. Verify counts match TikTok's displayed count exactly

**If any checks fail:**
1. Document which specific check failed
2. Copy exact error messages from console
3. Note the TikTok Live URL where it failed
4. Provide screenshots if DOM structure unclear

---

## 📝 File Changes Summary

**Modified Files:**
1. `/frontend/extension/background.js` - Fixed syntax error (indentation in HUME_ANALYZE)
2. `/frontend/extension/lvtContent.js` - Added validation logs and markers
3. `/frontend/extension/manifest.json` - Optimized URL patterns and enabled all_frames

**No Changes Needed:**
- `sidepanel.js` - Message handler already correct
- Message chain structure - Already properly configured

---

## ✅ Validation Complete

Once all checks pass, the TikTok DOM LVT system should be fully operational!

