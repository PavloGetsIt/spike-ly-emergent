# Spikely Project - Continuation Summary

This document captures the current state of the Spikely project as of version 2.9.0, including implemented functionality, outstanding issues, and next steps.

## 1. System Architecture Overview
- Chrome Extension (Manifest V3) provides the side panel interface for streamers.
- FastAPI backend integrates with Claude Sonnet 4.5 for AI-driven insights.
- MongoDB stores session data and correlation results.
- Real-time audio pipeline streams audio to AssemblyAI and forwards transcripts to Hume AI for emotion analysis.
- DOM tracking monitors TikTok Live viewer counts and chat activity.
- Insight generation runs on a 20-second auto timer with threshold-triggered insights.

## 2. Implemented Components
- **Sidepanel UI** (`sidepanel.js`): controls audio start/stop, displays viewer counts, insight cards, threshold slider, and niche selection.
- **Background Service Worker** (`background.js`): routes messages, controls audio capture, relays WebSocket data, and hosts the correlation engine.
- **Content Scripts** (`content_minimal.js`): perform DOM detection for viewer data and bridge page messages.
- **Audio Processor** (`audioProcessor.js`): handles audio encoding and streaming to AssemblyAI while managing WebSocket lifecycle events.
- **Correlation Engine** (`correlationEngine.js`): matches viewer changes with streamer actions and triggers insights.
- **Template Bank** (`templateBank.js`): supplies 30 micro-action templates for fallback insights when Claude is unavailable.

## 3. Data Flow
```
TikTok Live Page → Content Script → Background → Correlation Engine → FastAPI → Claude → Insights → Sidepanel
Audio Capture → AssemblyAI → Transcripts → Hume AI → Emotions → Correlation Engine → Insights
```

## 4. Completed Work Highlights
- Real-time transcription pipeline with buffer management and filler filtering.
- Hume AI prosody analysis capturing energy, excitement, and confidence metrics.
- DOM mutation observers for live viewer count monitoring across major streaming platforms.
- Insight generation pipeline with Claude routing and fallback templates governed by confidence tiers.
- Side panel UI enhancements, including threshold controls, tooltips, timestamps, session stats, and niche/goal selection.
- Backend integration with FastAPI, MongoDB, and robust error handling with correlation IDs.

## 5. Current Focus: Reliable MV3 Audio Capture
- Objective: ensure the "Start Audio" button triggers `chrome.tabCapture.capture()` reliably within two seconds.
- Required flow: Sidepanel dispatches `START_AUDIO` → Background validates tab and performs activation hop → tab capture succeeds or returns explicit error.
- Watchdog timeout: operations must resolve within six seconds with deterministic error codes.

## 6. Active Issues
- **Audio Capture Timeout**: `tabCapture.capture()` frequently hangs, leaving the side panel in a perpetual processing state.
- **Viewer Count Parsing**: TikTok DOM detection sometimes resolves to zero despite visible counts.
- **Service Worker Registration**: intermittent `Status code: 15` failures in `chrome://extensions`.
- **Content Script Execution**: scripts load but occasionally fail to run, raising debugger ignore warnings.
- Additional concerns: worker sleep during capture, tab focus loss, context invalidation on reload, and brittle message passing.

## 7. Investigated Approaches
Summaries of attempted solutions:
- **In-Page Button Injection**: maintained page-level gesture but failed due to MV3 restrictions.
- **PostMessage Bridging**: improved observability yet still broke the gesture chain.
- **Content Script Capture**: rejected outright by MV3.
- **Programmatic Injection**: improved content script reliability without fixing capture.
- **Permission Expansion**: reduced permission errors but did not resolve gesture issues.
- **Service Worker Keep-Alive**: extended worker life without restoring gesture context.
- **Direct Background Capture**: current iteration simplifying flow to background-initiated capture.

## 8. Logging Conventions
- `[AUDIO:SP]` for sidepanel audio events.
- `[AUDIO:BG]` for background audio lifecycle events.
- `[SPIKELY]` for viewer detection and general diagnostics.
- State transitions recorded with emoji-coded markers and detailed metadata.

## 9. Root Cause Theory
- MV3 user gesture requirements demand synchronous execution between the user click and the `tabCapture` invocation.
- Tab activation sequencing (via `chrome.scripting.executeScript`) appears necessary to maintain eligibility.
- Service worker lifecycle interruptions may contribute but are likely secondary.

## 10. Upcoming Roadmap (post audio fix)
1. Enhance signal collection with chat, gift, follow, and engagement metrics.
2. Advance correlation capabilities, including spike inference, memory banking, and multi-window analysis.
3. Introduce personalization with creator profiles, audience segmentation, predictive insights, and ML-based template weighting.

## 11. Development Guardrails
- Only the background worker should initiate `tabCapture`.
- Content scripts remain responsible solely for DOM observation.
- The sidepanel manages UI state but does not perform privileged operations.
- Enforce one audio stream per tab with robust stop-before-start semantics.
- Maintain deterministic error handling, clear messaging, and strict logging standards.

## 12. Validation & Testing Checklist
- Confirm extension version `2.9.0` and absence of service worker registration errors.
- Ensure content scripts and background worker log their startup messages.
- Audio Capture Test: verify log progression from start click to stream confirmation with no prolonged processing.
- Viewer Detection Test: `window.__SPIKELY_TEST__()` returns accurate counts and logs success.

## 13. Rollback & Success Metrics
- Rollback steps include reverting to the last working audio flow and retesting viewer detection before reapplying changes.
- Success criteria: rapid audio capture start, accurate viewer counts, regular insight generation, no uncaught background exceptions, and functional permission prompts.

