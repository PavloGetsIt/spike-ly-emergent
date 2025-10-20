export interface BrowserInfo {
  name: 'Brave' | 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Unknown';
  audioInstructions: string;
  detailedInstructions: string[];
}

export function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent;
  
  // Detect Brave
  if ((navigator as any).brave && typeof (navigator as any).brave.isBrave === 'function') {
    return {
      name: 'Brave',
      audioInstructions: 'Select "Tab" (not Window), then check "Share tab audio". Lower Shields if needed.',
      detailedInstructions: [
        'Click the Brave Shields icon and select "Shields down for this site"',
        'In the screen sharing dialog, select "Tab" (not Window or Entire Screen)',
        'Make sure to check the "Share tab audio" checkbox',
        'Click Share to begin',
      ],
    };
  }
  
  // Detect Chrome
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    return {
      name: 'Chrome',
      audioInstructions: 'Select "Chrome Tab" and check "Share tab audio".',
      detailedInstructions: [
        'In the screen sharing dialog, select "Chrome Tab"',
        'Check the "Share tab audio" checkbox at the bottom',
        'Select the tab with your TikTok livestream',
        'Click Share to begin',
      ],
    };
  }
  
  // Detect Edge
  if (ua.includes('Edg')) {
    return {
      name: 'Edge',
      audioInstructions: 'Select tab and enable "Share audio".',
      detailedInstructions: [
        'In the screen sharing dialog, select the tab option',
        'Enable the "Share audio" checkbox',
        'Select the tab with your TikTok livestream',
        'Click Share to begin',
      ],
    };
  }
  
  // Detect Firefox
  if (ua.includes('Firefox')) {
    return {
      name: 'Firefox',
      audioInstructions: 'Note: Firefox may not support tab audio capture.',
      detailedInstructions: [
        'Firefox has limited support for tab audio capture',
        'The app will use your microphone as a fallback',
        'Make sure to allow microphone access when prompted',
      ],
    };
  }
  
  // Detect Safari
  if (ua.includes('Safari') && !ua.includes('Chrome')) {
    return {
      name: 'Safari',
      audioInstructions: 'Note: Safari may have limited screen sharing support.',
      detailedInstructions: [
        'Safari has limited support for screen capture features',
        'The app will use your microphone as a fallback',
        'For best results, use Chrome or Brave browser',
      ],
    };
  }
  
  return {
    name: 'Unknown',
    audioInstructions: 'Enable audio sharing in your browser.',
    detailedInstructions: [
      'Look for an audio checkbox in the screen sharing dialog',
      'For best results, use Chrome or Brave browser',
    ],
  };
}
