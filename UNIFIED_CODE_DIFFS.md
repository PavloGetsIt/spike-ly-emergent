# Unified Code Diffs - Claude Debug Enhancement

This document contains all code changes made to implement comprehensive debugging for the Claude integration.

---

## File 1: `/app/frontend/.env`

### Changes
Added debug mode configuration flag.

```diff
 VITE_SUPABASE_PROJECT_ID="hnvdovyiapkkjrxcxbrv"
 VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhudmRvdnlpYXBra2pyeGN4YnJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMzcxNzksImV4cCI6MjA3NDgxMzE3OX0.ZQoRbuGsFGZWaZv9Jv_1mnMSHO06FVbgzv1wVCo_RZg"
 VITE_SUPABASE_URL="https://hnvdovyiapkkjrxcxbrv.supabase.co"
 VITE_HUME_API_KEY="hAXAo6DAu4qsRcVNXhRLrhNjkxfBFBiZWTfixezTItQokdQm"
 REACT_APP_BACKEND_URL=https://insight-logger.preview.emergentagent.com
 WDS_SOCKET_PORT=443
 REACT_APP_ENABLE_VISUAL_EDITS=true
 ENABLE_HEALTH_CHECK=false
+
+# Debug mode for correlation engine (development only)
+VITE_DEBUG_CORRELATION=true
```

---

## File 2: `/app/frontend/src/services/correlationService.ts`

### Change 1: Add Debug Infrastructure (Lines 1-19)

```diff
 import { buildSegments, countWords, hashText, type Segment } from './segmenter';
 import { enqueueHumeAnalysis } from './humeService';
 import { Debug } from './debug';
 
+// Generate unique correlation ID
+function generateCorrelationId(): string {
+  return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
+}
+
+// Check if debug mode is enabled
+const DEBUG_MODE = import.meta.env.VITE_DEBUG_CORRELATION === 'true';
+
+function debugLog(correlationId: string, stage: string, data: any) {
+  if (!DEBUG_MODE) return;
+  console.log(`[CORRELATION:${correlationId}:${stage}]`, data);
+}
+
 type TranscriptLine = { t: number; text: string; conf?: number };
 type ViewerSample = { t: number; count: number };
```

### Change 2: Enhanced AI Call Section (Lines 276-430)

