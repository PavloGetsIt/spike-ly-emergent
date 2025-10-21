# Spikely Correlation Engine Threshold Fix

## Executive Summary

**Root Cause**: The correlation engine ignores the UI slider threshold due to a type mismatch bug. The slider sends `message.minDelta` (number) to `correlationEngine.setThresholds()`, but the function expects an object `{ minTrigger: number }`. This causes `setThresholds()` to silently fail (line 26 check fails), leaving the hardcoded default `minDelta = 10` active regardless of slider changes.

**Impact**: Users set sensitivity to ±3 or ±5, but the engine continues using ±10, causing:
- Missed insights on smaller viewer changes
- User confusion ("Why isn't my ±4 setting working?")
- False perception that system is unresponsive

**Fix**: Pass correct object structure `{ minTrigger: value }` to `setThresholds()`. Add comprehensive instrumentation (SLIDER_CHANGE, CORR_CHECK, INSIGHT_EMIT logs), debugger hooks for dev mode, and unit/integration tests. Keep changes minimal and feature-flagged.

**Time Estimate**:
- Quick patch: 2-3 hours (fix + tests)
- Full rollout: 1 day (staging canary 5% → gradual → 100%)

---

## Assumptions

**File Paths** (adjusted to match actual repo):
- UI Controls: `/app/frontend/extension/sidepanel.js` (not ThresholdSlider.tsx - vanilla JS)
- Correlation Engine: `/app/frontend/extension/correlationEngine.js`
- Background Script: `/app/frontend/extension/background.js`

**Dev Mode Flag**: Using `window.__SPIKELY_DEBUG__` for debugger hooks and `DEBUG_HUME` constant for instrumentation (already present in codebase).

---

## Unified Git-Style Diffs

### Diff 1: Fix `setThresholds()` Call in Background Script

**File**: `/app/frontend/extension/background.js`

**Intent**: Pass correct object structure `{ minTrigger: value }` instead of raw number

```diff
--- a/app/frontend/extension/background.js
+++ b/app/frontend/extension/background.js
@@ -224,8 +224,14 @@ chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
         timestamp: Date.now()
       }));
     }
-    // Also update correlation engine
-    correlationEngine.setThresholds(message.minDelta);
+    
+    // ==================== THRESHOLD FIX ====================
+    // Update correlation engine with correct object structure
+    correlationEngine.setThresholds({ 
+      minTrigger: message.minDelta 
+    });
+    console.log('[THRESHOLD:BG:APPLIED] Set correlation engine minDelta to:', message.minDelta);
+    // =======================================================
     
     // Forward to active tab (content script)
     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
```

### Diff 2: Add Instrumentation to Correlation Engine

**File**: `/app/frontend/extension/correlationEngine.js`

**Intent**: Add SLIDER_CHANGE, CORR_CHECK, INSIGHT_EMIT logs with timestamps

