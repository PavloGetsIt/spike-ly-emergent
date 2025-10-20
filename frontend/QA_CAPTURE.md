# Audio Capture QA Checklist

## Pre-Test Setup

1. **Install Extension**
   - Load unpacked extension in Chrome
   - Verify icon appears in toolbar
   - Check manifest.json has correct permissions

2. **Open Livestream Tab**
   - Navigate to TikTok Live, YouTube Live, Twitch, or Kick
   - Ensure audio is playing
   - Keep tab active

3. **Open Side Panel**
   - Click Spikely extension icon
   - Or use keyboard shortcut: Ctrl+Shift+S (Cmd+Shift+S on Mac)
   - Panel should appear on right side

---

## Test 1: tabCapture (Primary Method)

### Steps
1. Open livestream tab with audio playing
2. Open Spikely side panel
3. Click "Start Audio" button

### Expected Console Output
```
[Spikely] Attempting tabCapture()
[Audio Capture] Starting capture for tab <tabId>
[Audio Capture] Creating offscreen document...
[Audio Capture] ✅ Offscreen document created
[Audio Capture] Requesting media stream ID for tab: <tabId>
[Audio Capture] ✅ Got stream ID: <streamId>
[Offscreen] Starting audio capture with stream ID: <streamId>
[Offscreen] ✅ Media stream obtained
[Offscreen] Audio settings: {"sampleRate":48000,"channelCount":2,...}
[Offscreen] Connecting to Deepgram: wss://...
[Offscreen] ✅ Connected to Deepgram
[Spikely] Token response status: 200
[Spikely] WebSocket open
[Spikely] Sent audio frames: <count>
[Offscreen] 📝 FINAL: <transcript text>
```

### Expected UI Behavior
- Button changes from "Start Audio" → "Starting..." → "Stop Audio"
- Audio indicator pulses when audio detected
- Transcript lines appear in panel
- No error messages in console

### Pass Criteria
✅ No "Extension has not been invoked" error  
✅ Audio tracks detected: 1 or more  
✅ WebSocket connects and stays open  
✅ Frames sent counter increments  
✅ Transcripts appear within 2-3 seconds  

---

## Test 2: getDisplayMedia Fallback

### Steps
1. Open livestream tab
2. Open side panel
3. Click "Start Audio"
4. If tabCapture fails → confirm fallback prompt
5. In share dialog:
   - Select the livestream tab
   - ✅ Check "Share tab audio"
   - Click "Share"

### Expected Console Output
```
[Spikely] tabCapture lastError: <error message>
[Spikely] getDisplayMedia fallback invoked
[Spikely Side Panel] Attempting getDisplayMedia fallback
[Spikely Side Panel] ✅ getDisplayMedia succeeded
[Spikely Side Panel] Stream audio tracks: 1
[Spikely AudioProcessor] Initializing audio processor...
[Spikely AudioProcessor] Audio tracks: 1
[Spikely AudioProcessor] Audio settings: {"sampleRate":48000,"channelCount":1,...}
[Spikely AudioProcessor] AudioContext created: sampleRate=24000Hz
[Spikely AudioProcessor] Connecting WebSocket: <url>
[Spikely AudioProcessor] ✅ WebSocket connected
[Spikely AudioProcessor] ✅ Using AudioWorklet (preferred)
[Spikely AudioProcessor] ✅ Audio processing started
[Spikely AudioProcessor] Sent 100 audio frames
[Spikely AudioProcessor] 📝 Transcript: "<text>"
```

### Expected UI Behavior
- Fallback prompt appears with clear instructions
- Browser's screen share dialog shows
- After selecting tab + audio: button shows "Stop Audio"
- Transcripts appear normally

### Pass Criteria
✅ Fallback prompt is clear and helpful  
✅ Stream has audio tracks after selection  
✅ Processing starts without errors  
✅ Transcripts work same as tabCapture  

---

## Test 3: Token Security

### Steps
1. Open browser DevTools → Network tab
2. Start audio capture
3. Inspect WebSocket connections
4. Check all XHR/Fetch requests

### Expected
- **Token fetch**: POST to `/functions/v1/realtime-token` returns 200
- **WebSocket**: Connects to Lovable function relay (not direct to provider)
- **NO API keys** visible in:
  - Request headers
  - URL parameters  
  - WebSocket frames
  - JavaScript bundles

