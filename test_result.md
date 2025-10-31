#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Spikely Chrome Extension - Phase 1 Signal Enhancement: Chat Stream Detection
  
  GOAL: Implement the most critical engagement signal (chat comments) to enable accurate 
  action→outcome correlation. This is Priority 1 of the Signal Enhancement roadmap.
  
  FEATURE IMPLEMENTED: Real-time TikTok Live chat stream detection and analysis
  
  CORE FUNCTIONALITY:
  - MutationObserver-based chat tracking (watches for new comments in DOM)
  - 30-second rolling buffer of comments (username, text, timestamp)
  - Duplicate filtering and efficient batching (2s intervals)
  - Chat rate calculation (comments per minute)
  - Keyword extraction from chat content
  - Integration with correlation engine and Claude AI
  
  DATA CAPTURED:
  - Comment text (full message)
  - Username (who posted)
  - Timestamp (millisecond precision)
  - Chat rate (comments/min)
  - Top keywords (frequency analysis)
  
  INTEGRATION POINTS:
  1. content.js - DOM observation and parsing
  2. background.js - Message routing
  3. correlationEngine.js - Buffer management and context extraction
  4. server.py - Claude prompt enhancement with chat data
  
  VALUE: Claude can now reference specific viewer questions and comments in insights:
  - "Answer 'what song is this'. Name it now"
  - "Shoutout user789 for fire comment"
  - "Read top chat question. Respond big"
  
  Tech Stack: Chrome Extension (Manifest V3), Vanilla JS, FastAPI backend
  Priority: CRITICAL - Most important single engagement signal

frontend:
  - task: "Chat Stream Detection - Multi-Tier Selector Strategy"
    implemented: true
    working: "needs_testing"
    file: "/app/frontend/extension/content.js"
    stuck_count: 0
    priority: "critical"
    needs_retesting: true
    status_history:
      - working: "needs_testing"
        agent: "main"
        comment: |
          ✅ CRITICAL FEATURE: Real-time chat detection system implemented
          
          DETECTION STRATEGY (3-tier):
          1. Priority selectors: [data-e2e="live-chat-list"], [class*="ChatList"], etc.
          2. Heuristic search: Find scrollable containers with 10+ children
          3. Fallback: Manual inspection guidance
          
          PARSING CAPABILITIES:
          - Extract username from multiple selector variations
          - Extract comment text with fallback to full text content
          - Generate unique IDs for duplicate detection
          - Handle TikTok's dynamic class names
          
          CONFIGURATION:
          - 30s rolling buffer (max 200 comments)
          - 2s batch emission interval
          - 100ms mutation debounce
          - 3s retry interval if container not found
          
          FILES: +600 lines in content.js (lines 1065-1595)
  
  - task: "Chat Buffer Management & Keyword Extraction"
    implemented: true
    working: "needs_testing"
    file: "/app/frontend/extension/correlationEngine.js"
    stuck_count: 0
    priority: "critical"
    needs_retesting: true
    status_history:
      - working: "needs_testing"
        agent: "main"
        comment: |
          ✅ Added chat stream integration to correlation engine
          
          NEW METHODS:
          - addChatStream(): Maintains 30s rolling buffer
          - getChatContext(): Returns chat data for insights
          - extractChatKeywords(): NLP-style keyword extraction
          
          DATA PROVIDED:
          - Comment count in last 30s
          - Chat rate (comments/min)
          - Top 5 keywords (stop words filtered)
          - Last 10 comments for context
          
          INTEGRATION:
          - Enhanced insight payload with chatData field
          - Claude receives chat context in every insight request
          
          FILES: +150 lines (lines 838-920)
  
  - task: "Chat Message Routing & Logging"
    implemented: true
    working: "needs_testing"
    file: "/app/frontend/extension/background.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "needs_testing"
        agent: "main"
        comment: |
          ✅ CHAT_STREAM_UPDATE message handler added
          
          FUNCTIONALITY:
          - Receives batched chat data from content script
          - Forwards to correlation engine
          - Broadcasts to side panel for display
          - Logs sample comments for debugging
          
          MESSAGE FORMAT:
          {
            type: 'CHAT_STREAM_UPDATE',
            platform: 'tiktok',
            comments: [{ username, text, timestamp }, ...],
            chatRate: 30,
            commentCount: 15
          }
          
          FILES: +35 lines (lines 301-330)
  
  - task: "Manual Chat Testing Tool"
    implemented: true
    working: "needs_testing"
    file: "/app/frontend/extension/content.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "needs_testing"
        agent: "main"
        comment: |
          ✅ Console command for instant chat detection testing
          
          Usage: window.__SPIKELY_TEST_CHAT__()
          
          OUTPUT:
          - Chat container found/not found
          - Element details (tag, classes, children count)
          - Parsed comment samples (first 3)
          - Current buffer size
          - Tracking status
          - Debug suggestions if failed
          
          Makes debugging 10x easier for TikTok DOM changes

