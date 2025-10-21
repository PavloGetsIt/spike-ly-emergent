# Claude Integration Debug Enhancement - Implementation Plan

## Overview
This document outlines all changes needed to add comprehensive debugging and logging to the Claude integration within Spikely's correlation engine.

## Objectives
1. **Request Tracing**: Track each correlation request end-to-end with unique correlation IDs
2. **Full Visibility**: Log complete Claude prompts, responses, and token usage
3. **Timing Breakdowns**: Measure performance at each stage
4. **Error Context**: Capture full error details for troubleshooting
5. **Dev-Only**: Debug mode enabled by default in development, disabled in production

---

## Files to Modify

### 1. `/app/frontend/.env`
**Purpose**: Add debug mode configuration

**Changes**:
```diff
+ # Debug mode for correlation engine (development only)
+ VITE_DEBUG_CORRELATION=true
```

---

### 2. `/app/frontend/src/services/correlationService.ts`
**Purpose**: Add correlation ID generation and enhanced frontend logging

**Key Changes**:
- Generate unique correlation ID for each insight request
- Log full request payload before API call
- Log full response after API call
- Add detailed timing at each stage
- Improve error logging with correlation context

**Code Changes**:

#### A. Add imports and debug helper (top of file, after existing imports)
```typescript
// After line 3 (after existing imports)
import { Debug } from './debug';

// Generate unique correlation ID
function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Check if debug mode is enabled
const DEBUG_MODE = import.meta.env.VITE_DEBUG_CORRELATION === 'true';

function debugLog(correlationId: string, stage: string, data: any) {
  if (!DEBUG_MODE) return;
  console.log(`[CORRELATION:${correlationId}:${stage}]`, data);
}
```

#### B. Modify the pushViewer function - AI call section (around line 286-390)

