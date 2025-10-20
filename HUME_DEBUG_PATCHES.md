# Hume AI Logging Fix - Unified Diffs

## Summary

This patch adds comprehensive debug logging to prove Hume AI model responses (prosody, language-of-emotion, vocal-burst) are being received and parsed correctly. The fix addresses the missing console logs for `topBursts` and `topLanguageEmotions` by adding a DEBUG flag and detailed logging at key points in the data flow.

**What the diffs do:**
1. Add a `DEBUG_HUME` flag (default: true for development) to gate verbose logging
2. Implement a `generateRequestId()` helper for tracing requests through the pipeline
3. Add comprehensive logging in `background.js` that outputs full response objects, request IDs, and explicit checks for topBursts/topLanguageEmotions structure
4. Add detailed logging in `correlationEngine.js` that shows all received metrics including burst and language emotion data
5. All changes are non-invasive and don't modify functional logic - only add observability

**Why:**
The current code parses `topBursts` and `topLanguageEmotions` (lines 767-768 in background.js) but never logs them. This patch makes the data flow visible without changing behavior.

---

## Unified Diff 1: /app/frontend/extension/background.js

```diff
--- a/app/frontend/extension/background.js
+++ b/app/frontend/extension/background.js
@@ -1,6 +1,18 @@
 import { audioCaptureManager } from './audioCapture.js';
 import { correlationEngine } from './correlationEngine.js';
 
+// ==================== DEBUG CONFIGURATION ====================
+// Set to true to enable verbose Hume AI logging
+const DEBUG_HUME = true;
+
+// Request ID generator for tracing
+let humeRequestCounter = 0;
+function generateRequestId() {
+  return `hume_${Date.now()}_${++humeRequestCounter}`;
+}
+// =============================================================
+
+
 let wsConnection = null;
 let activeTab = null;
 let reconnectAttempts = 0;
@@ -678,6 +690,8 @@ chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
   } else if (message.type === 'HUME_ANALYZE') {
     // Centralized Hume AI analysis with request gating
     (async () => {
+      const requestId = generateRequestId();
+      
       const now = Date.now();
       const cooldown = humeState.minIntervalMs + humeState.backoffMs;
       
@@ -695,6 +709,10 @@ chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
       humeState.inFlight = true;
       humeState.lastAt = now;
       console.log('[Background] Hume queued → sending (inFlight=true)');
+      
+      if (DEBUG_HUME) {
+        console.log(`[DEBUG_HUME] Request ${requestId} initiated at ${new Date().toISOString()}`);
+      }
       
         try {
           // Ensure offscreen document exists for Hume AI processing
@@ -730,6 +748,15 @@ chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
             });
           });
           
+          if (DEBUG_HUME && resp) {
+            console.log(`[DEBUG_HUME] Request ${requestId} received response:`, {
+              ok: resp.ok,
+              reason: resp.reason,
+              hasResult: !!resp.result,
+              timestamp: new Date().toISOString()
+            });
+          }
+          
           if (!resp || !resp.ok) {
             const reason = resp?.reason || 'api_error';
             if (reason === 'rate_limit') {
@@ -755,6 +782,40 @@ chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
           
           const result = resp.result;
           
+          // ==================== DEBUG LOGGING ====================
+          if (DEBUG_HUME) {
+            console.log(`[DEBUG_HUME] ========================================`);
+            console.log(`[DEBUG_HUME] Request ${requestId} - Full Response Object:`);
+            console.log(`[DEBUG_HUME] ========================================`);
+            console.log(`[DEBUG_HUME] Full result:`, JSON.stringify(result, null, 2));
+            
+            console.log(`[DEBUG_HUME] Prosody data:`, {
+              exists: !!result.prosody,
+              type: typeof result.prosody,
+              hasMetrics: !!result.prosody?.metrics,
+              hasTopEmotions: !!result.prosody?.topEmotions,
+              topEmotionsType: Array.isArray(result.prosody?.topEmotions) ? 'array' : typeof result.prosody?.topEmotions,
+              topEmotionsLength: result.prosody?.topEmotions?.length
+            });
+            
+            console.log(`[DEBUG_HUME] Burst data:`, {
+              exists: !!result.burst,
+              type: typeof result.burst,
+              hasTopEmotions: !!result.burst?.topEmotions,
+              topEmotionsType: Array.isArray(result.burst?.topEmotions) ? 'array' : typeof result.burst?.topEmotions,
+              topEmotionsLength: result.burst?.topEmotions?.length,
+              topEmotions: result.burst?.topEmotions
+            });
+            
+            console.log(`[DEBUG_HUME] Language data:`, {
+              exists: !!result.language,
+              type: typeof result.language,
+              hasTopEmotions: !!result.language?.topEmotions,
+              topEmotionsType: Array.isArray(result.language?.topEmotions) ? 'array' : typeof result.language?.topEmotions,
+              topEmotionsLength: result.language?.topEmotions?.length,
+              topEmotions: result.language?.topEmotions
+            });
+          }
+          // =======================================================
+          
           // Clear backoff on success
           humeState.backoffMs = 0;
           
@@ -772,7 +833,27 @@ chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
           };
           
           console.log(`[Background] Prosody metrics received {quality: ${metrics.correlationQuality}, dominant: ${metrics.dominantSignal}, energy: ${metrics.energy.toFixed(2)}}`);
+          
+          // ==================== EXTENDED LOGGING ====================
+          if (DEBUG_HUME) {
+            console.log(`[DEBUG_HUME] Request ${requestId} - Parsed Metrics:`, {
+              timestamp: new Date().toISOString(),
+              excitement: metrics.excitement,
+              confidence: metrics.confidence,
+              energy: metrics.energy,
+              topEmotionsCount: metrics.topEmotions.length,
+              topBurstsCount: metrics.topBursts.length,
+              topLanguageEmotionsCount: metrics.topLanguageEmotions.length,
+              dominantSignal: metrics.dominantSignal,
+              correlationQuality: metrics.correlationQuality
+            });
+            
+            if (metrics.topBursts.length > 0) {
+              console.log(`[DEBUG_HUME] 💥 VOCAL BURSTS DETECTED:`, metrics.topBursts);
+            }
+            if (metrics.topLanguageEmotions.length > 0) {
+              console.log(`[DEBUG_HUME] 📝 LANGUAGE EMOTIONS DETECTED:`, metrics.topLanguageEmotions);
+            }
+          }
+          // ==========================================================
           
           // Add to correlation engine
           correlationEngine.addProsodyMetrics(metrics);
```

