# LVT R13 Testing Guide

## **Manual Testing Steps for R13 DOM LVT**

### **Test A: Cold Load (2s verification)**
1. **Open TikTok Live** with visible "Viewers · X" 
2. **Open browser console** (F12)
3. **Within 2 seconds, verify logs:**
   ```
   [VIEWER:PAGE] R13 loaded (tiktok)
   [VIEWER:PAGE:FOUND] selector="SPAN", text="65", value=65
   [VIEWER:PAGE] value=65
   ```
   ✅ **PASS**: All logs appear with correct count
   ❌ **FAIL**: Missing logs or syntax errors

### **Test B: Background Relay**
1. **Open chrome://extensions/** → **"Inspect views: background page"** 
2. **In background console, look for:**
   ```
   [VIEWER:BG] forwarded 65
   ```
   ✅ **PASS**: Background receives message
   ❌ **FAIL**: No background logs

### **Test C: Sidepanel (No Audio Required)**
1. **Click Spikely icon** → **"Open side panel"**
2. **DO NOT click "Start Audio"**
3. **Within 1 second verify:**
   - Viewer count shows **65** (not 0, not 888)
   - Right-click sidepanel → Inspect → Console shows:
     ```
     [VIEWER:SP] updated 65
     ```
   ✅ **PASS**: Correct count without audio
   ❌ **FAIL**: Shows 0, 888, or no logs

### **Test D: Real-Time Updates**  
1. **Wait 60 seconds** on TikTok Live
2. **When viewer count changes** (people join/leave)
3. **Verify complete chain within 1s:**
   - Content: `[VIEWER:PAGE:UPDATE] value=67 delta=2`
   - Background: `[VIEWER:BG] forwarded 67` 
   - Sidepanel: `[VIEWER:SP] updated 67`
   ✅ **PASS**: Real-time sync
   ❌ **FAIL**: Delayed or missing updates

### **Test E: SPA Navigation**
1. **Navigate to different TikTok Live** stream
2. **Within 2 seconds verify:**
   ```
   [VIEWER:PAGE:NAV] from=/old/live to=/new/live
   [VIEWER:PAGE:FOUND] selector="SPAN", text="123", value=123
   [VIEWER:SP] updated 123
   ```
   ✅ **PASS**: Auto-recovery works
   ❌ **FAIL**: Count doesn't update

## **Quick Diagnostics**

```javascript
// Check content script loaded (TikTok console)
window.__SPIKELY_CONTENT_ACTIVE__

// Check current state (TikTok console)  
window.__spikelyLVT

// Manual trigger (TikTok console)
chrome.runtime.sendMessage({type: 'START_TRACKING'})

// Schema validation (Background console)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'VIEWER_COUNT_UPDATE') {
    console.log('SCHEMA:', msg);
  }
});
```

## **Success Criteria**
- All Tests A-E pass
- Sidepanel shows accurate TikTok count  
- No 888 placeholder after first valid data
- Works without audio capture
- Auto-recovers on navigation

## **Build Constants**
- `LVT_EMIT_DEBOUNCE_MS = 250`
- `LVT_SANITY_MAX_SMALL_ROOM = 200000`