**Before** (lines 286-390):
```typescript
    // Try AI-powered insight generation first (always attempt AI, no gating by delta magnitude)
    emitEngineStatus('AI_CALLING');
    // Cancel previous AI call if still in flight (single-flight)
    if (aiInFlight && aiAbortController) {
      console.log('[AI] Cancelling previous in-flight AI call');
      aiAbortController.abort();
      aiCallsAborted++;
    }
    
    // Truncate transcript to last 100 words (before try block)
    const words = segment.text.split(/\s+/);
    const truncatedTranscript = words.slice(-100).join(' ');
    const sanitizedTranscript = truncatedTranscript.slice(0, 100).replace(/\n/g, ' ');
    
    try {
      console.log('🤖 ==========================================');
      console.log('🤖 CALLING CLAUDE API FOR INSIGHT (Web App)');
      console.log('🤖 URL:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`);
      console.log('🤖 Viewer Delta:', delta);
      console.log('🤖 Language Emotion:', emotion.emotion);
      console.log('🤖 Topic:', topic);
      console.log('🤖 ==========================================');
      
      const payload = {
        transcript: truncatedTranscript,
        viewerDelta: delta,
        viewerCount: count,
        prevCount: count - delta,
        language: { emotion: emotion.emotion },
        topic: topic,
        quality: 'GOOD',
        recentHistory: toneHistory.slice(-7).map(h => ({
          delta: h.delta,
          emotion: h.emotion
        }))
      };

      // Setup AbortController with strict timeout
      aiAbortController = new AbortController();
      const timeoutId = setTimeout(() => {
        aiAbortController?.abort();
        console.warn(`[AI] Timeout after ${AI_MAX_LATENCY_MS}ms → fallback`);
      }, AI_MAX_LATENCY_MS);
      
      aiInFlight = true;
      lastAiStartedAt = performance.now();
      aiCallsStarted++;
      
      // [AI:FETCH:STARTING] diagnostic log with sanitized payload
      console.log('[AI:FETCH:STARTING]', {
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`,
        payloadSize: JSON.stringify(payload).length,
        transcriptPreview: sanitizedTranscript,
        delta: payload.viewerDelta,
        topic: payload.topic,
        timestamp: new Date().toISOString()
      });
      
      const aiStartTime = performance.now();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: aiAbortController.signal
      });
      
      clearTimeout(timeoutId);
      const aiDuration = performance.now() - aiStartTime;
      aiLatencies.push(aiDuration);
      if (aiLatencies.length > 100) aiLatencies.shift();

      if (response.ok) {
        const aiInsight = await response.json();
        aiCallsSucceeded++;
        aiInFlight = false;
        
        console.log('✅ ==========================================');
        console.log('✅ CLAUDE INSIGHT RECEIVED (Web App)');
        console.log('✅ Response Time:', Math.round(aiDuration), 'ms');
        console.log('✅ Emotional Label:', aiInsight.emotionalLabel);
        console.log('✅ Next Move:', aiInsight.nextMove);
        console.log('✅ ==========================================');
        
        if (aiInsight.emotionalLabel && aiInsight.nextMove) {
          emotionalLabel = aiInsight.emotionalLabel;
          nextMove = aiInsight.nextMove;
        } else {
          throw new Error('Invalid AI response format');
        }
      } else {
        aiCallsFailed++;
        aiInFlight = false;
        
        const errorText = await response.text();
        console.error('❌ ==========================================');
        console.error('❌ CLAUDE API FAILED (Web App)');
        console.error('❌ Status:', response.status);
        console.error('❌ Error:', errorText);
        console.error('❌ Duration:', Math.round(aiDuration), 'ms');
        console.error('❌ ==========================================');
        throw new Error(`AI API error: ${response.status}`);
      }
    } catch (error) {
      // ... existing error handling
    }
```

**After** (enhanced with correlation ID and detailed logging):
```typescript
    // Generate correlation ID for this request
    const correlationId = generateCorrelationId();
    debugLog(correlationId, 'INIT', {
      timestamp: new Date().toISOString(),
      delta,
      count,
      topic,
      emotion: emotion.emotion,
      segmentLength: segment.text.length
    });
    
    // Try AI-powered insight generation first (always attempt AI, no gating by delta magnitude)
    emitEngineStatus('AI_CALLING');
    // Cancel previous AI call if still in flight (single-flight)
    if (aiInFlight && aiAbortController) {
      console.log('[AI] Cancelling previous in-flight AI call');
      aiAbortController.abort();
      aiCallsAborted++;
    }
    
    // Truncate transcript to last 100 words (before try block)
    const words = segment.text.split(/\s+/);
    const truncatedTranscript = words.slice(-100).join(' ');
    const sanitizedTranscript = truncatedTranscript.slice(0, 100).replace(/\n/g, ' ');
    
    try {
      console.log('🤖 ==========================================');
      console.log('🤖 CALLING CLAUDE API FOR INSIGHT (Web App)');
      console.log('🤖 Correlation ID:', correlationId);
      console.log('🤖 URL:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`);
      console.log('🤖 Viewer Delta:', delta);
      console.log('🤖 Language Emotion:', emotion.emotion);
      console.log('🤖 Topic:', topic);
      console.log('🤖 ==========================================');
      
      const payload = {
        correlationId, // Add correlation ID to payload
        transcript: truncatedTranscript,
        viewerDelta: delta,
        viewerCount: count,
        prevCount: count - delta,
        language: { emotion: emotion.emotion },
        topic: topic,
        quality: 'GOOD',
        recentHistory: toneHistory.slice(-7).map(h => ({
          delta: h.delta,
          emotion: h.emotion
        }))
      };

      // Enhanced debug logging of full payload
      debugLog(correlationId, 'PAYLOAD', {
        payloadSize: JSON.stringify(payload).length,
        transcriptWordCount: payload.transcript.split(/\s+/).length,
        fullPayload: DEBUG_MODE ? payload : undefined, // Full payload in debug mode
        delta: payload.viewerDelta,
        topic: payload.topic
      });

      // Setup AbortController with strict timeout
      aiAbortController = new AbortController();
      const timeoutId = setTimeout(() => {
        aiAbortController?.abort();
        debugLog(correlationId, 'TIMEOUT', {
          maxLatency: AI_MAX_LATENCY_MS,
          message: 'Request aborted due to timeout'
        });
        console.warn(`[AI] Timeout after ${AI_MAX_LATENCY_MS}ms → fallback`);
      }, AI_MAX_LATENCY_MS);
      
      aiInFlight = true;
      lastAiStartedAt = performance.now();
      aiCallsStarted++;
      
      // [AI:FETCH:STARTING] diagnostic log with sanitized payload
      const fetchStartTime = performance.now();
      debugLog(correlationId, 'FETCH_START', {
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`,
        timestamp: new Date().toISOString(),
        timeout: AI_MAX_LATENCY_MS
      });
      console.log('[AI:FETCH:STARTING]', {
        correlationId,
        url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`,
        payloadSize: JSON.stringify(payload).length,
        transcriptPreview: sanitizedTranscript,
        delta: payload.viewerDelta,
        topic: payload.topic,
        timestamp: new Date().toISOString()
      });
      
      const aiStartTime = performance.now();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: aiAbortController.signal
      });
      
      clearTimeout(timeoutId);
      const aiDuration = performance.now() - aiStartTime;
      aiLatencies.push(aiDuration);
      if (aiLatencies.length > 100) aiLatencies.shift();

      debugLog(correlationId, 'FETCH_END', {
        status: response.status,
        statusText: response.statusText,
        duration: Math.round(aiDuration),
        ok: response.ok
      });

      if (response.ok) {
        const aiInsight = await response.json();
        aiCallsSucceeded++;
        aiInFlight = false;
        
        // Enhanced debug logging of full response
        debugLog(correlationId, 'RESPONSE', {
          fullResponse: DEBUG_MODE ? aiInsight : undefined,
          emotionalLabel: aiInsight.emotionalLabel,
          nextMove: aiInsight.nextMove,
          source: aiInsight.source,
          duration: Math.round(aiDuration)
        });
        
        console.log('✅ ==========================================');
        console.log('✅ CLAUDE INSIGHT RECEIVED (Web App)');
        console.log('✅ Correlation ID:', correlationId);
        console.log('✅ Response Time:', Math.round(aiDuration), 'ms');
        console.log('✅ Emotional Label:', aiInsight.emotionalLabel);
        console.log('✅ Next Move:', aiInsight.nextMove);
        console.log('✅ Source:', aiInsight.source || 'Claude');
        console.log('✅ ==========================================');
        
        if (aiInsight.emotionalLabel && aiInsight.nextMove) {
          emotionalLabel = aiInsight.emotionalLabel;
          nextMove = aiInsight.nextMove;
        } else {
          throw new Error('Invalid AI response format');
        }
      } else {
        aiCallsFailed++;
        aiInFlight = false;
        
        const errorText = await response.text();
        debugLog(correlationId, 'ERROR', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.slice(0, 200),
          duration: Math.round(aiDuration)
        });
        
        console.error('❌ ==========================================');
        console.error('❌ CLAUDE API FAILED (Web App)');
        console.error('❌ Correlation ID:', correlationId);
        console.error('❌ Status:', response.status);
        console.error('❌ Error:', errorText);
        console.error('❌ Duration:', Math.round(aiDuration), 'ms');
        console.error('❌ ==========================================');
        throw new Error(`AI API error: ${response.status}`);
      }
    } catch (error) {
      aiInFlight = false;
      
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      
      // [AI:FETCH:FAILED] diagnostic log with error preview (max 100 chars)
      const errorPreview = error instanceof Error 
        ? (error.message || String(error)).slice(0, 100).replace(/\n/g, ' ')
        : String(error).slice(0, 100).replace(/\n/g, ' ');
      
      // Enhanced error logging with correlation ID
      debugLog(correlationId, 'ERROR', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        isAbortError,
        delta,
        topic,
        transcriptPreview: sanitizedTranscript
      });
      
      if (isAbortError) {
        aiCallsAborted++;
        console.warn('[AI:FETCH:FAILED]', {
          correlationId,
          errorName: 'AbortError',
          errorPreview: 'Timeout exceeded',
          isAbortError: true,
          delta,
          topic,
          transcriptPreview: sanitizedTranscript
        });
      } else {
        aiCallsFailed++;
        console.error('[AI:FETCH:FAILED]', {
          correlationId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorPreview,
          isAbortError: false,
          delta,
          topic,
          transcriptPreview: sanitizedTranscript
        });
      }
      // Fall through to fallback logic below
    }
    
    // Fallback logic (runs if AI error)
    if (!nextMove) {
      emitEngineStatus('AI_FALLBACK');
      debugLog(correlationId, 'FALLBACK', {
        reason: 'AI call failed or returned invalid response',
        delta,
        topic
      });
      
      console.warn('⚠️ ==========================================');
      console.warn('⚠️ AI INSIGHT FAILED - USING FALLBACK (Web App)');
      console.warn('⚠️ Correlation ID:', correlationId);
      console.warn('⚠️ Falling back to deterministic system');
      console.warn('⚠️ ==========================================');
      
      // ... existing fallback logic ...
    }
    
    // ... rest of the function ...
