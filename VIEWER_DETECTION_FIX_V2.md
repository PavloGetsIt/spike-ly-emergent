# Viewer Detection Fix - Version 2.1.0

## 🎯 Problem Summary

The DOM viewer count detection was broken, showing 0 instead of actual viewer counts (e.g., 2.1K). This is a **critical issue** because:
- Without accurate viewer counts, the correlation engine can't work
- Spikes and drops can't be detected
- AI insights can't be correlated with streamer actions

## 🔧 Root Cause

TikTok frequently changes its DOM structure and CSS classes to prevent scraping. The previous detection methods were too rigid and relied on specific selectors that became outdated.

## ✅ Solution Implemented

### Three-Tier Detection Strategy

We've implemented a robust, multi-strategy approach that adapts to TikTok's changing DOM:

#### **Strategy 1: Label-Based Detection** (Most Reliable)
- Searches for any element containing "Viewers" or "viewer" text
- Checks siblings and children for numbers with K/M suffixes
- Handles inline formats like "Viewers • 2.1K"
- **Why it works:** Text content is more stable than CSS classes

#### **Strategy 2: Brute Force Number Search** (Fallback)
- Scans ALL elements for numbers that look like viewer counts (e.g., "2.1K", "953")
- Prioritizes numbers with viewer-related context in parent elements
- Sorts candidates by confidence (context + magnitude)
- Logs top 5 candidates for debugging
- **Why it works:** Even if structure changes, numbers still exist in the DOM

#### **Strategy 3: Priority Selectors** (Legacy Support)
- Updated selector list with 2025 patterns:
  - `[data-e2e="live-viewer-count"]`
  - `[data-e2e*="viewer"]`
  - `[class*="LiveViewerCount"]`
  - `[class*="ViewerCount"]`
  - `[class*="viewer"]` (case variations)
  - `[aria-label*="viewer"]` (accessibility)
  - Original working selectors preserved
- **Why it works:** Covers multiple possible class naming conventions

### Enhanced Parsing

- Improved number parsing to handle:
  - Decimal values: "2.1K" → 2100 (not 2000)
  - Various formats: "953", "1K", "1.5M"
  - Case insensitive: "2.5k" or "2.5K"
  - Special characters: bullets (•), dots (·), commas
- Validation tests run on load to ensure accuracy

### Comprehensive Debugging

Added extensive console logging:
- `[VC:DEBUG]` prefix for all detection logs
- Strategy-by-strategy progress reporting
- Top candidate listing with confidence scores
- Clear success/failure messages
- Helpful tips when detection fails

### Manual Testing Tool

Added a console command for instant testing:
```javascript
window.__SPIKELY_TEST__()
```

This command:
- Runs the full detection process
- Shows found element details
- Displays parsed value
- Sends test message to background script
- Provides debugging suggestions if failed

## 📊 Detection Flow

```
1. Check if cached element still in DOM
   └─> ✅ Yes → Reuse it
   └─> ❌ No → Continue

2. Strategy 1: Search for "Viewers" label
   └─> Find elements with "viewer" text
   └─> Check siblings/children for numbers
   └─> ✅ Found → Cache and return
   └─> ❌ Not found → Continue

3. Strategy 2: Brute force number search
   └─> Scan all elements for number patterns
   └─> Score by context and magnitude
   └─> Sort candidates by confidence
   └─> ✅ Found with context → Cache and return
   └─> ❌ No good candidate → Continue

4. Strategy 3: Try priority selectors
   └─> Loop through updated selector list
   └─> Test each selector
   └─> ✅ Found valid number → Cache and return
   └─> ❌ All failed → Return null

5. Log detailed failure info + helpful tips
```

## 🧪 Testing Instructions

### Option 1: Automated Testing (When Extension Loads)

