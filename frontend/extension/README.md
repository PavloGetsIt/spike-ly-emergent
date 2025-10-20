# Spikely Chrome Extension

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` folder
5. The extension should now be installed

## How to Use

1. Open a livestream on TikTok, Twitch, Kick, or YouTube Live
2. Look for the **floating red eye button** in the bottom-right corner
3. Click it to open the **Grammarly-style side panel**
4. The side panel displays:
   - 👁 **Live Viewer Count** with delta (green = gain, red = loss)
   - 📝 **Live Transcription** of your speech
   - 💡 **AI Insights** with coaching feedback
   - 🟩/🟥 **Top Winning/Losing Actions**
5. Keep the panel open while streaming for real-time feedback

## Supported Platforms

- ✅ TikTok Live
- ✅ Twitch
- ✅ Kick.com
- ✅ YouTube Live

## How It Works

1. **Content Script** runs on livestream pages and reads viewer counts from the DOM
2. **Floating Eye Button** appears on streaming platforms (bottom-right corner)
3. **Side Panel** slides in from the right when clicked (Chrome's native side panel API)
4. **WebSocket Connection** streams data in real-time (<100ms latency)
5. **Zero API costs** - reads directly from the page
6. **Cloud-based** - no local server needed

## Features

- ✅ **Grammarly-Style Side Panel** - Non-intrusive, stays visible while streaming
- ✅ **Real-Time Viewer Tracking** - 100% accurate, no OCR needed
- ✅ **Live Transcription** - See what you're saying in real-time
- ✅ **AI Coaching Insights** - Get instant feedback on what's working
- ✅ **Top Actions Panel** - Track your best and worst viewer-impacting moments
- ✅ **Multi-Platform** - Works on TikTok, Twitch, Kick, and YouTube

## Development

To test selectors on a live stream:

```javascript
// Open browser console on the livestream page
// Test if element is found:
document.querySelector('[data-e2e="live-viewer-count"]')?.textContent
```

## Architecture

- Extension connects to: `wss://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/websocket-relay`
- WebSocket relay auto-deploys with your Lovable app
- Works on any computer - no local setup required
- Extension auto-starts tracking when you visit a supported platform

## Notes

- Icons are placeholders (512px resized). You can replace them with properly sized icons later.
- WebSocket relay runs on Lovable Cloud (Supabase Edge Functions)
- Secure WebSocket connection (WSS) ensures data privacy