```

---

### 3. `/app/frontend/supabase/functions/generate-insight/index.ts`
**Purpose**: Add comprehensive logging in the Edge Function

**Key Changes**:
- Accept correlation ID from request
- Log full Claude system prompt
- Log full Claude user prompt
- Log raw Claude API response
- Log token usage details
- Add timing breakdowns for each stage
- Improve error logging

**Code Changes**:

#### A. Update interface to accept correlationId (line 12)
```diff
  interface InsightRequest {
+   correlationId?: string;
    transcript: string;
    viewerDelta: number;
    // ... rest unchanged
  }
```

#### B. Add debug helper at top (after imports, line 11)
```typescript
// Add after line 11 (after corsHeaders definition)
const DEBUG_MODE = Deno.env.get('ENABLE_CORRELATION_DEBUG') !== 'false'; // Default to true

function debugLog(correlationId: string, stage: string, data: any) {
  if (!DEBUG_MODE) return;
  console.log(`[CORRELATION:${correlationId}:${stage}]`, JSON.stringify(data, null, 2));
}
```

#### C. Enhance main serve function (starting at line 39)

**Key sections to modify:**

1. **After parsing request** (around line 45-46):
```typescript
    const requestStartTime = Date.now();
    const payload: InsightRequest = await req.json();
    const correlationId = payload.correlationId || `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    debugLog(correlationId, 'RECEIVED', {
      timestamp: new Date().toISOString(),
      viewerDelta: payload.viewerDelta,
      viewerCount: payload.viewerCount,
      transcriptLength: payload.transcript?.length || 0,
      topic: payload.topic,
      quality: payload.quality,
      hasHistory: !!payload.recentHistory?.length
    });
```

