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
  version: "2.1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "DOM Viewer Count Detection - Three-Tier Strategy"
    - "Manual Testing Tool - window.__SPIKELY_TEST__()"
    - "Enhanced Number Parsing with Decimal Support"
  stuck_tasks: []
  test_all: false
  test_priority: "critical_first"

agent_communication:
  - agent: "main"
    message: |
      🚨 CRITICAL FIX COMPLETED: DOM Viewer Count Detection (v2.1.0)
      
      ✅ Implemented three-tier detection strategy to fix the broken viewer count (was showing 0 instead of 2.1K):
      
      **Strategy 1 - Label-Based Detection:**
      - Search for "Viewers" text in DOM
      - Check siblings/children/parent for numbers
      - Handle formats like "Viewers • 2.1K"
      - MOST RELIABLE: Text content is stable
      
      **Strategy 2 - Brute Force Number Search:**
      - Scan ALL elements for number patterns (2.1K, 953, etc.)
      - Score candidates by viewer context
      - Sort by confidence
      - Logs top 5 candidates for debugging
      - ADAPTIVE: Works even if DOM structure changes
      
      **Strategy 3 - Priority Selectors:**
      - Updated with 2025 TikTok Live patterns
      - 15+ selector variations (data-e2e, classes, aria-labels)
      - Preserves original working selectors
      - COMPREHENSIVE: Covers multiple naming conventions
      
      **Additional Improvements:**
      - Fixed decimal parsing: 1.2K → 1200 (not 1000)
      - 12 validation tests run on load
      - Manual test command: window.__SPIKELY_TEST__()
      - Extensive [VC:DEBUG] console logging
      - Better element caching and revalidation
      
      **Files Modified:**
      - /app/frontend/extension/content.js (lines 39-310, enhanced parsing, manual test tool)
      
      **Documentation:**
      - /app/VIEWER_DETECTION_FIX_V2.md (comprehensive guide)
      
      **Testing Instructions:**
      1. Load extension and go to TikTok Live page
      2. Open DevTools console
      3. Run: window.__SPIKELY_TEST__()
      4. OR click "Start Audio" and watch console for [VC:DEBUG] logs
      5. Verify viewer count shows correctly in side panel (not 0)
      
      **Next Steps:**
      - Manual testing on real TikTok Live streams required
      - User should test with multiple streamers (different viewer counts)
      - If detection still fails, run test command and share output
      - This fix unblocks the correlation engine functionality
      
      Status: ✅ Ready for manual testing
      Priority: 🔴 CRITICAL - Core functionality restored