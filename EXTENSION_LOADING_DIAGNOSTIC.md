# 🔍 Extension Loading Diagnostic Guide

## Step 1: Verify Extension is Loaded

1. **Go to:** chrome://extensions
2. **Find "Spikely"** in the list
3. **Check these things:**
   - [ ] Toggle is ON (blue)
   - [ ] Version shows: 2.1.4 or higher
   - [ ] No errors shown in red
   - [ ] "Service worker" link is visible

4. **If you see errors:**
   - Click "Clear all" to dismiss
   - Click the **reload icon** (circular arrow) on the extension
   - Check again for errors

---

## Step 2: Force Reload the Extension

**Every time you make changes, you MUST reload:**

1. Go to chrome://extensions
2. Find Spikely
3. Click the **reload button** (circular arrow icon)
4. **Close ALL TikTok tabs**
5. **Open a fresh TikTok Live tab**

**Why:** Chrome caches the old version of content scripts. You must reload extension + close tabs.

---

## Step 3: Check Content Script Injection

### Open TikTok Live Page
1. Go to: https://www.tiktok.com/live
2. Press F12 (DevTools)
3. Go to **Console** tab
4. **Look for these logs immediately:**

```
🚀🚀🚀 [SPIKELY] CONTENT SCRIPT LOADING... 🚀🚀🚀
[SPIKELY] URL: https://www.tiktok.com/...
[SPIKELY] Timestamp: 2025-01-21T...
[Spikely] ✅ Marking script as active
🎉🎉🎉 [SPIKELY] CONTENT SCRIPT FULLY LOADED! 🎉🎉🎉
[Spikely] Platform detected: tiktok
```

### ✅ If you see these logs:
**Content script is working!** Continue to Step 4.

### ❌ If you DON'T see these logs:

**Problem:** Content script not injecting. Try these fixes:

**Fix A: Check URL pattern**
- TikTok URL **must** contain `/live` or `@username/live`
- ✅ Good: `tiktok.com/@user/live`
- ✅ Good: `tiktok.com/live`
- ❌ Bad: `tiktok.com/video/123456`

**Fix B: Reload extension + page**
```
1. chrome://extensions → Reload Spikely
2. Close ALL TikTok tabs
3. Open new TikTok Live tab
4. Check console again
```

**Fix C: Check for script errors**
- Look for RED errors in console
- If you see "Uncaught SyntaxError" → Report to developer
- If you see "Failed to load resource" → Check file paths

**Fix D: Verify permissions**
- chrome://extensions → Spikely → Details
- Scroll to "Site access"
- Should say: "On specific sites" or "On all sites"
- If it says "On click", change to "On specific sites"

---

## Step 4: Check Background Script

1. **Go to:** chrome://extensions
2. **Find Spikely**
3. **Click:** "Service worker" (blue link)
4. **New DevTools window opens**
5. **Look for these logs:**

```
🚨 BACKGROUND TEST: background.js file executing BEFORE imports
🚨 TIMESTAMP: 2025-01-21T...
🚨 BACKGROUND TEST: imports completed successfully
🔬 NUCLEAR: background.js LOADING - v2.0.5
```

### ✅ If you see these logs:
**Background script is working!** Continue to Step 5.

### ❌ If you DON'T see these logs:

**Problem:** Background service worker not starting.

**Fix A: Restart service worker**
```
1. In chrome://extensions, find the "Service worker" link
2. If it says "Service worker (Inactive)", click it
3. Check if logs appear in new DevTools window
```

**Fix B: Check for errors**
- Look for RED errors in service worker console
- Common issue: Import errors from module files
- If you see "Cannot find module" → Report to developer

---

## Step 5: Test Message Passing

Once both scripts are loaded, test communication:

### In Main Page Console (TikTok tab):
```javascript
// This should NOT throw an error:
chrome.runtime.sendMessage({type: 'PING'}, (response) => {
  console.log('✅ PING response:', response);
});
```

**Expected output:**
```
✅ PING response: {type: 'PONG', platform: 'tiktok', isReady: true}
```

### In Service Worker Console:
```javascript
// Should see this log when you send PING:
[VC:CT:ACK] PONG {platform: 'tiktok'}
```

---

## Step 6: Start Tracking

### In Main Page Console:
```javascript
// Manually trigger tracking:
window.__SPIKELY_TEST__()
window.__SPIKELY_TEST_CHAT__()
```

### OR via Extension:
1. Click Spikely icon → Side panel opens
2. Click "Start Audio"
3. Watch **BOTH consoles** for logs:

**Main Page Console:**
```
[VC:DEBUG] 🔍 Starting TikTok viewer count search...
[CHAT] 🚀 Starting chat stream tracking...
```

**Service Worker Console:**
```
[VC:BG:RX] VIEWER_COUNT_UPDATE
[CHAT:BG:RX] CHAT_STREAM_UPDATE
```

---

## Common Issues & Solutions

### Issue 1: "Extension context invalidated"
**Cause:** Extension was reloaded while page was open  
**Fix:** Close tab, open new one

### Issue 2: No logs appear in Service Worker
**Cause:** Service worker went inactive  
**Fix:** Click "Service worker" link again to wake it up

### Issue 3: Content script loads but stops working
**Cause:** TikTok SPA navigation (page changed without reload)  
**Fix:** Refresh the page (F5)

### Issue 4: Logs appear once then stop
**Cause:** Script crashed with unhandled error  
**Fix:** Look for RED errors, refresh page

---

## Emergency Debugging Commands

### Check if extension exists:
```javascript
console.log('Extension ID:', chrome.runtime?.id);
// Should print: Extension ID: abc123def456...
```

### Check if content script loaded:
```javascript
console.log('Spikely active:', window.__SPIKELY_CONTENT_ACTIVE__);
// Should print: Spikely active: true
```

### List all available functions:
```javascript
console.log('Test functions:', {
  viewer: typeof window.__SPIKELY_TEST__,
  chat: typeof window.__SPIKELY_TEST_CHAT__
});
// Should print: {viewer: 'function', chat: 'function'}
```

---

## Checklist for Full Diagnostic

- [ ] Extension toggle is ON in chrome://extensions
- [ ] Extension reloaded (circular arrow clicked)
- [ ] All TikTok tabs closed
- [ ] Fresh TikTok Live tab opened
- [ ] Main console shows content script logs
- [ ] Service worker console shows background logs
- [ ] PING test succeeds
- [ ] Test functions exist (window.__SPIKELY_TEST__)
- [ ] "Start Audio" triggers tracking logs

---

## If Still No Logs...

**Report these to developer:**

1. **Chrome version:** chrome://version
2. **Extension version:** Check chrome://extensions
3. **Console screenshot:** Both main page and service worker
4. **Network tab:** Check if content.js loaded
5. **Errors:** Any red error messages
6. **TikTok URL:** Exact URL you're testing on

**Quick test to share:**
```javascript
// Run in console and share output:
console.log({
  extensionId: chrome.runtime?.id,
  spikelyActive: window.__SPIKELY_CONTENT_ACTIVE__,
  platform: typeof detectPlatform === 'function' ? 'detectPlatform exists' : 'missing',
  url: window.location.href
});
```

---

**Version:** 2.2.0  
**Last Updated:** 2025-01-21  
**Purpose:** Diagnose extension loading issues
