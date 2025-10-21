// ========================================
// Spikely Extension - Debug & Test Script
// ========================================
// Run this in Chrome DevTools Console while side panel is open
// To use: Copy entire script and paste into console, then press Enter

console.log('🔍 Starting Spikely Extension Debug Suite...\n');

// ========================================
// TEST 1: DOM Elements Check
// ========================================
console.log('=== TEST 1: DOM Elements ===');
const elementsToCheck = {
  'Viewer Delta': 'viewerDelta',
  'Viewer Count': 'viewerCount',
  'Threshold Badge (Gray)': 'thresholdBadgeGray',
  'Audio Button': 'startAudioBtn',
  'Audio Status Dot': 'audioStatusDot',
  'Audio Status Label': 'audioStatusLabel',
  'Cooldown Timer': 'cooldownTimer',
  'Insight Content': 'insightContent',
  'Winning Actions': 'winningActions',
  'Losing Actions': 'losingActions'
};

const elementResults = {};
Object.entries(elementsToCheck).forEach(([name, id]) => {
  const el = document.getElementById(id);
  elementResults[name] = el ? '✅ Found' : '❌ Missing';
  console.log(`${name}: ${elementResults[name]}`);
  if (el) {
    console.log(`  → Classes: ${el.className || '(none)'}`);
    console.log(`  → Text: "${el.textContent?.trim().substring(0, 30)}..."`);
  }
});

// ========================================
// TEST 2: Tooltip Verification
// ========================================
console.log('\n=== TEST 2: Tooltips ===');
const tooltipElements = [
  { id: 'viewerDelta', expected: 'Viewer change' },
  { id: 'viewerCount', expected: 'Current live viewers' },
  { id: 'thresholdBadgeGray', expected: 'Sensitivity threshold' },
  { id: 'startAudioBtn', expected: 'audio' }
];

tooltipElements.forEach(({ id, expected }) => {
  const el = document.getElementById(id);
  if (el) {
    const hasTooltip = el.title && el.title.toLowerCase().includes(expected.toLowerCase().split(' ')[0]);
    console.log(`${id}: ${hasTooltip ? '✅ Tooltip OK' : '❌ Tooltip Missing'}`);
    console.log(`  → Title: "${el.title}"`);
  } else {
    console.log(`${id}: ❌ Element not found`);
  }
});

// ========================================
// TEST 3: Audio Button State
// ========================================
console.log('\n=== TEST 3: Audio Button State ===');
const audioBtn = document.getElementById('startAudioBtn');
const audioDot = document.getElementById('audioStatusDot');
const audioLabel = document.getElementById('audioStatusLabel');

if (audioBtn && audioDot && audioLabel) {
  const btnText = audioBtn.querySelector('.btn-text')?.textContent;
  const btnIcon = audioBtn.querySelector('.btn-icon')?.textContent;
  const dotColor = window.getComputedStyle(audioDot).backgroundColor;
  const labelText = audioLabel.textContent;
  
  console.log(`Button Text: "${btnText}"`);
  console.log(`Button Icon: "${btnIcon}"`);
  console.log(`Button Classes: "${audioBtn.className}"`);
  console.log(`Dot Color: ${dotColor}`);
  console.log(`Dot Classes: "${audioDot.className}"`);
  console.log(`Label Text: "${labelText}"`);
  console.log(`Label Classes: "${audioLabel.className}"`);
  
  // Check expected state
  const expectedStopped = btnText === 'Start Audio' && labelText === 'Audio: Stopped';
  const expectedRecording = btnText === 'Stop Audio' && labelText === 'Audio: Recording';
  
  if (expectedStopped) {
    console.log('✅ Audio state: STOPPED (correct)');
  } else if (expectedRecording) {
    console.log('✅ Audio state: RECORDING (correct)');
  } else {
    console.log('❌ Audio state: INCONSISTENT');
    console.log('   Expected: "Start Audio" + "Audio: Stopped" OR "Stop Audio" + "Audio: Recording"');
  }
} else {
  console.log('❌ Audio elements missing');
}

// ========================================
// TEST 4: Animation Check
// ========================================
console.log('\n=== TEST 4: Animations ===');
const statusPulseDot = document.querySelector('.status-pulse-dot');
const audioStatusDot = document.querySelector('.audio-status-dot');

if (statusPulseDot) {
  const animation = window.getComputedStyle(statusPulseDot).animation;
  console.log(`Status Pulse Dot: ${animation.includes('pulse') ? '✅ Animated' : '❌ No animation'}`);
  console.log(`  → Animation: ${animation}`);
} else {
  console.log('Status Pulse Dot: ⚠️ Not found (may not be visible yet)');
}

if (audioStatusDot) {
  const animation = window.getComputedStyle(audioStatusDot).animation;
  const isRecording = audioStatusDot.classList.contains('recording');
  console.log(`Audio Status Dot: ${isRecording ? '🔴 Recording' : '⚪ Stopped'}`);
  console.log(`  → Animation: ${animation !== 'none' ? animation : 'none (correct for stopped state)'}`);
} else {
  console.log('Audio Status Dot: ❌ Not found');
}