### Pass Criteria
✅ Token endpoint returns: `{status:"ok", provider:"deepgram", ...}`  
✅ No `DEEPGRAM_API_KEY` or similar in client code  
✅ WebSocket URL goes through Lovable relay  

---

## Test 4: Error Recovery

### Test 4a: No Audio in Stream
1. Open a silent tab (no audio playing)
2. Try to start audio capture

Expected: Clear error message or warning that audio is required

### Test 4b: Deny getDisplayMedia
1. Trigger fallback
2. Click "Cancel" in share dialog

Expected: 
- Alert: "Screen sharing was cancelled"
- Button returns to "Start Audio"

### Test 4c: Token Fetch Fails
1. Temporarily break edge function or remove API key
2. Try to start capture

Expected:
```
[Spikely] Token response status: 500, body: <error>
[Spikely] Token fetch failed — see server logs
```
- WebSocket should NOT attempt to connect
- Error message shown to user

### Test 4d: WebSocket Disconnects Mid-Stream
1. Start capture successfully
2. Simulate network interruption or close relay

Expected:
- Console shows: "WebSocket closed: code=<code>"
- Reconnection attempts logged
- Eventually shows error if max attempts exceeded

---

## Test 5: Performance & Stability

### Steps
1. Start audio capture
2. Let run for 5 minutes
3. Monitor console for:
   - Frame count incrementing steadily
   - No memory leaks
   - Keepalive messages every ~25s

### Expected Console (sampled)
```
[Offscreen] Sent 100 audio frames
[Offscreen] 💓 Keepalive sent
[Offscreen] Sent 200 audio frames
[Offscreen] 📝 FINAL: <transcript>
[Offscreen] Sent 300 audio frames
```

### Pass Criteria
✅ Frame counter increases continuously  
✅ No console errors or warnings  
✅ Keepalive messages appear  
✅ Memory usage stable (check Task Manager)  
✅ Transcripts appear for all speech  

---

## Test 6: Multi-Platform

Test on each platform:
- ✅ TikTok Live
- ✅ YouTube Live
- ✅ Twitch
- ✅ Kick

Expected: Same behavior across all platforms

---

## Test 7: Stop & Restart

### Steps
1. Start audio capture
2. Wait for transcripts
3. Click "Stop Audio"
4. Wait 5 seconds
5. Click "Start Audio" again

### Expected
- Clean stop: all connections closed
- Restart works same as initial start
- No lingering connections or errors

---

## Debug Checklist (printed to console at start)

When audio capture starts, should see:

```
[Spikely AudioProcessor] === AUDIO CAPTURE DEBUG CHECKLIST ===
[Spikely AudioProcessor] Audio tracks: 1
[Spikely AudioProcessor] Settings: sampleRate=48000, channelCount=1, deviceId=<id>
[Spikely AudioProcessor] AudioContext: sampleRate=24000Hz, state=running
[Spikely AudioProcessor] WebSocket: state=OPEN
[Spikely AudioProcessor] Frames sent: 0
[Spikely AudioProcessor] Processing: YES
[Spikely AudioProcessor] =====================================
```

---

## Common Issues & Solutions

### Issue: "Extension has not been invoked"
**Cause**: tabCapture called without user gesture or wrong context  
**Solution**: Ensure capture is triggered from background.js, not content script

### Issue: No audio tracks in stream
**Cause**: User didn't check "Share tab audio" in getDisplayMedia  
**Solution**: Show clearer instructions in fallback prompt

### Issue: Token fetch fails
**Cause**: API key not set in Supabase  
**Solution**: Add DEEPGRAM_API_KEY secret

### Issue: WebSocket closes immediately
**Cause**: Invalid token or relay misconfigured  
**Solution**: Check edge function logs

---

## Final Acceptance

All tests must pass for acceptance:

- [x] Test 1: tabCapture works without errors
- [x] Test 2: Fallback to getDisplayMedia works
- [x] Test 3: No API keys exposed to client
- [x] Test 4a-d: All error cases handled gracefully
- [x] Test 5: Stable for 5+ minutes
- [x] Test 6: Works on all platforms
- [x] Test 7: Stop/restart clean

---

## Production Readiness

Before deploying:

1. ✅ Set `debugEnabled = false` in audioProcessor.js for production
2. ✅ Verify all API keys stored securely in Supabase secrets
3. ✅ Test on clean browser profile
4. ✅ Test with multiple concurrent tabs
5. ✅ Load test edge functions
6. ✅ Document for users: permissions needed, fallback instructions