```diff
--- a/app/frontend/extension/correlationEngine.js
+++ b/app/frontend/extension/correlationEngine.js
@@ -22,10 +22,21 @@ class CorrelationEngine {
   }
 
   // Update thresholds from settings
   setThresholds(thresholds) {
+    const oldMinDelta = this.minDelta;
+    
     if (thresholds.minTrigger !== undefined) {
       this.minDelta = thresholds.minTrigger;
-      console.log('[Correlation] Updated minDelta to:', this.minDelta);
+      
+      // ==================== INSTRUMENTATION ====================
+      const timestamp = new Date().toISOString();
+      console.log(
+        `SLIDER_CHANGE ts=${timestamp} value=${this.minDelta} (previous: ${oldMinDelta})`
+      );
+      // ==========================================================
+    } else {
+      console.warn('[Correlation] setThresholds called with invalid structure:', thresholds);
+      console.warn('[Correlation] Expected: { minTrigger: number }, got:', typeof thresholds, thresholds);
     }
   }
 
@@ -106,6 +117,32 @@ class CorrelationEngine {
     const delta = currentCount - previousCount;
     
+    // ==================== INSTRUMENTATION ====================
+    const timestamp = new Date().toISOString();
+    const willEmit = Math.abs(delta) >= this.minDelta;
+    
+    if (DEBUG_HUME) {
+      console.log(
+        `CORR_CHECK ts=${timestamp} threshold=${this.minDelta} prev=${previousCount} curr=${currentCount} delta=${delta} willEmit=${willEmit}`
+      );
+    }
+    
+    // ==================== DEBUGGER HOOK ====================
+    // Enable via: window.__SPIKELY_DEBUG__ = true in console
+    if (typeof window !== 'undefined' && window.__SPIKELY_DEBUG__ === true) {
+      if (Math.abs(delta) >= Math.abs(this.minDelta)) {
+        console.debug(
+          `[DEBUG HOOK] Threshold met: delta=${delta}, threshold=${this.minDelta}. ` +
+          `Pausing at debugger (if DevTools open)...`
+        );
+        debugger;  // Pause execution for inspection
+      }
+    }
+    // =======================================================
+    
     // Only trigger if delta exceeds threshold
-    if (Math.abs(delta) >= this.minDelta) {
+    if (willEmit) {
+      // Log insight emission
+      console.log(
+        `INSIGHT_EMIT ts=${timestamp} type="viewer-spike" delta=${delta} threshold=${this.minDelta}`
+      );
+      
       this.emitStatus('ANALYZING');
```

### Diff 3: Add Instrumentation to Sidepanel Slider

**File**: `/app/frontend/extension/sidepanel.js`

**Intent**: Log SLIDER_CHANGE when user moves slider

```diff
--- a/app/frontend/extension/sidepanel.js
+++ b/app/frontend/extension/sidepanel.js
@@ -73,9 +73,15 @@ function setupEventListeners() {
   
   slider.addEventListener('input', () => {
     const value = parseInt(slider.value);
     MIN_DELTA = value;
     
+    // ==================== INSTRUMENTATION ====================
+    const timestamp = new Date().toISOString();
+    console.log(`SLIDER_CHANGE ts=${timestamp} value=${value}`);
+    // ==========================================================
+    
     // Update UI
     badge.textContent = '±' + value;
     badge.style.color = value <= 5 ? '#10b981' : value <= 10 ? '#f59e0b' : '#ef4444';
```

### Diff 4: Add Unit Tests

**File**: `/app/frontend/extension/tests/correlationEngine.test.js` (NEW FILE)