1. Load the extension in Chrome
2. Open a TikTok Live page (e.g., https://www.tiktok.com/@username/live)
3. Open Chrome DevTools console
4. Look for these logs:
   ```
   [Spikely] Content script loaded - Version 2.1.0-ENHANCED-DETECTION
   [TT:PARSE] 🧪 Running parser validation tests...
   [TT:PARSE] ✅ "1.2K" → 1200 (expected 1200)
   ```
5. Click "Start Audio" in the side panel
6. Watch for detection logs:
   ```
   [VC:DEBUG] 🔍 Starting TikTok viewer count search...
   [VC:DEBUG] 🎯 Strategy 1: Searching for "Viewers" label...
   [VC:DEBUG] ✅ STRATEGY 1 SUCCESS: Found count near "Viewers": 2.1K → 2100
   ```

### Option 2: Manual Testing Command

1. Go to a TikTok Live page
2. Open Chrome DevTools console
3. Run: `window.__SPIKELY_TEST__()`
4. Review the output:
   - ✅ Success: Shows found element and parsed value
   - ❌ Failure: Shows debugging info and suggestions

### Expected Results

**Success indicators:**
- Console shows: `✅ STRATEGY X SUCCESS`
- Parsed value matches visible count
- Side panel displays correct viewer count
- No more "0 viewers" issue

**If detection still fails:**
- Check console logs for `[VC:DEBUG]` messages
- See which strategies were tried
- Review top candidates from Strategy 2
- Manually inspect the viewer count element in DevTools
- Share the element's HTML structure for further updates

## 📋 Files Modified

### `/app/frontend/extension/content.js`

**Changes:**
1. **Updated PLATFORM_SELECTORS** (lines 39-60)
   - Added 2025 TikTok Live selectors
   - Included data-e2e, class variations, aria-label selectors
   - Preserved original working selectors

2. **Rewrote queryViewerNode()** (lines 121-310)
   - Implemented 3-tier detection strategy
   - Added extensive debugging logs
   - Improved element caching
   - Better error handling

3. **Enhanced parseTextToCount()** (lines 356-370)
   - Fixed decimal parsing (1.2K → 1200)
   - Handle bullet characters (•, ·)
   - Better regex patterns
   - Case-insensitive matching

4. **Added manual testing tool** (lines 1050-1095)
   - `window.__SPIKELY_TEST__()` function
   - Comprehensive test output
   - Debug suggestions
   - Test message sending

5. **Updated version** (line 1050)
   - Version 2.1.0-ENHANCED-DETECTION

## 🚀 Next Steps

1. **Test on real TikTok Live streams**
   - Multiple streamers
   - Different viewer count ranges (100s, 1K+, 10K+)
   - Various device/browser combinations

2. **Monitor console logs**
   - Track which strategy succeeds most often
   - Identify any new failure patterns
   - Collect actual DOM structures for future updates

3. **If detection still fails:**
   - Use `window.__SPIKELY_TEST__()` to debug
   - Inspect the viewer count element manually
   - Share HTML structure in GitHub issue
   - Update selectors based on findings

4. **Performance optimization** (if needed)
   - Cache successful strategy per session
   - Skip failed strategies first
   - Reduce brute force scope

## 💡 Why This Approach Works

1. **Resilient to DOM changes:** Multiple fallback strategies
2. **Self-documenting:** Extensive console logging for debugging
3. **Easy to extend:** Add new selectors or strategies easily
4. **User-testable:** Manual test command for quick verification
5. **Backward compatible:** Preserves all original working code
6. **Future-proof:** Text-based search more stable than class names

## ⚠️ Important Notes

- Parser validation runs automatically on load (12 test cases)
- All tests must pass for accurate counting
- Console logs use `[VC:DEBUG]` prefix (can be filtered)
- Detection happens on every START_TRACKING message
- Cached elements are revalidated on DOM changes
- MutationObserver monitors selected element for updates

## 📞 Support

If viewer detection is still not working:

1. Run `window.__SPIKELY_TEST__()` and share output
2. Screenshot the viewer count area in TikTok Live
3. Inspect element and share HTML structure
4. Include console logs from extension initialization
5. Specify which TikTok Live stream you're testing on

---

**Status:** ✅ Implemented and ready for testing  
**Priority:** 🔴 Critical - Core functionality  
**Version:** 2.1.0-ENHANCED-DETECTION  
**Date:** 2025-01-21