---

## Unified Diff 2: /app/frontend/extension/correlationEngine.js

```diff
--- a/app/frontend/extension/correlationEngine.js
+++ b/app/frontend/extension/correlationEngine.js
@@ -1,5 +1,9 @@
 // Correlation engine for matching viewer changes with transcript + tone
 
+// ==================== DEBUG CONFIGURATION ====================
+// Import from background.js or set locally
+const DEBUG_HUME = true;
+// =============================================================
+
 // Feature flag: disable extension AI calls (web app handles this)
 const ENABLE_EXTENSION_AI = false;
 const AI_MAX_LATENCY_MS = 900; // hard deadline for AI response
@@ -33,6 +37,28 @@ class CorrelationEngine {
     
     console.log('[Correlation] Prosody added:', {
       excitement: (metrics.excitement * 100).toFixed(1) + '%',
       dominantSignal: metrics.dominantSignal,
       quality: metrics.correlationQuality
     });
+    
+    // ==================== EXTENDED DEBUG LOGGING ====================
+    if (DEBUG_HUME) {
+      console.log('[DEBUG_HUME] [Correlation] Full metrics received:', {
+        timestamp: new Date(metrics.timestamp).toISOString(),
+        excitement: metrics.excitement,
+        confidence: metrics.confidence,
+        energy: metrics.energy,
+        topEmotions: metrics.topEmotions,
+        topBursts: metrics.topBursts,
+        topLanguageEmotions: metrics.topLanguageEmotions,
+        dominantSignal: metrics.dominantSignal,
+        avgSignalStrength: metrics.avgSignalStrength,
+        correlationQuality: metrics.correlationQuality
+      });
+      
+      if (metrics.topBursts && metrics.topBursts.length > 0) {
+        console.log('[DEBUG_HUME] 💥 Correlation received BURSTS:', metrics.topBursts);
+      }
+      
+      if (metrics.topLanguageEmotions && metrics.topLanguageEmotions.length > 0) {
+        console.log('[DEBUG_HUME] 📝 Correlation received LANGUAGE EMOTIONS:', metrics.topLanguageEmotions);
+      }
+    }
+    // ================================================================
   }
```

---

## Pre-Flight Validation Checklist

### Step 1: Apply Patches
```bash
# Navigate to extension directory
cd /app/frontend/extension

# Apply background.js patch
# (Copy unified diff to background.patch file)
patch -p1 < background.patch

# Apply correlationEngine.js patch
# (Copy unified diff to correlation.patch file)
patch -p1 < correlation.patch

# Verify changes applied
git diff background.js correlationEngine.js
```

### Step 2: Reload Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Find "Spikely - Multi-Platform Viewer Tracker" extension
4. Click the **Reload** button (circular arrow icon)
5. Verify no errors in extension console

### Step 3: Verify DEBUG Flag
1. Open extension background console:
   - `chrome://extensions/` → Spikely → "service worker" or "background page" link