```diff
     // [AI:GATE] diagnostic log with sanitized preview - AI is now default for all deltas
     const transcriptPreview = segment.text.slice(0, 100).replace(/\n/g, ' ');
     console.log('[AI:GATE]', {
       delta,
       willCallAI: true,
       transcriptPreview,
       topic,
       emotion: emotion.emotion
     });
     
+    // Generate correlation ID for this request
+    const correlationId = generateCorrelationId();
+    debugLog(correlationId, 'INIT', {
+      timestamp: new Date().toISOString(),
+      delta,
+      count,
+      topic,
+      emotion: emotion.emotion,
+      segmentLength: segment.text.length
+    });
+    
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
+      console.log('🤖 Correlation ID:', correlationId);
       console.log('🤖 URL:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-insight`);
       console.log('🤖 Viewer Delta:', delta);
       console.log('🤖 Language Emotion:', emotion.emotion);
       console.log('🤖 Topic:', topic);
       console.log('🤖 ==========================================');
       
       const payload = {
+        correlationId, // Add correlation ID to payload
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
+        debugLog(correlationId, 'TIMEOUT', {
+          maxLatency: AI_MAX_LATENCY_MS,
+          message: 'Request aborted due to timeout'
+        });
         console.warn(`[AI] Timeout after ${AI_MAX_LATENCY_MS}ms → fallback`);
       }, AI_MAX_LATENCY_MS);
       
       aiInFlight = true;
       lastAiStartedAt = performance.now();
       aiCallsStarted++;
       
       // [AI:FETCH:STARTING] diagnostic log with sanitized payload
       console.log('[AI:FETCH:STARTING]', {
+        correlationId,
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
 
+      debugLog(correlationId, 'FETCH_END', {
+        status: response.status,
+        statusText: response.statusText,
+        duration: Math.round(aiDuration),
+        ok: response.ok
+      });
+
       if (response.ok) {
         const aiInsight = await response.json();
         aiCallsSucceeded++;
         aiInFlight = false;
         
+        // Enhanced debug logging of full response
+        debugLog(correlationId, 'RESPONSE', {
+          emotionalLabel: aiInsight.emotionalLabel,
+          nextMove: aiInsight.nextMove,
+          source: aiInsight.source,
+          duration: Math.round(aiDuration),
+          tokens: aiInsight.tokens
+        });
+        
         console.log('✅ ==========================================');
         console.log('✅ CLAUDE INSIGHT RECEIVED (Web App)');
+        console.log('✅ Correlation ID:', correlationId);
         console.log('✅ Response Time:', Math.round(aiDuration), 'ms');
         console.log('✅ Emotional Label:', aiInsight.emotionalLabel);
         console.log('✅ Next Move:', aiInsight.nextMove);
+        console.log('✅ Source:', aiInsight.source || 'Claude');
+        if (aiInsight.tokens) {
+          console.log('✅ Tokens:', aiInsight.tokens);
+        }
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
+        debugLog(correlationId, 'ERROR', {
+          status: response.status,
+          statusText: response.statusText,
+          errorText: errorText.slice(0, 200),
+          duration: Math.round(aiDuration)
+        });
+        
         console.error('❌ ==========================================');
         console.error('❌ CLAUDE API FAILED (Web App)');
+        console.error('❌ Correlation ID:', correlationId);
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
       
+      // Enhanced error logging with correlation ID
+      debugLog(correlationId, 'ERROR', {
+        errorName: error instanceof Error ? error.name : 'UnknownError',
+        errorMessage: error instanceof Error ? error.message : String(error),
+        errorStack: error instanceof Error ? error.stack : undefined,
+        isAbortError,
+        delta,
+        topic,
+        transcriptPreview: sanitizedTranscript
+      });
+      
       if (isAbortError) {
         aiCallsAborted++;
         console.warn('[AI:FETCH:FAILED]', {
+          correlationId,
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
+          correlationId,
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
+      debugLog(correlationId, 'FALLBACK', {
+        reason: 'AI call failed or returned invalid response',
+        delta,
+        topic
+      });
+      
       console.warn('⚠️ ==========================================');
       console.warn('⚠️ AI INSIGHT FAILED - USING FALLBACK (Web App)');
+      console.warn('⚠️ Correlation ID:', correlationId);
       console.warn('⚠️ Falling back to deterministic system');
       console.warn('⚠️ ==========================================');
```

---

## File 3: `/app/frontend/supabase/functions/generate-insight/index.ts`

### Change 1: Add Debug Infrastructure (Lines 1-20)

```diff
 // Version: 2.0.0 - Claude Sonnet 4.5 with richer context
 import "https://deno.land/x/xhr@0.1.0/mod.ts";
 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 
 const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
+const DEBUG_MODE = Deno.env.get('ENABLE_CORRELATION_DEBUG') !== 'false'; // Default to true
+
+function debugLog(correlationId: string, stage: string, data: any) {
+  if (!DEBUG_MODE) return;
+  console.log(`[CORRELATION:${correlationId}:${stage}]`, JSON.stringify(data, null, 2));
+}
 
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
 };
 
 interface InsightRequest {
+  correlationId?: string;
   transcript: string;
   viewerDelta: number;
   viewerCount: number;
   prevCount: number;
```

### Change 2: Request Handling (Lines 39-60)

```diff
 serve(async (req) => {
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const requestStartTime = Date.now();
     const payload: InsightRequest = await req.json();
+    const correlationId = payload.correlationId || `edge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
+    
+    debugLog(correlationId, 'RECEIVED', {
+      timestamp: new Date().toISOString(),
+      viewerDelta: payload.viewerDelta,
+      viewerCount: payload.viewerCount,
+      transcriptLength: payload.transcript?.length || 0,
+      topic: payload.topic,
+      quality: payload.quality,
+      hasHistory: !!payload.recentHistory?.length
+    });
     
     // Load learned patterns from streamer_patterns table
```

### Change 3: Claude Request Logging (Lines 79-180)

```diff
     console.log('🤖 ==========================================');
     console.log('🤖 CLAUDE INSIGHT GENERATION STARTED');
+    console.log('🤖 Correlation ID:', correlationId);
     console.log('🤖 Timestamp:', new Date().toISOString());
     console.log('🤖 Model: claude-sonnet-4-5');
     console.log('🤖 Viewer Delta:', payload.viewerDelta);
     console.log('🤖 Viewer Count:', payload.viewerCount);
     console.log('🤖 Transcript Length:', payload.transcript?.length || 0, 'chars');
     console.log('🤖 Has Prosody:', !!payload.prosody);
     console.log('🤖 Has Burst:', !!payload.burst);
     console.log('🤖 Signal Quality:', payload.quality);
     console.log('🤖 ==========================================');

     // ... system prompt and user prompt creation ...

+    // Log full prompts in debug mode
+    debugLog(correlationId, 'CLAUDE_REQUEST', {
+      model: 'claude-sonnet-4-5',
+      maxTokens: 150,
+      systemPrompt: systemPrompt,
+      userPrompt: userPrompt,
+      requestPayload: {
+        viewerDelta: payload.viewerDelta,
+        viewerCount: payload.viewerCount,
+        prevCount: payload.prevCount,
+        transcript: payload.transcript,
+        topic: payload.topic,
+        quality: payload.quality
+      }
+    });
+
     console.log('🤖 Calling Claude API...');
```

### Change 4: Response Logging (Lines 231-252)

```diff
     const data = await response.json();
     const apiCallDuration = Date.now() - apiCallStartTime;
     const totalDuration = Date.now() - requestStartTime;
 
+    // Log raw Claude response
+    debugLog(correlationId, 'CLAUDE_RESPONSE', {
+      rawResponse: data,
+      contentText: data?.content?.[0]?.text || '',
+      usage: {
+        inputTokens: data.usage?.input_tokens || 0,
+        outputTokens: data.usage?.output_tokens || 0,
+        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
+      },
+      timing: {
+        apiCallMs: apiCallDuration,
+        totalMs: totalDuration
+      }
+    });
+
     let generatedText: string = data?.content?.[0]?.text ?? '';
     let insight: any | null = null;
 
     try {
       if (typeof generatedText === 'string') generatedText = generatedText.trim();
       if (generatedText) {
         try {
           insight = JSON.parse(generatedText);
         } catch {
           // Try to salvage JSON object from any wrapper text
           const match = generatedText.match(/\{[\s\S]*\}/);
           if (match) {
             try { 
               insight = JSON.parse(match[0]); 
             } catch {}
           }
         }
       }
     } catch {}
```

### Change 5: Complete Response (Lines 342-355)

```diff
     console.log('✅ ==========================================');
     console.log('✅ CLAUDE INSIGHT GENERATION COMPLETED');
+    console.log('✅ Correlation ID:', correlationId);
     console.log('✅ API Call Duration:', apiCallDuration, 'ms');
     console.log('✅ Total Duration:', totalDuration, 'ms');
     console.log('✅ Tokens - Input:', data.usage?.input_tokens || 'unknown');
     console.log('✅ Tokens - Output:', data.usage?.output_tokens || 'unknown');
     console.log('✅ Emotional Label:', insight.emotionalLabel);
     console.log('✅ Next Move:', insight.nextMove);
     console.log('✅ ==========================================');
     
+    debugLog(correlationId, 'COMPLETE', {
+      insight,
+      timing: {
+        apiCallMs: apiCallDuration,
+        totalMs: totalDuration
+      },
+      tokens: {
+        input: data.usage?.input_tokens || 0,
+        output: data.usage?.output_tokens || 0,
+        total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
+      }
+    });
+
-    return new Response(JSON.stringify(insight), {
+    return new Response(JSON.stringify({
+      ...insight,
+      source: 'Claude',
+      correlationId,
+      timing: {
+        apiCallMs: apiCallDuration,
+        totalMs: totalDuration
+      },
+      tokens: DEBUG_MODE ? {
+        input: data.usage?.input_tokens || 0,
+        output: data.usage?.output_tokens || 0
+      } : undefined
+    }), {
       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
     });
```

### Change 6: Error Handler (Lines 356-370)

```diff
   } catch (error) {
+    let correlationId = 'error_' + Date.now();
+    
+    // Try to get correlation ID from request if available
+    try {
+      const bodyText = await req.text();
+      const parsed = JSON.parse(bodyText);
+      if (parsed?.correlationId) {
+        correlationId = parsed.correlationId;
+      }
+    } catch {
+      // Use generated error ID
+    }
+    
+    debugLog(correlationId, 'ERROR', {
+      errorName: error instanceof Error ? error.name : 'UnknownError',
+      errorMessage: error instanceof Error ? error.message : String(error),
+      errorStack: error instanceof Error ? error.stack : undefined,
+      timestamp: new Date().toISOString()
+    });
+    
     console.error('[Generate Insight] Error:', error);
+    console.error('[Generate Insight] Correlation ID:', correlationId);
```

---

## Summary of Changes

### Files Modified: 3
1. `/app/frontend/.env` - Added `VITE_DEBUG_CORRELATION=true`
2. `/app/frontend/src/services/correlationService.ts` - Added correlation IDs and enhanced logging
3. `/app/frontend/supabase/functions/generate-insight/index.ts` - Added comprehensive Claude logging

### Lines Added: ~150
### Lines Modified: ~50

### Key Features Added:
- ✅ Correlation ID generation and tracking
- ✅ Debug mode toggle (environment-based)
- ✅ Full Claude request logging (prompts)
- ✅ Full Claude response logging (raw + parsed)
- ✅ Token usage tracking
- ✅ Timing breakdowns
- ✅ Enhanced error logging
- ✅ Fallback logging
- ✅ Backward compatible (correlationId optional)

### Log Stages Implemented:
- INIT - Request initialization
- FETCH_END - API call completion
- RESPONSE - Response received
- TIMEOUT - Request timeout
- ERROR - Error occurred
- FALLBACK - Fallback logic used
- RECEIVED - Edge function received request
- CLAUDE_REQUEST - Full Claude prompts
- CLAUDE_RESPONSE - Raw Claude response
- COMPLETE - Processing complete

### Production Safety:
- All debug logs respect DEBUG_MODE flag
- Can be disabled via environment variables
- No performance impact when disabled
- No breaking changes to API contracts