```javascript
/**
 * Unit tests for Correlation Engine threshold behavior
 * Run with: npm test or jest correlationEngine.test.js
 */

// Mock dependencies
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    lastError: null
  }
};

global.DEBUG_HUME = true;  // Enable instrumentation logs

const CorrelationEngine = require('../correlationEngine.js').default || require('../correlationEngine.js').correlationEngine;

describe('Correlation Engine Threshold Tests', () => {
  let engine;
  let emitInsightSpy;
  
  beforeEach(() => {
    // Reset engine before each test
    engine = new CorrelationEngine();
    
    // Spy on emitInsight method
    emitInsightSpy = jest.spyOn(engine, 'emitInsight').mockImplementation(() => {});
    
    // Clear console mocks
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  test('setThresholds updates minDelta with correct object structure', () => {
    // Initial default
    expect(engine.minDelta).toBe(10);
    
    // Update with correct structure
    engine.setThresholds({ minTrigger: 5 });
    expect(engine.minDelta).toBe(5);
    
    // Verify SLIDER_CHANGE log
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('SLIDER_CHANGE ts=')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('value=5')
    );
  });
  
  test('setThresholds warns on invalid structure', () => {
    // Pass raw number (BUG scenario)
    engine.setThresholds(7);
    
    // minDelta should NOT change
    expect(engine.minDelta).toBe(10);
    
    // Should log warning
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('setThresholds called with invalid structure')
    );
  });
  
  test('emits insight when positive delta equals threshold', () => {
    // Set threshold to +5
    engine.setThresholds({ minTrigger: 5 });
    
    // Simulate viewer sequence
    engine.addViewerSample({ count: 50, timestamp: Date.now() });
    engine.addViewerSample({ count: 55, timestamp: Date.now() + 5000 });  // +5 delta
    
    // Should emit insight
    expect(emitInsightSpy).toHaveBeenCalledTimes(1);
    
    // Verify INSIGHT_EMIT log
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('INSIGHT_EMIT')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('delta=5')
    );
  });
  
  test('emits insight when negative delta equals threshold', () => {
    // Set threshold to 5 (applies to both + and -)
    engine.setThresholds({ minTrigger: 5 });
    
    // Simulate viewer sequence with drop
    engine.addViewerSample({ count: 50, timestamp: Date.now() });
    engine.addViewerSample({ count: 45, timestamp: Date.now() + 5000 });  // -5 delta
    
    // Should emit insight
    expect(emitInsightSpy).toHaveBeenCalledTimes(1);
    
    // Verify INSIGHT_EMIT log shows negative delta
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('delta=-5')
    );
  });
  
  test('does NOT emit when delta below threshold', () => {
    // Set threshold to +5
    engine.setThresholds({ minTrigger: 5 });
    
    // Simulate small change
    engine.addViewerSample({ count: 50, timestamp: Date.now() });
    engine.addViewerSample({ count: 53, timestamp: Date.now() + 5000 });  // +3 delta
    
    // Should NOT emit
    expect(emitInsightSpy).not.toHaveBeenCalled();
    
    // CORR_CHECK should show willEmit=false
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('willEmit=false')
    );
  });
  
  test('logs CORR_CHECK for every viewer update', () => {
    engine.setThresholds({ minTrigger: 5 });
    
    // Add 3 samples
    engine.addViewerSample({ count: 50, timestamp: Date.now() });
    engine.addViewerSample({ count: 52, timestamp: Date.now() + 5000 });
    engine.addViewerSample({ count: 57, timestamp: Date.now() + 10000 });
    
    // Should have 2 CORR_CHECK logs (one per delta calculation)
    const corrCheckLogs = console.log.mock.calls.filter(call =>
      call[0]?.includes('CORR_CHECK')
    );
    expect(corrCheckLogs.length).toBe(2);
  });
  
  test('debugger hook triggers when window.__SPIKELY_DEBUG__ enabled', () => {
    // Enable debug mode
    global.window = { __SPIKELY_DEBUG__: true };
    
    // Mock debugger statement (can't test actual pause)
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    
    engine.setThresholds({ minTrigger: 5 });
    engine.addViewerSample({ count: 50, timestamp: Date.now() });
    engine.addViewerSample({ count: 55, timestamp: Date.now() + 5000 });  // +5 delta
    
    // Should log debug hook message
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG HOOK] Threshold met')
    );
    
    delete global.window;
  });
});
```

### Diff 5: Add Integration Test Harness

**File**: `/app/frontend/extension/tests/integration-threshold.test.js` (NEW FILE)

