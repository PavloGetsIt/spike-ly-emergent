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
from emergentintegrations.llm.chat import LlmChat, UserMessage
import json


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

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

class InsightResponse(BaseModel):
    emotionalLabel: str
    nextMove: str
    source: str = "claude"

@api_router.post("/generate-insight", response_model=InsightResponse)
async def generate_insight(request: InsightRequest):
    """
    Generate tactical live stream insights using Claude Sonnet 4.5
    """
    try:
        logger.info(f"🤖 Generating insight for delta: {request.viewerDelta}")
        
        # Get Emergent LLM key
        api_key = os.getenv('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")
        
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
        
        # Create system prompt
        system_prompt = """You are Spikely - a tactical AI coach for live streamers. Generate ONE micro-decision they can execute in the next 30 seconds to spike viewer engagement.

OUTPUT REQUIREMENTS:
- emotionalLabel: 2-3 words describing what pattern you detected
- nextMove: 3-5 word action + emotional cue (max 8 words total)
- MUST be specific to their actual content (not generic)
- Use positive framing (what TO do, not what NOT to do)

ANALYSIS PRIORITY:
1. What SPECIFIC topic/action caused the viewer change?
2. What emotional energy drove it? (from Hume AI prosody)
3. Should they amplify this or pivot?

ACTION VERBS TO USE:
Ask, Show, Talk about, Tease, Reveal, Pivot to, Demonstrate, Explain

TONAL CUES TO USE:
Stay hyped, Go vulnerable, Build excitement, Keep energy up, Soften tone, Be authentic, Speed up, Be direct, Stay present, Boost energy

TOPIC CATEGORIES:
Gaming, makeup, cooking, fitness, story, chat, giveaway, product, tutorial, Q&A, personal, tech, music, art

INSIGHT STRUCTURE EXAMPLES:

**SPIKE (viewers increasing +5 or more):**
Pattern detected → Amplify it with specific action
- Gaming spike +12: {"emotionalLabel": "gaming talk wins", "nextMove": "Ask about their setups. Stay hyped"}
- Makeup demo +15: {"emotionalLabel": "tutorial spikes", "nextMove": "Show closeup angles. Stay excited"}
- Personal story +20: {"emotionalLabel": "vulnerability connects", "nextMove": "Ask their stories. Be authentic"}
- Product reveal +18: {"emotionalLabel": "product hype works", "nextMove": "Show features closeup. Build excitement"}

**DROP (viewers decreasing -5 to -15):**
Pattern detected → Constructive pivot
- Tech rant -10: {"emotionalLabel": "tech talk dips", "nextMove": "Pivot to giveaway. Boost energy"}
- Slow pacing -8: {"emotionalLabel": "pacing slows", "nextMove": "Ask quick questions. Speed up"}
- Repetitive -7: {"emotionalLabel": "topic repeats", "nextMove": "Switch to Q&A. Create buzz"}

**DUMP (viewers dropping -20 or more):**
Pattern detected → Urgent recovery
- Complaining -25: {"emotionalLabel": "negativity drops hard", "nextMove": "Show product now. Go upbeat"}
- Dead air -30: {"emotionalLabel": "silence kills", "nextMove": "Start giveaway. Boost energy fast"}

**FLATLINE (viewers stable ±3):**
Create engagement opportunity
- Stable chat: {"emotionalLabel": "energy steady", "nextMove": "Ask where they're from. Create buzz"}
- Background music: {"emotionalLabel": "passive viewing", "nextMove": "Tease big reveal. Build hype"}

CRITICAL RULES:
1. NEVER echo raw transcript words (e.g., if they said "twenty one is young" don't use those exact words)
2. Extract the TOPIC/THEME, not the exact phrasing
3. Be hyper-specific: "Ask about setups" NOT "talk about gaming"
4. Include the HOW: emotion/energy cue in every nextMove
5. Total nextMove: 8 words maximum
6. emotionalLabel: 3 words maximum

BAD EXAMPLES (too generic - NEVER do this):
- {"emotionalLabel": "positive", "nextMove": "Keep doing this"}
- {"emotionalLabel": "engagement", "nextMove": "Be more engaging"}
- {"emotionalLabel": "content", "nextMove": "Do more content talk"} ← This is terrible!
- {"emotionalLabel": "momentum", "nextMove": "Keep momentum going"}

GOOD EXAMPLES (specific and tactical):
- {"emotionalLabel": "cooking demo spikes", "nextMove": "Show ingredients closeup. Stay excited"}
- {"emotionalLabel": "workout energy wins", "nextMove": "Demonstrate moves. Keep intensity high"}
- {"emotionalLabel": "Q&A engagement works", "nextMove": "Ask about their day. Be curious"}
- {"emotionalLabel": "giveaway hype builds", "nextMove": "Tease prize details. Build anticipation"}

Return ONLY valid JSON. No markdown, no explanations."""

        # Create user prompt
        user_prompt = f"""LIVE STREAM DATA:

WHAT THEY SAID: "{request.transcript}"

VIEWER IMPACT: {request.viewerDelta:+d} viewers ({request.prevCount} → {request.viewerCount})

VOICE ANALYSIS: {prosody_str}

ENERGY SIGNALS: {burst_str}

WORD EMOTION: {language_str}

TOPIC: {request.topic or 'general'}

RECENT PATTERN: {history_str}

SIGNAL STRENGTH: {request.quality or 'medium'}

---

Based on this data, generate ONE tactical decision for the streamer to execute in the next 30 seconds. Return ONLY valid JSON with no markdown or explanation."""

        # Call Claude API
        logger.info("🤖 Calling Claude Sonnet 4.5...")
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
        logger.info(f"✅ Claude response: {generated_text[:100]}...")
        
        # Parse JSON
        try:
            insight = json.loads(generated_text)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown or wrapper text
            import re
            match = re.search(r'\{[\s\S]*\}', generated_text)
            if match:
                insight = json.loads(match.group(0))
            else:
                raise ValueError("Invalid JSON response from Claude")
        
        # Validate and enforce constraints
        if not insight.get('emotionalLabel') or not insight.get('nextMove'):
            raise ValueError("Missing required fields in insight")
        
        # Enforce word limits
        emotional_words = insight['emotionalLabel'].split()[:3]
        insight['emotionalLabel'] = ' '.join(emotional_words)
        
        next_move_words = insight['nextMove'].split()[:8]
        insight['nextMove'] = ' '.join(next_move_words)
        
        # Validate no transcript bleed
        transcript_start = ' '.join(request.transcript.lower().split()[:10])
        if any(word in transcript_start for word in insight['emotionalLabel'].lower().split() if len(word) > 4):
            logger.warning("⚠️ Transcript bleed detected in emotionalLabel, using fallback")
            insight['emotionalLabel'] = "✅ Neutral" if request.viewerDelta > 0 else "❌ Neutral"
        
        logger.info(f"✅ Insight generated - Label: {insight['emotionalLabel']}, Move: {insight['nextMove']}")
        
        return InsightResponse(
            emotionalLabel=insight['emotionalLabel'],
            nextMove=insight['nextMove'],
            source="claude"
        )
        
    except Exception as e:
        logger.error(f"❌ Insight generation error: {str(e)}")
        
        # Fallback to deterministic insight
        topic_words = {
            'food': 'cooking', 'fitness': 'workout', 'finance': 'money',
            'personal': 'story', 'interaction': 'chat', 'general': 'content'
        }
        topic = request.topic or 'general'
        topic_word = topic_words.get(topic, 'content')
        
        if request.viewerDelta > 0:
            emotional_label = f"{topic_word} engaged"
            next_move = f"Do more {topic_word} talk"
        elif abs(request.viewerDelta) > 30:
            emotional_label = f"{topic_word} dump"
            next_move = f"Stop {topic_word}. Change topic now"
        else:
            emotional_label = f"{topic_word} dip"
            next_move = f"Less {topic_word}. Boost energy"
        
        return InsightResponse(
            emotionalLabel=emotional_label,
            nextMove=next_move,
            source="fallback"
        )

# ==================== END CORRELATION ENGINE ====================

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
