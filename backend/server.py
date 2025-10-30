from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
from anthropic import Anthropic
import json
import re
import time
import httpx  # For Hume AI HTTP requests

# Global correlation counter for unique IDs
correlation_counter = 0


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# ==================== CORS CONFIGURATION ====================
# CRITICAL: Must be configured BEFORE including routers
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],  # Allow all origins including Chrome extensions
    allow_methods=["*"],
    allow_headers=["*"],
)
# ===========================================================

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# ==================== CORRELATION ENGINE - INSIGHT GENERATION ====================

class ProsodyData(BaseModel):
    topEmotion: Optional[str] = None
    topScore: Optional[float] = None
    energy: Optional[float] = None
    excitement: Optional[float] = None
    confidence: Optional[float] = None

class BurstData(BaseModel):
    type: Optional[str] = None
    detected: Optional[bool] = False

class LanguageData(BaseModel):
    emotion: Optional[str] = None

class HistoryItem(BaseModel):
    delta: int
    emotion: Optional[str] = None

class InsightRequest(BaseModel):
    transcript: str
    viewerDelta: int
    viewerCount: int
    prevCount: int
    prosody: Optional[ProsodyData] = None
    burst: Optional[BurstData] = None
    language: Optional[LanguageData] = None
    topic: Optional[str] = None
    quality: Optional[str] = None
    recentHistory: Optional[List[HistoryItem]] = None
    # New fields for dynamic insights
    keywordsSaid: Optional[List[str]] = None
    recentInsights: Optional[List[str]] = None
    winningTopics: Optional[List[str]] = None
    transcriptQuality: Optional[str] = None
    uniqueWordRatio: Optional[float] = None

class InsightResponse(BaseModel):
    emotionalLabel: str
    nextMove: str
    source: str = "claude"
    correlationId: Optional[str] = None