```javascript
/**
 * Integration test: Simulate slider changes and synthetic viewer events
 * Run with: node tests/integration-threshold.test.js
 */

// Simulate Chrome extension environment
global.chrome = {
  runtime: {
    sendMessage: (msg, callback) => {
      console.log('[Mock Chrome] Message sent:', msg);
      callback && callback({ ok: true });
    },
    onMessage: {
      addListener: jest.fn()
    }
  },
  storage: {
    local: {
      get: (keys, callback) => callback({ minDelta: 3 }),
      set: (obj, callback) => callback && callback()
    }
  }
};

const { correlationEngine } = require('../correlationEngine.js');

async function runIntegrationTest() {
  console.log('\n🧪 INTEGRATION TEST: Threshold Slider Behavior\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Test 1: Set threshold to +5
  console.log('Test 1: Set threshold to +5, emit on +5 delta');
  console.log('─────────────────────────────────────────────');
  
  correlationEngine.setThresholds({ minTrigger: 5 });
  
  // Feed synthetic viewer sequence
  correlationEngine.addViewerSample({ count: 100, timestamp: Date.now() });
  await sleep(1000);
  correlationEngine.addViewerSample({ count: 105, timestamp: Date.now() });  // +5 delta
  
  console.log('✅ Expected: INSIGHT_EMIT log with delta=5\n');
  
  // Test 2: Set threshold to +3, emit on +3 delta
  console.log('Test 2: Set threshold to +3, emit on +3 delta');
  console.log('─────────────────────────────────────────────');
  
  correlationEngine.setThresholds({ minTrigger: 3 });
  
  await sleep(21000);  // Wait past cooldown
  correlationEngine.addViewerSample({ count: 105, timestamp: Date.now() });
  correlationEngine.addViewerSample({ count: 108, timestamp: Date.now() });  // +3 delta
  
  console.log('✅ Expected: INSIGHT_EMIT log with delta=3\n');
  
  // Test 3: Negative delta
  console.log('Test 3: Set threshold to +4, emit on -4 delta');
  console.log('─────────────────────────────────────────────');
  
  correlationEngine.setThresholds({ minTrigger: 4 });
  
  await sleep(21000);  // Wait past cooldown
  correlationEngine.addViewerSample({ count: 108, timestamp: Date.now() });
  correlationEngine.addViewerSample({ count: 104, timestamp: Date.now() });  // -4 delta
  
  console.log('✅ Expected: INSIGHT_EMIT log with delta=-4\n');
  
  // Test 4: Below threshold (no emit)
  console.log('Test 4: Set threshold to +5, NO emit on +2 delta');
  console.log('─────────────────────────────────────────────');
  
  correlationEngine.setThresholds({ minTrigger: 5 });
  
  await sleep(21000);  // Wait past cooldown
  correlationEngine.addViewerSample({ count: 104, timestamp: Date.now() });
  correlationEngine.addViewerSample({ count: 106, timestamp: Date.now() });  // +2 delta
  
  console.log('✅ Expected: CORR_CHECK with willEmit=false, NO INSIGHT_EMIT\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All integration tests complete!\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if executed directly
if (require.main === module) {
  runIntegrationTest().catch(console.error);
}

module.exports = { runIntegrationTest };
```

---

## Pre-Flight Validation Checklist

### 1. Code Review Checks

**Grep for hardcoded thresholds:**
```bash
# Should find NO hardcoded assignments after fix
grep -rn "this.minDelta\s*=\s*[0-9]" /app/frontend/extension/correlationEngine.js

# Expected: Only line 21 (constructor default), no others
```

**Verify setThresholds calls:**
```bash
# Should find the FIXED call with object structure
grep -rn "correlationEngine.setThresholds" /app/frontend/extension/

# Expected output should show: setThresholds({ minTrigger: ... })
```

**Check for SLIDER_CHANGE logs:**
```bash
grep -rn "SLIDER_CHANGE" /app/frontend/extension/

# Expected: 2 occurrences (correlationEngine.js, sidepanel.js)
```

### 2. Unit Test Execution

**Run Jest tests:**
```bash
cd /app/frontend/extension
npm test -- correlationEngine.test.js

# Expected output:
# PASS tests/correlationEngine.test.js
#   Correlation Engine Threshold Tests
#     ✓ setThresholds updates minDelta with correct object structure (Xms)
#     ✓ setThresholds warns on invalid structure (Xms)
#     ✓ emits insight when positive delta equals threshold (Xms)
#     ✓ emits insight when negative delta equals threshold (Xms)
#     ✓ does NOT emit when delta below threshold (Xms)
#     ✓ logs CORR_CHECK for every viewer update (Xms)
#     ✓ debugger hook triggers when window.__SPIKELY_DEBUG__ enabled (Xms)
# 
# Test Suites: 1 passed, 1 total
# Tests:       7 passed, 7 total
```

### 3. Integration Test Execution