backend:
  - task: "Chat Context Enhancement for Claude Prompts"
    implemented: true
    working: "needs_testing"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "critical"
    needs_retesting: true
    status_history:
      - working: "needs_testing"
        agent: "main"
        comment: |
          ✅ Backend integration for chat-aware insights
          
          NEW MODEL:
          class ChatData(BaseModel):
              commentCount: int
              chatRate: int
              topKeywords: Optional[List[str]]
              recentComments: Optional[List[str]]
          
          CLAUDE PROMPT ENHANCEMENT:
          Added chat context section:
          - Comment count in last 30s
          - Chat rate (comments/min)
          - Top keywords from chat
          - Last 3 comments with usernames
          - Guidance: "Use chat context: Reference specific viewer questions"
          
          IMPACT:
          Claude can now generate insights like:
          - "Answer 'what song is this'. Name it now"
          - "Shoutout user789 for fire comment"
          - "Read top chat question. Respond big"
          
          FILES: +30 lines (lines 93-97, 299-320)

metadata:
  created_by: "main_agent"
  version: "2.2.0-CHAT-STREAM"
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus:
    - "Chat Stream Detection - Multi-Tier Selector Strategy"
    - "Chat Buffer Management & Keyword Extraction"
    - "Chat Context Enhancement for Claude Prompts"
  stuck_tasks: []
  test_all: false
  test_priority: "critical_first"

agent_communication:
  - agent: "main"
    message: |
      ✅ PHASE 1 SIGNAL ENHANCEMENT: Chat Stream Detection (v1.0) COMPLETE
      
      🎯 **Achievement:** Implemented the #1 priority engagement signal
      
      This is THE MOST CRITICAL signal for accurate action→outcome correlation.
      Chat provides direct audience feedback that correlates with viewer changes.
      
      📊 **What Was Built:**
      
      **1. Real-Time Chat Detection (content.js)**
      - MutationObserver watches for new comments in TikTok Live DOM
      - 3-tier selector strategy (priority → heuristic → fallback)
      - Parses username + text + timestamp from each comment
      - 30-second rolling buffer (max 200 comments)
      - Duplicate filtering via unique IDs
      - Batched emission every 2 seconds
      - Manual test command: window.__SPIKELY_TEST_CHAT__()
      
      **2. Chat Buffer & Analytics (correlationEngine.js)**
      - addChatStream() - Maintains 30s rolling buffer
      - getChatContext() - Provides chat data for insights
      - extractChatKeywords() - NLP-style keyword extraction
      - Stop word filtering + frequency analysis
      - Returns: commentCount, chatRate, topKeywords, recentComments
      
      **3. Message Routing (background.js)**
      - CHAT_STREAM_UPDATE handler
      - Forwards to correlation engine
      - Logs sample comments for debugging
      
      **4. Claude Prompt Enhancement (server.py)**
      - New ChatData model (commentCount, chatRate, topKeywords, recentComments)
      - Enhanced prompt with chat context section
      - Claude can now reference viewer questions and comments
      
      🎁 **Value Delivered:**
      
      **Before:** Claude only saw transcript + viewer count
      ```json
      {"emotionalLabel": "topic exhausted", 
       "nextMove": "Pivot to Q&A. Build excitement"}  // Generic
      ```
      
      **After:** Claude sees what viewers are asking
      ```json
      {"emotionalLabel": "song request spike",
       "nextMove": "Answer 'what song is this'. Name it now"}  // Specific
      ```
      
      📦 **Files Modified:**
      - /app/frontend/extension/content.js (+600 lines)
        • Chat config, selectors, detection, parsing
        • window.__SPIKELY_TEST_CHAT__() test tool
      
      - /app/frontend/extension/correlationEngine.js (+150 lines)
        • addChatStream(), getChatContext(), extractChatKeywords()
        • Enhanced insight payload with chatData
      
      - /app/frontend/extension/background.js (+35 lines)
        • CHAT_STREAM_UPDATE message handler
      
      - /app/backend/server.py (+30 lines)
        • ChatData model, chatData field, prompt enhancement
      
      📚 **Documentation:**
      - /app/CHAT_STREAM_DETECTION_v1.md (comprehensive technical guide)
      
      🧪 **Testing Instructions:**
      
      **Quick Test (30 seconds):**
      1. Go to TikTok Live page
      2. Open DevTools console (F12)
      3. Run: window.__SPIKELY_TEST_CHAT__()
      4. Check if chat container found + comments parsed ✅
      
      **Full Test (5 minutes):**
      1. Load extension → Go to active TikTok Live
      2. Click "Start Audio" (starts chat tracking)
      3. Watch console for:
         [CHAT] 💬 username: comment text
         [CHAT] 📤 Emitted batch: X comments, rate: Y/min
         [CHAT:BG:RX] CHAT_STREAM_UPDATE
         [Correlation] Chat stream updated
      4. Wait for insight → Check if Claude references chat
      
      📊 **Phase 1 Progress:**
      ✅ Chat Stream Detection (Priority 1) - COMPLETE
      ❌ Hearts/Gifts Detection (Priority 2) - Not started
      ❌ Follow Events (Priority 2) - Not started  
      ❌ Platform Delay Measurement (Priority 3) - Not started
      ❌ Data Quality Monitoring (Priority 4) - Not started
      
      🚀 **Status:** ✅ Ready for manual testing on live TikTok streams
      
      **Next Steps:**
      - Test chat detection on multiple TikTok streams
      - Verify insights reference viewer comments
      - Refine selectors if DOM structure changed
      - Then move to Priority 2: Hearts/Gifts detection