2. Check for DEBUG_HUME initialization:
   ```javascript
   // Should see at top of background.js execution
   // No error about DEBUG_HUME being undefined
   ```

### Step 4: Test Cases

**Test Case A: Clear Speech (Prosody Dominant)**
1. Open TikTok Live / Twitch / YouTube Live in new tab
2. Open Spikely extension side panel (click icon or Ctrl+Shift+S)
3. Click "Start Audio" button
4. Speak clearly into microphone for 5-10 seconds
5. **Expected Console Logs:**
   ```
   [DEBUG_HUME] Request hume_<timestamp>_<counter> initiated at <ISO timestamp>
   [DEBUG_HUME] Request hume_xxx received response: { ok: true, hasResult: true, ... }
   [DEBUG_HUME] ========================================
   [DEBUG_HUME] Request hume_xxx - Full Response Object:
   [DEBUG_HUME] ========================================
   [DEBUG_HUME] Full result: { prosody: {...}, burst: {...}, language: {...}, meta: {...} }
   [DEBUG_HUME] Prosody data: { exists: true, type: 'object', hasMetrics: true, ... }
   [DEBUG_HUME] Burst data: { exists: true, type: 'object', hasTopEmotions: true, topEmotionsType: 'array', topEmotionsLength: <number>, topEmotions: [...] }
   [DEBUG_HUME] Language data: { exists: true, type: 'object', hasTopEmotions: true, topEmotionsType: 'array', topEmotionsLength: <number>, topEmotions: [...] }
   [DEBUG_HUME] Request hume_xxx - Parsed Metrics: { ... topBurstsCount: X, topLanguageEmotionsCount: Y, ... }
   [DEBUG_HUME] 💥 VOCAL BURSTS DETECTED: [{ name: '...', score: ... }, ...]
   [DEBUG_HUME] 📝 LANGUAGE EMOTIONS DETECTED: [{ name: '...', score: ... }, ...]
   [DEBUG_HUME] [Correlation] Full metrics received: { ... topBursts: [...], topLanguageEmotions: [...], ... }
   [DEBUG_HUME] 💥 Correlation received BURSTS: [...]
   [DEBUG_HUME] 📝 Correlation received LANGUAGE EMOTIONS: [...]
   ```

**Test Case B: Emotional Speech (Language Dominant)**
1. Continue from Test Case A
2. Speak with exaggerated emotion (excitement, joy, enthusiasm)
3. Use emotional words: "amazing!", "incredible!", "wow!"
4. **Expected Console Logs:**
   - Same structure as Test Case A
   - `topLanguageEmotions` array should have 3-5 items
   - `dominantSignal` might be 'Language'
   - Language emotions should show: Joy, Excitement, Interest, etc.

**Test Case C: Vocal Bursts (Burst Dominant)**
1. Continue from Test Case A
2. Produce vocal bursts: laugh loudly, sigh audibly, gasp
3. Try "non-speech" sounds
4. **Expected Console Logs:**
   - Same structure as Test Case A
   - `topBursts` array should have 2-3 items
   - `dominantSignal` might be 'Burst'
   - Burst emotions should show: Amusement (laugh), Sigh, Gasp, etc.
   - `[DEBUG_HUME] 💥 VOCAL BURSTS DETECTED:` should appear

### Step 5: Assertions to Verify Success

**✅ SUCCESS Indicators:**
1. **Request ID appears** in every DEBUG_HUME log
2. **Full result object logged** with all 3 models (prosody, burst, language)
3. **Burst data structure check shows:**
   - `exists: true`
   - `type: 'object'`
   - `topEmotionsType: 'array'`
   - `topEmotionsLength: > 0` (at least sometimes)
4. **Language data structure check shows:**
   - `exists: true`
   - `type: 'object'`
   - `topEmotionsType: 'array'`
   - `topEmotionsLength: > 0` (at least sometimes)
5. **Explicit burst/language logs appear:**
   - `💥 VOCAL BURSTS DETECTED:` with array contents
   - `📝 LANGUAGE EMOTIONS DETECTED:` with array contents
6. **Correlation engine receives full data:**
   - `[DEBUG_HUME] [Correlation] Full metrics received:` includes topBursts and topLanguageEmotions arrays
7. **No JavaScript errors** in console

**❌ FAILURE Indicators (if these appear):**
1. `topEmotionsType: 'undefined'` or `null` for burst/language
2. `topEmotionsLength: 0` consistently (never > 0)
3. `topEmotions: []` always empty
4. No `💥 VOCAL BURSTS DETECTED:` or `📝 LANGUAGE EMOTIONS DETECTED:` logs ever appear
5. Errors like `Cannot read property 'topEmotions' of undefined`