2. **After building prompts** (around line 178, before Claude API call):
```typescript
    console.log('🤖 ==========================================');
    console.log('🤖 CLAUDE INSIGHT GENERATION STARTED');
    console.log('🤖 Correlation ID:', correlationId);
    console.log('🤖 Timestamp:', new Date().toISOString());
    console.log('🤖 Model: claude-sonnet-4-5');
    console.log('🤖 Viewer Delta:', payload.viewerDelta);
    console.log('🤖 Viewer Count:', payload.viewerCount);
    console.log('🤖 Transcript Length:', payload.transcript?.length || 0, 'chars');
    console.log('🤖 Has Prosody:', !!payload.prosody);
    console.log('🤖 Has Burst:', !!payload.burst);
    console.log('🤖 Signal Quality:', payload.quality);
    console.log('🤖 ==========================================');
    
    // Log full prompts in debug mode
    debugLog(correlationId, 'CLAUDE_REQUEST', {
      model: 'claude-sonnet-4-5',
      maxTokens: 150,
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      requestPayload: {
        viewerDelta: payload.viewerDelta,
        viewerCount: payload.viewerCount,
        prevCount: payload.prevCount,
        transcript: payload.transcript,
        topic: payload.topic,
        quality: payload.quality
      }
    });
```

3. **After Claude API response** (around line 231-251):
```typescript
    const data = await response.json();
    const apiCallDuration = Date.now() - apiCallStartTime;
    const totalDuration = Date.now() - requestStartTime;

    // Log raw Claude response
    debugLog(correlationId, 'CLAUDE_RESPONSE', {
      rawResponse: data,
      contentText: data?.content?.[0]?.text || '',
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      timing: {
        apiCallMs: apiCallDuration,
        totalMs: totalDuration
      }
    });

    let generatedText: string = data?.content?.[0]?.text ?? '';
    let insight: any | null = null;

    try {
      if (typeof generatedText === 'string') generatedText = generatedText.trim();
      if (generatedText) {
        try {
          insight = JSON.parse(generatedText);
          debugLog(correlationId, 'PARSED', {
            success: true,
            insight
          });
        } catch {
          // Try to salvage JSON object from any wrapper text
          const match = generatedText.match(/\{[\s\S]*\}/);
          if (match) {
            try { 
              insight = JSON.parse(match[0]); 
              debugLog(correlationId, 'PARSED', {
                success: true,
                method: 'regex_extraction',
                insight
              });
            } catch {
              debugLog(correlationId, 'PARSE_ERROR', {
                error: 'Failed to parse extracted JSON',
                extractedText: match[0].slice(0, 200)
              });
            }
          }
        }
      }
    } catch (parseError) {
      debugLog(correlationId, 'PARSE_ERROR', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        generatedText: generatedText?.slice(0, 200)
      });
    }
```