// ========================================
// TEST 5: Viewer Delta Display
// ========================================
console.log('\n=== TEST 5: Viewer Metrics ===');
const deltaEl = document.getElementById('viewerDelta');
const countEl = document.getElementById('viewerCount');
const thresholdEl = document.getElementById('thresholdBadgeGray');

if (deltaEl && countEl && thresholdEl) {
  const delta = deltaEl.textContent;
  const count = countEl.textContent;
  const threshold = thresholdEl.textContent;
  const deltaColor = window.getComputedStyle(deltaEl).color;
  
  console.log(`Delta: ${delta} (color: ${deltaColor})`);
  console.log(`Count: ${count}`);
  console.log(`Threshold: ${threshold}`);
  
  // Check color coding
  const deltaNum = parseInt(delta);
  if (deltaNum > 0 && deltaColor.includes('16, 185, 129')) {
    console.log('✅ Positive delta color: GREEN (correct)');
  } else if (deltaNum < 0 && deltaColor.includes('239, 68, 68')) {
    console.log('✅ Negative delta color: RED (correct)');
  } else if (deltaNum === 0) {
    console.log('✅ Zero delta color: GRAY (correct)');
  } else {
    console.log('⚠️ Delta color may not match expected');
  }
} else {
  console.log('❌ Viewer metric elements missing');
}

// ========================================
// TEST 6: Timestamp Elements
// ========================================
console.log('\n=== TEST 6: Timestamps ===');
const timestampEls = document.querySelectorAll('[data-timestamp]');
console.log(`Found ${timestampEls.length} elements with timestamps`);

if (timestampEls.length > 0) {
  console.log('✅ Timestamp updater should be monitoring these elements');
  timestampEls.forEach((el, i) => {
    console.log(`  ${i + 1}. "${el.textContent}" (timestamp: ${el.getAttribute('data-timestamp')})`);
  });
} else {
  console.log('⚠️ No timestamp elements yet (add actions to test)');
}

// ========================================
// TEST 7: CSS Loading
// ========================================
console.log('\n=== TEST 7: CSS & Resources ===');
const cssLink = document.querySelector('link[rel="stylesheet"][href*="sidepanel.css"]');
if (cssLink) {
  console.log(`CSS Link: ${cssLink.href}`);
  console.log(`Has cache bust: ${cssLink.href.includes('?v=') ? '✅ Yes' : '❌ No'}`);
} else {
  console.log('❌ CSS link not found');
}

const inlineStyle = document.querySelector('style');
if (inlineStyle) {
  const hasKeyframes = inlineStyle.textContent.includes('@keyframes');
  console.log(`Inline <style>: ${hasKeyframes ? '✅ Has keyframes' : '❌ No keyframes'}`);
} else {
  console.log('⚠️ No inline <style> tag found');
}

// ========================================
// TEST 8: Function Availability
// ========================================
console.log('\n=== TEST 8: Global Functions ===');
const functionsToCheck = [
  'updateAudioState',
  'updateViewerDeltaDisplay', 
  'initializeUIFeatures',
  'setupTooltips',
  'updateInsight',
  'addAction'
];

functionsToCheck.forEach(fnName => {
  const exists = typeof window[fnName] === 'function';
  console.log(`${fnName}: ${exists ? '✅ Available' : '❌ Not available (may be in module scope)'}`);
});

// ========================================
// MANUAL TEST FUNCTIONS
// ========================================
console.log('\n=== MANUAL TEST FUNCTIONS ===');
console.log('Run these commands to test functionality:\n');

console.log('1. Test audio state toggle:');
console.log('   document.getElementById("startAudioBtn").click()');

console.log('\n2. Simulate viewer update:');
console.log('   (requires access to updateViewerCount function)');

console.log('\n3. Check initialization logs:');
console.log('   Filter console by "[UI:INIT]"');

console.log('\n4. Test insight rendering:');
console.log('   document.getElementById("testInsightBtn")?.click()');

// ========================================
// SUMMARY
// ========================================
console.log('\n=== DEBUG SUMMARY ===');
const totalTests = 8;
let passedTests = 0;

// Calculate pass/fail (simplified)
if (Object.values(elementResults).filter(r => r.includes('✅')).length >= 8) passedTests++;
if (tooltipElements.every(t => document.getElementById(t.id)?.title)) passedTests++;
if (audioBtn && audioLabel) passedTests++;
// ... etc

console.log(`\n📊 Tests Completed: ${totalTests}`);
console.log('📝 Review output above for detailed results');
console.log('\n💡 Tips:');
console.log('   - If many elements are missing, the page may not have loaded');
console.log('   - If tooltips are missing, check "[UI:INIT]" logs');
console.log('   - If animations not working, check inline <style> tag');
console.log('   - Hard reload extension: chrome://extensions/ → Reload');

console.log('\n✅ Debug suite complete!');