### Step 6: Troubleshooting (if no logs appear)

**Issue: No DEBUG_HUME logs at all**
- **Check:** Verify DEBUG_HUME = true at top of background.js (line 6)
- **Check:** Extension reloaded after applying patches
- **Check:** Audio capture actually started (check UI status)
- **Check:** Hume AI requests are being made (check Network tab for `hume-analyze-emotion` calls)

**Issue: Logs appear but topBursts/topLanguageEmotions always empty**
- **Check:** Supabase edge function logs (see earlier deployment docs)
- **Check:** Hume AI API is actually returning data (not mock data)
- **Check:** Response object structure matches expected (look at Full result log)
- **Next step:** Feed logs to Prompt 3 for parsing validation

**Issue: topBursts/topLanguageEmotions have wrong type**
- **Check:** `topEmotionsType` in logs (should be 'array', not 'object' or 'undefined')
- **Action:** If wrong type, this indicates API response shape mismatch → Prompt 3

### Step 7: Minimal Rollback

**If you need to revert:**

**Option A: Flip DEBUG flag**
```javascript
// In background.js and correlationEngine.js, change:
const DEBUG_HUME = false;

// Then reload extension
```

**Option B: Git revert**
```bash
cd /app/frontend/extension
git diff HEAD > debug-logs.patch  # Save changes
git checkout HEAD -- background.js correlationEngine.js  # Revert
# Reload extension
```

**Option C: Remove DEBUG blocks manually**
- Comment out or delete all lines between:
  ```javascript
  // ==================== DEBUG LOGGING ====================
  // ... DEBUG code ...
  // =======================================================
  ```

### Step 8: Collect Evidence Artifacts

**Console Logs:**
```bash
# In Chrome DevTools Console:
# Right-click in console → "Save as..."
# Save to: /tmp/hume-debug-logs-<timestamp>.txt
```

**Network Logs:**
```bash
# In Chrome DevTools Network tab:
# Filter: "hume-analyze-emotion"
# Right-click request → "Copy" → "Copy as cURL"
# Save to: /tmp/hume-network-<timestamp>.txt
```

**Verification Report Format:**
```
HUME AI DEBUG VERIFICATION REPORT
Generated: <timestamp>
Extension Version: <version>
Chrome Version: <version>

TEST CASE A - CLEAR SPEECH
Request ID: hume_1234567890_1
Status: ✅ SUCCESS / ❌ FAILED
Evidence:
- Prosody: { exists: true, topEmotionsLength: 5 }
- Burst: { exists: true, topEmotionsLength: 2 }
- Language: { exists: true, topEmotionsLength: 3 }
- Logs: [attach console excerpt]

TEST CASE B - EMOTIONAL SPEECH
Request ID: hume_1234567891_2
Status: ✅ SUCCESS / ❌ FAILED
Evidence:
- Language emotions detected: ["Joy: 0.76", "Excitement: 0.68"]
- Dominant signal: Language
- Logs: [attach console excerpt]

TEST CASE C - VOCAL BURSTS
Request ID: hume_1234567892_3
Status: ✅ SUCCESS / ❌ FAILED
Evidence:
- Bursts detected: ["Amusement (laugh): 0.84"]
- Dominant signal: Burst
- Logs: [attach console excerpt]

OVERALL RESULT: ✅ SUCCESS / ❌ FAILED
Next Steps: [feed to Prompt 3 / deploy / rollback]
```

---

## Summary

This patch provides **complete visibility** into Hume AI's 3-model response pipeline without changing any functional behavior. The DEBUG_HUME flag can be flipped to false for production, and the logging overhead is minimal (only console.log calls gated behind boolean check).

**Key improvements:**
1. **Request tracing:** Every Hume request gets a unique ID
2. **Full response logging:** Complete JSON of Hume API response
3. **Structure validation:** Explicit checks for topBursts and topLanguageEmotions existence, type, and length
4. **Visual indicators:** 💥 and 📝 emojis make burst/language logs easy to spot
5. **Correlation tracking:** Shows data flow from background.js → correlationEngine.js

**What this proves:**
- If logs show `topEmotionsLength: > 0` and arrays with content → Hume API is working correctly
- If logs show `topEmotionsLength: 0` or `undefined` → Issue is upstream (Supabase edge function or Hume API)
- If logs appear with data but UI doesn't update → Issue is downstream parsing/rendering

**Production safety:**
- All debug code behind `DEBUG_HUME` flag
- No performance impact when DEBUG_HUME = false
- No functional logic changed
- Easy rollback via flag flip or git revert

Apply these patches, run the test cases, and capture the console logs. The evidence will definitively show whether the data is arriving and being parsed correctly.