4. **Before returning response** (around line 342-350):
```typescript
    console.log('✅ ==========================================');
    console.log('✅ CLAUDE INSIGHT GENERATION COMPLETED');
    console.log('✅ Correlation ID:', correlationId);
    console.log('✅ API Call Duration:', apiCallDuration, 'ms');
    console.log('✅ Total Duration:', totalDuration, 'ms');
    console.log('✅ Tokens - Input:', data.usage?.input_tokens || 'unknown');
    console.log('✅ Tokens - Output:', data.usage?.output_tokens || 'unknown');
    console.log('✅ Emotional Label:', insight.emotionalLabel);
    console.log('✅ Next Move:', insight.nextMove);
    console.log('✅ ==========================================');
    
    debugLog(correlationId, 'COMPLETE', {
      insight,
      timing: {
        apiCallMs: apiCallDuration,
        totalMs: totalDuration
      },
      tokens: {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0,
        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    });

    return new Response(JSON.stringify({
      ...insight,
      source: 'Claude',
      correlationId,
      timing: {
        apiCallMs: apiCallDuration,
        totalMs: totalDuration
      },
      tokens: DEBUG_MODE ? {
        input: data.usage?.input_tokens || 0,
        output: data.usage?.output_tokens || 0
      } : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
```

5. **In error handler** (around line 356-389):
```typescript
  } catch (error) {
    const correlationId = 'error_' + Date.now();
    
    debugLog(correlationId, 'ERROR', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
    
    console.error('[Generate Insight] Error:', error);
    console.error('[Generate Insight] Correlation ID:', correlationId);
    
    // ... existing error handling ...
```

---

## Pre-flight Validation Checklist

Before deployment, verify:

### ✅ Functionality Checks
- [ ] Correlation IDs are generated and passed through the pipeline
- [ ] Debug mode respects environment variable (ON in dev, OFF in prod)
- [ ] All existing console logs still work
- [ ] API contract unchanged (correlationId is optional)
- [ ] Fallback logic still works when AI fails
- [ ] Error handling preserved
- [ ] Timeout logic unchanged
- [ ] De-duplication logic still works

### ✅ Performance Checks
- [ ] Logging doesn't add significant latency (< 5ms overhead)
- [ ] No memory leaks from excessive logging
- [ ] JSON.stringify doesn't block event loop
- [ ] Debug mode can be disabled in production

### ✅ Security Checks
- [ ] No sensitive user data logged (PII, API keys)
- [ ] Transcript is truncated in logs
- [ ] Error messages sanitized
- [ ] Stack traces only in debug mode

### ✅ Code Quality
- [ ] TypeScript types updated
- [ ] No lint errors
- [ ] Consistent log format
- [ ] Easy to grep logs by correlation ID

### ✅ Testing
- [ ] Test with debug mode ON
- [ ] Test with debug mode OFF
- [ ] Test error scenarios (API failure, timeout, invalid response)
- [ ] Test fallback scenarios
- [ ] Test with real Claude API
- [ ] Verify logs are readable and useful

---

## How to Use After Implementation

### Enable Debug Mode
```bash
# Frontend .env
VITE_DEBUG_CORRELATION=true

# Edge Function environment (Supabase dashboard)
ENABLE_CORRELATION_DEBUG=true
```

### Finding Logs by Correlation ID
```bash
# In browser console, filter by correlation ID
# All logs for a single request will have the same ID
[CORRELATION:corr_1234567890_abc123def:INIT]
[CORRELATION:corr_1234567890_abc123def:PAYLOAD]
[CORRELATION:corr_1234567890_abc123def:FETCH_START]
[CORRELATION:corr_1234567890_abc123def:FETCH_END]
[CORRELATION:corr_1234567890_abc123def:RESPONSE]
```

### Analyzing Claude Behavior
1. Look for `CLAUDE_REQUEST` logs to see exactly what was sent
2. Look for `CLAUDE_RESPONSE` logs to see raw response
3. Look for `PARSED` logs to see how it was interpreted
4. Check timing breakdowns in `COMPLETE` logs
5. Monitor token usage in debug logs

---

## Summary

This implementation adds comprehensive debugging capabilities to the Claude integration while:
- ✅ Maintaining backward compatibility
- ✅ Not impacting production performance
- ✅ Providing end-to-end request tracing
- ✅ Capturing full context for troubleshooting
- ✅ Being easily toggled on/off

All changes are non-breaking and can be deployed safely.
