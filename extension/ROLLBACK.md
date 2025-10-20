# Rollback Instructions: Phase 2 Threshold Unification

## Quick Rollback (All Changes)

If you need to revert all Phase 2 threshold unification changes at once:

### Option 1: Using git revert (if changes are a single commit)
```bash
git revert <commit-hash>
```

### Option 2: Using git reset (WARNING: loses uncommitted work)
```bash
git reset --hard <commit-before-phase2>
```

## File-by-File Rollback

To revert specific files individually:

### 1. Revert src/services/correlationService.ts
```bash
git checkout HEAD -- src/services/correlationService.ts
```

**Manual revert steps (if git checkout not feasible):**
- Restore hardcoded thresholds at lines 51-54:
  ```typescript
  let MIN_SPIKE_THRESHOLD = 5;  // minimum for positive spike
  let MIN_DROP_THRESHOLD = 3;   // minimum for negative drop
  let MIN_DUMP_THRESHOLD = 10;  // minimum for large dump
  ```
- Remove `[THRESHOLD:APPLIED]` diagnostic log (line ~152)
- Remove `[FALLBACK:CATEGORY]` diagnostic log (line ~750)
- Restore `setThresholds()` signature with optional parameters (line 560):
  ```typescript
  export function setThresholds(minTrigger: number, minSpike?: number, minDrop?: number, minDump?: number)
  ```
- Restore hardcoded threshold checks in `generateEmotionalContent()`:
  - Line 750: `if (delta >= MIN_SPIKE_THRESHOLD)`
  - Line 773: `if (delta <= -MIN_DUMP_THRESHOLD)`
  - Remove `largeThreshold` calculation

### 2. Revert extension/sidepanel.html
```bash
git checkout HEAD -- extension/sidepanel.html
```

**Manual revert steps:**
- Change line 57: `id="thresholdBadgeGray"` back to `id="thresholdBadge"`

### 3. Revert extension/sidepanel.js
```bash
git checkout HEAD -- extension/sidepanel.js
```

**Manual revert steps:**
- Line 26: Change `thresholdBadgeDisplay` back to `thresholdBadge`
- Line 27: Remove `thresholdBadgeGray` variable
- Line 78: Change `thresholdBadgeGray` back to `thresholdBadge`
- Line 112: Change `thresholdBadgeGray` back to `thresholdBadge`
- Line 559: Change `thresholdBadgeGray` back to `thresholdBadge`
- Line 454: Change `thresholdBadgeGray` back to `thresholdBadge`

### 4. Remove extension/ROLLBACK.md
```bash
rm extension/ROLLBACK.md
```

## Clear Chrome Storage

To ensure rollback is complete, clear the `minDelta` value from extension storage:

```javascript
// Run in extension service worker console or offscreen document
chrome.storage.local.remove(['minDelta'], () => {
  console.log('Cleared minDelta from storage');
});
```

## Verification After Rollback

After rolling back, verify:

1. **Default values restored:**
   - Hardcoded thresholds: `MIN_SPIKE_THRESHOLD = 5`, `MIN_DROP_THRESHOLD = 3`, `MIN_DUMP_THRESHOLD = 10`
   - Badge ID in viewer card: `thresholdBadge` (not `thresholdBadgeGray`)

2. **Diagnostic logs removed:**
   - No `[THRESHOLD:APPLIED]` logs
   - No `[FALLBACK:CATEGORY]` logs with largeThreshold

3. **Rebuild project:**
```bash
npm run build
# or
bun run build
```

4. **Reload extension:**
   - Open `chrome://extensions`
   - Click "Reload" on Spikely extension
   - Test viewer tracking and insight generation

## Partial Rollback Options

### Keep diagnostic logs, revert threshold logic
```bash
git checkout HEAD -- src/services/correlationService.ts
# Keep only the logging additions, manually revert threshold changes
```

### Keep UI fixes, revert backend changes
```bash
git checkout HEAD -- src/services/correlationService.ts
# Keep extension/sidepanel.html and extension/sidepanel.js changes
```

## Cost Impact of Rollback

**Minimal cost impact:**
- Phase 2 changes primarily unified threshold logic and fixed UI bugs
- No new external API calls introduced
- AI call frequency remains controlled by existing cooldowns

## Notes

- Database logs (Supabase `insight_history`, `insight_feedback`) are not affected by rollback
- Extension storage (`chrome.storage.local`) persists until manually cleared
- Edge functions are auto-deployed; rollback requires redeploying previous version

## Support

If rollback fails or causes issues:
1. Check git status: `git status`
2. Review uncommitted changes: `git diff`
3. Contact development team with error logs