@api_router.post("/generate-insight", response_model=InsightResponse)
async def generate_insight(request: InsightRequest):
    """
    Generate tactical live stream insights using Claude Sonnet 4.5
    """
    try:
        # Generate unique correlationId
        global correlation_counter
        correlation_counter += 1
        correlation_id = f"{int(time.time() * 1000)}-{correlation_counter:04d}"
        
        logger.info(f"🤖 Generating insight | Delta: {request.viewerDelta} | CID: {correlation_id}")
        
        # Get Claude API key
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
        
        # Build context strings
        prosody_str = "No prosody data"
        if request.prosody:
            prosody_str = f"Top emotion: {request.prosody.topEmotion or 'unknown'} ({request.prosody.topScore or 0}%), Energy: {request.prosody.energy or 0}%, Excitement: {request.prosody.excitement or 0}%, Confidence: {request.prosody.confidence or 0}%"
        
        burst_str = f"Burst detected: {request.burst.type}" if request.burst and request.burst.detected else "No burst activity"
        language_str = f"Language emotion: {request.language.emotion}" if request.language and request.language.emotion else "No language emotion"
        history_str = "No recent history"
        if request.recentHistory:
            history_items = [f"{h.delta:+d} ({h.emotion or 'unknown'})" for h in request.recentHistory]
            history_str = f"Recent pattern: {', '.join(history_items)}"
        
        # Create system prompt with ANTI-REPETITION rules
        system_prompt = """You are Spikely - a tactical AI coach for live streamers. Generate ONE micro-decision they can execute in the next 30 seconds to spike viewer engagement.

OUTPUT REQUIREMENTS:
- emotionalLabel: 2-3 words describing what pattern you detected
- nextMove: 3-5 word action + emotional cue (max 8 words total)
- MUST be specific to their actual content (not generic)
- Use positive framing (what TO do, not what NOT to do)
- MUST reference SPECIFIC words or topics from the transcript
- NEVER generate generic advice like "be engaging" or "keep momentum"

🚫 CRITICAL ANTI-REPETITION RULES:
1. Every insight MUST BE UNIQUE - no repeating previous patterns
2. Reference SPECIFIC words from the transcript (not just topics)
3. If they mentioned "gaming setup", say "Ask about graphics cards" NOT "talk about gaming"
4. If they mentioned "makeup routine", say "Show foundation technique" NOT "demonstrate makeup"
5. Vary your action verbs - don't use same verb twice in a row
6. Vary your emotional cues - rotate between different energy levels
7. If you've said "Pivot to X" recently, use "Switch to" or "Jump to" instead
8. Never give the same advice for opposite viewer changes (spike vs drop)

ANALYSIS PRIORITY:
1. What SPECIFIC topic/action caused the viewer change?
2. What emotional energy drove it? (from Hume AI prosody)
3. Should they amplify this or pivot?
4. What haven't I suggested recently?

ACTION VERBS TO USE (ROTATE THESE):
Ask, Show, Talk about, Tease, Reveal, Pivot to, Demonstrate, Explain, Highlight, Share, Compare, Review, Test, Try, Call out, Point to, Zoom in on, React to

TONAL CUES TO USE (ROTATE THESE):
Stay hyped, Go vulnerable, Build excitement, Keep energy up, Soften tone, Be authentic, Speed up, Be direct, Stay present, Boost energy, Stay curious, Be playful, Get intense, Stay calm, Create urgency, Build suspense, Be conversational

TOPIC CATEGORIES:
Gaming, makeup, cooking, fitness, story, chat, giveaway, product, tutorial, Q&A, personal, tech, music, art, review, reaction, news, gossip, advice, challenge

INSIGHT STRUCTURE EXAMPLES (ULTRA-SPECIFIC):

**SPIKE (viewers increasing +5 or more):**
Pattern detected → Amplify with CONCRETE action they can do in 30 seconds
- Transcript: "playing Valorant on my PC" → {"emotionalLabel": "Valorant talk wins", "nextMove": "Ask 'What agents you main?'. React big"}
- Transcript: "this eyeshadow palette" → {"emotionalLabel": "palette demo spikes", "nextMove": "Hold palette to camera. Show shimmer"}
- Transcript: "vacation with my family" → {"emotionalLabel": "story connects", "nextMove": "Tell the TSA security story. Laugh"}
- Transcript: "bought new iPhone" → {"emotionalLabel": "product hype works", "nextMove": "Open camera app. Test portrait mode"}
- Transcript: "cooking chicken recipe" → {"emotionalLabel": "recipe interest high", "nextMove": "Taste test on camera. React honest"}

**DROP (viewers decreasing -5 to -15):**
Pattern detected → Pivot with SPECIFIC new action
- Transcript: "technical bug issues" → {"emotionalLabel": "complaints dip", "nextMove": "Pull up giveaway. Announce winner time"}
- Transcript: "explaining code for 5 minutes" → {"emotionalLabel": "pacing slows", "nextMove": "Run the code now. Show results"}
- Transcript: "same topic repeated" → {"emotionalLabel": "topic exhausted", "nextMove": "Read top chat question. Answer it"}

**DUMP (viewers dropping -20 or more):**
Urgent → HIGH ENERGY concrete recovery action
- Transcript: "dead silence for 30s" → {"emotionalLabel": "silence kills", "nextMove": "Start poll: 'Yes or No?'. Count votes"}
- Transcript: "stream lagging/frozen" → {"emotionalLabel": "tech problems drop", "nextMove": "Show backup clip. Talk over it"}

**FLATLINE (viewers stable ±3):**
Create engagement with SPECIFIC question/action
- Transcript: "chatting casually" → {"emotionalLabel": "energy steady", "nextMove": "Call out @username. Ask their opinion"}
- Transcript: "background music playing" → {"emotionalLabel": "passive watching", "nextMove": "Announce: 'Big reveal in 30s'. Tease it"}

🎯 KEY PATTERN TO FOLLOW:
[Action Verb] [Specific Noun/Question/Thing] + [Physical execution cue]

EXAMPLES:
✅ "Ask 'What's your rank?'. Read answers loud"
✅ "Hold bottle to camera. Point at ingredients"
✅ "Tell airport TSA story. Act it out"
✅ "Answer 'how to start streaming'. Give 3 quick tips"
✅ "Show controller setup. Explain each button"
✅ "Read top donation. Thank them by name"

**DROP (viewers decreasing -5 to -15):**
Pattern detected → Constructive pivot with VARIETY
- Complaint about bugs: {"emotionalLabel": "complaints dip", "nextMove": "Switch to giveaway. Boost energy"}
- Slow explanation: {"emotionalLabel": "pacing slows", "nextMove": "Jump to demo. Speed up"}
- Same topic 5min: {"emotionalLabel": "topic exhausted", "nextMove": "Ask viewer questions. Create interaction"}

**DUMP (viewers dropping -20 or more):**
Pattern detected → Urgent recovery with HIGH ENERGY
- Dead silence: {"emotionalLabel": "silence kills", "nextMove": "Start poll now. Get intense"}
- Technical issues: {"emotionalLabel": "tech problems drop", "nextMove": "Show backup content. Stay upbeat"}

**FLATLINE (viewers stable ±3):**
Create engagement opportunity with NOVELTY
- Casual chat: {"emotionalLabel": "energy steady", "nextMove": "Call out usernames. Be playful"}
- Background content: {"emotionalLabel": "passive watching", "nextMove": "Tease surprise reveal. Build suspense"}

CRITICAL RULES:
1. NEVER echo raw transcript words (e.g., if they said "twenty one is young" don't use those exact words)
2. Extract the CONCEPT and make it more specific
3. Be hyper-specific: "Ask about RTX 4090" NOT "talk about graphics"
4. Include the HOW: emotion/energy cue in every nextMove
5. Total nextMove: 8 words maximum
6. emotionalLabel: 3 words maximum
7. VARY your vocabulary - use synonyms, different verbs, different cues

BAD EXAMPLES (too generic - NEVER do this):
- {"emotionalLabel": "positive", "nextMove": "Keep doing this"} ← TERRIBLE
- {"emotionalLabel": "engagement", "nextMove": "Be more engaging"} ← TERRIBLE
- {"emotionalLabel": "content", "nextMove": "Do more content talk"} ← TERRIBLE
- {"emotionalLabel": "momentum", "nextMove": "Keep momentum going"} ← TERRIBLE
- {"emotionalLabel": "story dips", "nextMove": "Pivot to Q&A. Build excitement"} ← OVERUSED

GOOD EXAMPLES (specific and tactical):
- {"emotionalLabel": "Elden Ring tips work", "nextMove": "Share boss strategies. Stay hyped"}
- {"emotionalLabel": "contouring demo spikes", "nextMove": "Zoom on cheekbone blending. Keep intensity"}
- {"emotionalLabel": "pasta recipe wins", "nextMove": "Taste test on camera. React big"}
- {"emotionalLabel": "kettlebell moves connect", "nextMove": "Call out viewer form. Boost energy"}

🎯 DYNAMIC INSIGHT GENERATION PROCESS:
1. Read the full transcript carefully
2. Identify 3-5 specific nouns/topics mentioned
3. Check recent insights - what have you said before?
4. Pick the MOST RELEVANT topic that's NOT been used recently
5. Create a NEW verb + cue combination you haven't used
6. Reference specific details, not generic concepts

Return ONLY valid JSON. No markdown, no explanations."""

        # Build context strings for new fields
        keywords_str = "No keywords detected"
        if request.keywordsSaid and len(request.keywordsSaid) > 0:
            keywords_str = f"Detected topics: {', '.join(request.keywordsSaid[:5])}"
        
        recent_insights_str = "No recent insights (first insight of session)"
        if request.recentInsights and len(request.recentInsights) > 0:
            recent_insights_str = f"🚫 DON'T REPEAT THESE: {', '.join(request.recentInsights[-3:])}"
        
        winning_topics_str = "No winning patterns yet"
        if request.winningTopics and len(request.winningTopics) > 0:
            winning_topics_str = f"✅ What worked before: {', '.join(request.winningTopics[:3])}"
        
        quality_indicator = ""
        if request.transcriptQuality:
            quality_indicator = f"Transcript quality: {request.transcriptQuality}"
            if request.uniqueWordRatio:
                quality_indicator += f" (word variety: {request.uniqueWordRatio:.0%})"
        
        # Create user prompt with enriched context
        user_prompt = f"""LIVE STREAM DATA:

WHAT THEY SAID (exact words): "{request.transcript}"

{keywords_str}

VIEWER IMPACT: {request.viewerDelta:+d} viewers ({request.prevCount} → {request.viewerCount})

VOICE ANALYSIS: {prosody_str}

ENERGY SIGNALS: {burst_str}

WORD EMOTION: {language_str}

TOPIC: {request.topic or 'general'}

RECENT PATTERN: {history_str}

SIGNAL STRENGTH: {request.quality or 'medium'}

{quality_indicator}

---
🎯 CONTEXT FOR VARIETY:
{recent_insights_str}
{winning_topics_str}

---
🎯 ULTRA-SPECIFIC TACTICAL INSIGHT GENERATION:

STEP 1 - EXTRACT SPECIFICS from transcript:
- What SPECIFIC game/product/topic did they mention? (exact name)
- What SPECIFIC question could viewers answer?
- What SPECIFIC action are they doing right now?
- What SPECIFIC story/moment did they reference?

STEP 2 - CREATE TACTICAL ACTION using those specifics:
- DON'T say "Ask about gaming" → SAY "Ask 'What rank are you?'"
- DON'T say "Show product" → SAY "Hold up the bottle. Show label"
- DON'T say "Tell story" → SAY "Tell the airport security story"
- DON'T say "Pivot to Q&A" → SAY "Answer top chat question now"

STEP 3 - ADD SPECIFIC EXECUTION CUE:
- Not "Stay hyped" → "Read answers out loud"
- Not "Keep energy" → "Lean into camera"
- Not "Build excitement" → "Count down from 3"

REQUIRED FORMAT:
emotionalLabel: [detected pattern, max 3 words]
nextMove: [SPECIFIC action with noun] + [HOW to execute it]

EXAMPLES OF WHAT WE NEED:

❌ BAD (vague):
- "Pivot to Q&A. Build excitement" 
- "Show more story. Keep energy"
- "Talk about gaming. Stay hyped"

✅ GOOD (specific):
- "Ask 'What's your setup?'. Read answers loud"
- "Tell your first stream fail. Be vulnerable"
- "Hold product to camera. Point at features"
- "Answer 'how did you start'. Give 3 tips"
- "Show your controller. Explain button mapping"

Generate ONE hyper-specific tactical insight NOW. Include concrete nouns from transcript. Tell them EXACTLY what to do in next 30 seconds."""

        # Call Claude API directly
        logger.info("🤖 Calling Claude Sonnet 4.5 with your API key...")
        
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=150,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )
        
        # Parse response
        generated_text = response.content[0].text.strip()
        logger.info(f"✅ Claude raw response: {generated_text[:200]}...")
        
        # 📊 DIAGNOSTIC: Full Claude response
        # Parse JSON
        try:
            insight = json.loads(generated_text)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown or wrapper text
            match = re.search(r'\{[\s\S]*\}', generated_text)
            if match:
                insight = json.loads(match.group(0))
            else:
                raise ValueError("Invalid JSON response from Claude")
        
        # Validate and enforce constraints
        if not insight.get('emotionalLabel') or not insight.get('nextMove'):
            raise ValueError("Missing required fields in insight")
        
        # ==================== DIAGNOSTIC MODE: VALIDATOR DISABLED ====================
        # TEMPORARILY DISABLED to see Claude's raw output without modification
        # This allows us to determine if Claude generates generic insights
        # or if the validator is incorrectly rejecting/modifying good insights
        
        logger.info("🔬 DIAGNOSTIC MODE: Generic validator DISABLED - passing Claude output as-is")
        
        # REJECT GENERIC INSIGHTS - Force specificity (DISABLED FOR DIAGNOSTICS)
        # next_move_lower = insight['nextMove'].lower()
        # generic_phrases = [
        #     'pivot to q&a',
        #     'build excitement',
        #     'keep energy',
        #     'stay hyped',
        #     'be engaging',
        #     'do more',
        #     'try something',
        #     'switch topics',
        #     'talk more',
        #     'show more'
        # ]
        # 
        # # Check if insight is too generic (contains generic phrase without specifics)
        # is_generic = False
        # for phrase in generic_phrases:
        #     # If insight ONLY contains the generic phrase (not combined with specifics)
        #     if phrase in next_move_lower and len(next_move_lower.split()) <= 4:
        #         is_generic = True
        #         logger.warning(f"⚠️ REJECTED generic insight: '{insight['nextMove']}' - too vague")
        #         break
        # 
        # # If generic AND no nouns detected, force a more specific version
        # if is_generic:
        #     # Try to extract any noun from transcript to add specificity
        #     transcript_words = request.transcript.lower().split()
        #     # Simple noun extraction (words that might be specific topics)
        #     potential_nouns = [w for w in transcript_words if len(w) > 4 and w not in ['about', 'their', 'really', 'think', 'going', 'doing', 'saying']]
        #     if potential_nouns:
        #         specific_noun = potential_nouns[0]
        #         insight['nextMove'] = f"Talk about {specific_noun}. {insight['nextMove'].split('.')[-1].strip()}"
        #         logger.info(f"✅ Added specificity: '{insight['nextMove']}'")
        #     else:
        #         # Last resort: Force a question format
        #         insight['nextMove'] = "Ask viewers a question. Read answers"
        #         logger.warning("⚠️ Forced question format due to lack of specifics")
        
        # ==================== END DIAGNOSTIC MODE SECTION ====================
        
        # Enforce word limits
        emotional_words = insight['emotionalLabel'].split()[:3]
        insight['emotionalLabel'] = ' '.join(emotional_words)
        
        next_move_words = insight['nextMove'].split()[:12]  # Increased to allow for specificity
        insight['nextMove'] = ' '.join(next_move_words)
        
        # Validate no transcript bleed - only check for consecutive multi-word matches
        transcript_lower = request.transcript.lower()
        emotional_lower = insight['emotionalLabel'].lower()
        next_move_lower = insight['nextMove'].lower()
        
        # Check for 3+ consecutive word matches (actual bleed)
        def has_consecutive_match(output: str, source: str, min_words: int = 3) -> bool:
            output_words = output.split()
            for i in range(len(output_words) - min_words + 1):
                phrase = ' '.join(output_words[i:i+min_words])
                if len(phrase) > 10 and phrase in source:
                    return True
            return False
        
        if has_consecutive_match(emotional_lower, transcript_lower, 3):
            logger.warning("⚠️ Transcript bleed detected in emotionalLabel (3+ words), using fallback")
            insight['emotionalLabel'] = "content spike" if request.viewerDelta > 0 else "content dip"
        
        if has_consecutive_match(next_move_lower, transcript_lower, 4):
            logger.warning("⚠️ Transcript bleed detected in nextMove (4+ words), using fallback")
            insight['nextMove'] = "Keep this energy going" if request.viewerDelta > 0 else "Try something different"
        
        # Check for repetition against recent insights
        if request.recentInsights and len(request.recentInsights) > 0:
            for recent in request.recentInsights[-3:]:
                recent_lower = recent.lower()
                # Check if new insight is too similar (> 60% word overlap)
                new_words = set(next_move_lower.split())
                recent_words = set(recent_lower.split())
                if len(new_words) > 0:
                    overlap = len(new_words & recent_words) / len(new_words)
                    if overlap > 0.6:
                        logger.warning(f"⚠️ Repetition detected: '{insight['nextMove']}' too similar to '{recent}' ({overlap:.0%} match)")
                        # Force variation by prepending "Try: "
                        insight['nextMove'] = f"Try: {insight['nextMove']}"[:50]
        
        logger.info(f"✅ Insight generated - Label: {insight['emotionalLabel']}, Move: {insight['nextMove']}")
        
        logger.info(f"✅ Insight generated | CID: {correlation_id} | Label: {insight['emotionalLabel'][:30]} | Move: {insight['nextMove'][:50]}")
        
        return InsightResponse(
            emotionalLabel=insight['emotionalLabel'],
            nextMove=insight['nextMove'],
            source="claude",
            correlationId=correlation_id
        )
        
    except Exception as e:
        logger.error(f"❌ Insight generation error: {str(e)}")
        
        # Check if it's a rate limit error
        error_str = str(e).lower()
        is_rate_limited = 'rate' in error_str and 'limit' in error_str
        
        if is_rate_limited:
            logger.warning("⚠️ Rate limited - using enhanced fallback")
        
        # Fallback to deterministic insight
        topic_words = {
            'food': 'cooking', 'fitness': 'workout', 'finance': 'money',
            'personal': 'story', 'interaction': 'chat', 'general': 'content',
            'gaming': 'gaming', 'makeup': 'makeup', 'music': 'music'
        }
        topic = request.topic or 'general'
        topic_word = topic_words.get(topic, 'content')
        
        delta_abs = abs(request.viewerDelta)
        
        if request.viewerDelta > 0:
            # Positive - be specific about the win
            if request.viewerDelta >= 20:
                emotional_label = f"{topic_word} wins big"
                next_move = f"Double down {topic_word}. Stay hyped"
            elif request.viewerDelta >= 10:
                emotional_label = f"{topic_word} works"
                next_move = f"Show more {topic_word}. Keep energy"
            else:
                emotional_label = f"{topic_word} gains"
                next_move = f"Keep {topic_word} going. Stay present"
        elif delta_abs > 30:
            # Dump - urgent pivot
            emotional_label = f"{topic_word} kills vibe"
            next_move = "Start giveaway now. Boost energy fast"
        elif request.viewerDelta < 0:
            # Drop - constructive pivot
            emotional_label = f"{topic_word} dips"
            next_move = "Pivot to Q&A. Build excitement"
        else:
            # Flatline
            emotional_label = "energy steady"
            next_move = "Ask quick question. Create buzz"
        
        return InsightResponse(
            emotionalLabel=emotional_label,
            nextMove=next_move,
            source="fallback" if not is_rate_limited else "fallback_rate_limited"
        )