**Run synthetic stream harness:**
```bash
cd /app/frontend/extension
node tests/integration-threshold.test.js

# Expected console output (see "Sample Console Output" section below)
```

### 4. Instrumentation Verification

**Check for required log formats:**

Load extension, open background console, move slider, trigger viewer changes:

**SLIDER_CHANGE format:**
```
SLIDER_CHANGE ts=2025-10-20T16:30:15.234Z value=5
```
- Must include ISO timestamp
- Must show new value

**CORR_CHECK format:**
```
CORR_CHECK ts=2025-10-20T16:30:20.123Z threshold=5 prev=100 curr=105 delta=5 willEmit=true
```
- Must show threshold, prev, curr, delta, willEmit

**INSIGHT_EMIT format:**
```
INSIGHT_EMIT ts=2025-10-20T16:30:20.125Z type="viewer-spike" delta=5 threshold=5
```
- Must show delta and threshold

### 5. Debugger Hook Verification

**Enable debug mode:**
```javascript
// In browser console:
window.__SPIKELY_DEBUG__ = true;
```

**Expected behavior:**
- When threshold met, console.debug logs: `[DEBUG HOOK] Threshold met...`
- If DevTools open, execution pauses at `debugger;` statement
- Can inspect `delta`, `this.minDelta`, `currentCount`, `previousCount`

**Disable debug mode:**
```javascript
window.__SPIKELY_DEBUG__ = false;
// OR
delete window.__SPIKELY_DEBUG__;
```

### 6. Manual Functional Testing

**Test Case A: Positive Spike**
1. Load extension
2. Set slider to ±5
3. Open TikTok Live / test stream
4. Start audio
5. Wait for viewer count to increase by 5+
6. **Expected**: Insight appears within 2s

**Test Case B: Negative Drop**
1. Set slider to ±4
2. Wait for viewer count to decrease by 4+
3. **Expected**: Insight appears within 2s

**Test Case C: Below Threshold**
1. Set slider to ±10
2. Viewer count changes by ±3
3. **Expected**: NO insight (CORR_CHECK logs willEmit=false)

**Test Case D: Slider Change Mid-Session**
1. Start with slider at ±3
2. Viewer increases by +4 → No insight
3. Move slider to ±4
4. Viewer increases by +4 again → Insight appears
5. **Expected**: New threshold applies immediately

### 7. Staging Deployment Steps

**Feature Flag Check:**
```javascript
// In correlationEngine.js, verify DEBUG_HUME is true
const DEBUG_HUME = true;  // Instrumentation enabled
```

**Canary Deployment (5% users):**
```bash
# Deploy to staging environment
git checkout -b fix/correlation-threshold
git add extension/background.js extension/correlationEngine.js extension/sidepanel.js
git commit -m "fix: Apply correct threshold from slider to correlation engine"
git push origin fix/correlation-threshold

# Create staging build with feature flag
# (assuming CI/CD pipeline)
# OR manually:
cd /app/frontend/extension
# Build extension package
chrome://extensions → Load unpacked → Select /app/frontend/extension
```

**Monitoring Items:**
- Error rate (should remain <1%)
- Insight emission rate (should INCREASE if users have <10 thresholds)
- Console error logs (check for new errors)
- User feedback (check for "it's working now!" reports)

### 8. Rollback Plan

**If issues detected:**

**Option A: Revert commit**
```bash
git revert <commit-hash>
git push origin main
```

**Option B: Hotfix**
```javascript
// In correlationEngine.js, temporarily revert to:
this.minDelta = 10;  // Restore hardcoded default

// In background.js, comment out:
// correlationEngine.setThresholds({ minTrigger: message.minDelta });
```

**Option C: Feature flag disable** (if implemented)
```javascript
const ENABLE_THRESHOLD_FIX = false;  // Disable new behavior

if (ENABLE_THRESHOLD_FIX) {
  correlationEngine.setThresholds({ minTrigger: message.minDelta });
} else {
  // Legacy behavior (ignore slider)
}
```

**Rollback Time Estimate**: 5-10 minutes (git revert + reload extension)