# ==================== HUME AI EMOTION ANALYSIS ====================

class HumeAnalysisRequest(BaseModel):
    text: str

class HumeAnalysisResponse(BaseModel):
    emotion: str
    score: float
    confidence: int

@api_router.post("/analyze-emotion", response_model=HumeAnalysisResponse)
async def analyze_emotion(request: HumeAnalysisRequest):
    """
    Analyze emotion in text using Hume AI (migrated from Supabase)
    """
    try:
        logger.info(f"🎭 Analyzing emotion for text: {request.text[:50]}...")
        
        # Call Hume AI via original Supabase function (for now)
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://hnvdovyiapkkjrxcxbrv.supabase.co/functions/v1/hume-analyze-text",
                headers={"Content-Type": "application/json"},
                json={"text": request.text},
                timeout=5.0  # 5 second timeout
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Hume AI request failed")
            
            data = response.json()
            
            result = HumeAnalysisResponse(
                emotion=data.get("emotion", "Neutral"),
                score=data.get("score", 0.5),
                confidence=int(data.get("confidence", 50))
            )
            
            logger.info(f"✅ Hume analysis complete: {result.emotion} ({result.confidence}%)")
            return result
            
    except Exception as e:
        logger.error(f"❌ Hume analysis error: {str(e)}")
        
        # Return neutral fallback
        return HumeAnalysisResponse(
            emotion="Neutral",
            score=0.5,
            confidence=0
        )

# ==================== END CORRELATION ENGINE ====================

# Include the router in the main app
app.include_router(api_router)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