---

## Sample Console Output

**Expected logs when slider set to ±5 and viewer increases from 100 → 105:**

```
SLIDER_CHANGE ts=2025-10-20T16:30:15.234Z value=5
[THRESHOLD:BG:APPLIED] Set correlation engine minDelta to: 5
CORR_CHECK ts=2025-10-20T16:30:20.123Z threshold=5 prev=100 curr=105 delta=5 willEmit=true
[DEBUG HOOK] Threshold met: delta=5, threshold=5. Pausing at debugger (if DevTools open)...
INSIGHT_EMIT ts=2025-10-20T16:30:20.125Z type="viewer-spike" delta=5 threshold=5
[Correlation] Analyzing viewer spike: +5
[Correlation] 🎯 Emitting insight: Keep doing this
```

**Expected logs when delta below threshold (slider=±5, delta=+3):**

```
CORR_CHECK ts=2025-10-20T16:31:10.456Z threshold=5 prev=105 curr=108 delta=3 willEmit=false
[Correlation] Delta +3 below threshold 5, skipping insight
```

**Expected logs when slider changed mid-session:**

```
SLIDER_CHANGE ts=2025-10-20T16:32:00.789Z value=3 (previous: 5)
[THRESHOLD:BG:APPLIED] Set correlation engine minDelta to: 3
CORR_CHECK ts=2025-10-20T16:32:15.012Z threshold=3 prev=108 curr=111 delta=3 willEmit=true
INSIGHT_EMIT ts=2025-10-20T16:32:15.014Z type="viewer-spike" delta=3 threshold=3
```

---

## Sample Jest Unit Test (Minimal Example)

```javascript
test('threshold +5 triggers insight on +5 delta', () => {
  const engine = new CorrelationEngine();
  const emitSpy = jest.spyOn(engine, 'emitInsight').mockImplementation(() => {});
  
  // Set threshold to +5
  engine.setThresholds({ minTrigger: 5 });
  expect(engine.minDelta).toBe(5);
  
  // Add viewer samples
  engine.addViewerSample({ count: 100, timestamp: Date.now() });
  engine.addViewerSample({ count: 105, timestamp: Date.now() + 5000 });
  
  // Assert insight emitted
  expect(emitSpy).toHaveBeenCalledTimes(1);
  
  // Verify INSIGHT_EMIT log
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('INSIGHT_EMIT')
  );
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining('delta=5')
  );
});
```

---

## Exact Commands for Local Verification

### Start Dev Server
```bash
# Terminal 1: Start extension in dev mode
cd /app/frontend/extension
# No server needed - Chrome extension runs locally

# Load extension:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select /app/frontend/extension directory
```

### Run Unit Tests
```bash
# Terminal 2: Run Jest tests
cd /app/frontend/extension
npm install --save-dev jest
npm test -- tests/correlationEngine.test.js --verbose

# Expected output: 7 tests pass
```

### Run Integration Test
```bash
# Terminal 3: Run synthetic stream harness
cd /app/frontend/extension
node tests/integration-threshold.test.js

# Watch console for:
# - SLIDER_CHANGE logs
# - CORR_CHECK logs  
# - INSIGHT_EMIT logs (or absence when delta < threshold)
```

### Verify in Browser
```bash
# 1. Open Chrome with extension loaded
# 2. Navigate to chrome://extensions/
# 3. Click "service worker" link under Spikely extension
# 4. In console, run:
window.__SPIKELY_DEBUG__ = true;

# 5. Open extension side panel (click icon or Ctrl+Shift+S)
# 6. Move threshold slider
# 7. Watch console for SLIDER_CHANGE log

# 8. Open TikTok Live / test stream
# 9. Start audio
# 10. Watch for CORR_CHECK and INSIGHT_EMIT logs
```

---

## Deployment Steps

### Staging Canary (5%)

**Prerequisites:**
- All unit tests passing
- Integration test verified
- Manual testing complete
- Code review approved

**Deploy:**
```bash
# 1. Create deployment branch
git checkout -b deploy/correlation-threshold-fix
git add extension/background.js extension/correlationEngine.js extension/sidepanel.js
git add extension/tests/
git commit -m "fix: Apply threshold slider value to correlation engine

- Fix setThresholds() to accept { minTrigger } object
- Add SLIDER_CHANGE, CORR_CHECK, INSIGHT_EMIT instrumentation
- Add window.__SPIKELY_DEBUG__ debugger hook
- Add unit and integration tests

Closes: #ISSUE-NUMBER"

git push origin deploy/correlation-threshold-fix

# 2. Deploy to staging (5% canary)
# (Assuming CI/CD pipeline with canary deployment)
# OR manually distribute to 5% test users

# 3. Monitor for 24 hours
# - Check error logs
# - Verify insight emission rate increases
# - Collect user feedback
```

### Gradual Rollout

**25% → 50% → 100% over 3 days:**
```bash
# Day 1: 25% after 24hr canary success
# Update deployment config or manually distribute

# Day 2: 50% after 48hr monitoring
# Continue monitoring error rates

# Day 3: 100% full rollout
# Announce to users: "Threshold slider now works correctly!"
```

### Rollback Instructions

**If error rate >2% or critical bugs:**

**Immediate Rollback:**
```bash
# 1. Revert deployment
git revert <commit-hash>
git push origin main

# 2. Redeploy previous version
# (Via CI/CD or manual distribution)

# 3. Notify users
# "We've temporarily reverted a recent change. Investigating."

# 4. Debug offline
# - Review logs
# - Reproduce issue locally
# - Create hotfix branch
```

**Estimated Rollback Time**: 10-15 minutes

---

## Time Estimates

**Quick Patch (Fix + Tests):**
- Code changes: 30 min
- Unit tests: 45 min
- Integration test: 30 min
- Manual testing: 30 min
- Code review: 30 min
- **Total: 2.5-3 hours**

**Full Rollout:**
- Staging canary (5%): 24 hours monitoring
- Gradual rollout (25/50/100%): 2-3 days
- **Total: ~1 day** (assuming canary success)

**Rollback (if needed):**
- Identify issue: 15 min
- Revert code: 5 min
- Redeploy: 10 min
- **Total: 30 min emergency rollback**

---

## Acceptance Criteria Verification

### ✅ Criterion 1: Slider ±5 triggers on +5 spike
**Test**: Set slider to ±5, viewer increases 100 → 105
**Expected**: INSIGHT_EMIT log appears within 2s
**Status**: Pass/Fail (after testing)

### ✅ Criterion 2: Slider ±5 triggers on -5 drop
**Test**: Set slider to ±5, viewer decreases 105 → 100
**Expected**: INSIGHT_EMIT log appears within 2s
**Status**: Pass/Fail (after testing)

### ✅ Criterion 3: Console shows threshold and delta
**Test**: Check CORR_CHECK log format
**Expected**: `CORR_CHECK ts=... threshold=5 delta=5 willEmit=true`
**Status**: Pass/Fail (after testing)

### ✅ Criterion 4: Debugger hook pausable in dev mode
**Test**: Set `window.__SPIKELY_DEBUG__ = true`, trigger threshold
**Expected**: Execution pauses at `debugger;` statement, can inspect variables
**Status**: Pass/Fail (after testing)

---

## Summary

**Root Cause**: Type mismatch - `setThresholds()` expects object, receives number  
**Fix**: Pass `{ minTrigger: value }` instead of raw value  
**Instrumentation**: SLIDER_CHANGE, CORR_CHECK, INSIGHT_EMIT logs with timestamps  
**Debugger Hook**: `window.__SPIKELY_DEBUG__` enables breakpoints on threshold  
**Tests**: 7 unit tests + integration harness + manual test cases  
**Deployment**: Minimal changes, feature-flaggable, canary 5% → gradual → 100%  
**Rollback**: Git revert + redeploy in <15 min  

**Ready for QA sign-off and staging deployment.**
