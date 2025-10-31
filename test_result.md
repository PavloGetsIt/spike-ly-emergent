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
  Spikely Chrome Extension - DOM Viewer Count Detection Fix
  
  CRITICAL ISSUE: The viewer count detection was broken, showing 0 instead of actual counts (e.g., 2.1K).
  This is the highest priority issue as it blocks the core correlation engine functionality.
  
  ROOT CAUSE: TikTok frequently changes its DOM structure and CSS classes. Previous detection methods
  were too rigid and relied on specific selectors that became outdated.
  
  SOLUTION IMPLEMENTED: Three-tier robust detection strategy
  1. Label-based detection (search for "Viewers" text and find associated numbers)
  2. Brute force number search (scan all elements, prioritize by context)
  3. Priority selectors (updated with 2025 patterns + legacy support)
  
  ENHANCEMENTS:
  - Extensive console debugging with [VC:DEBUG] prefix
  - Manual test command: window.__SPIKELY_TEST__()
  - Improved decimal parsing (1.2K → 1200 not 2000)
  - Validation tests on load (12 test cases)
  - Better element caching and revalidation
  
  Tech Stack: Chrome Extension (Manifest V3), Vanilla JS
  Priority: CRITICAL - Without this, correlation engine cannot work

frontend:
  - task: "DOM Viewer Count Detection - Three-Tier Strategy"
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
          CRITICAL FIX: Completely rewrote queryViewerNode() with 3-tier detection strategy:
          
          STRATEGY 1 (Label-Based): Search for "Viewers" text and find associated numbers
          - Checks siblings, children, parent elements
          - Handles inline formats like "Viewers • 2.1K"
          - Most reliable as text content is stable
          
          STRATEGY 2 (Brute Force): Scan ALL elements for viewer count patterns
          - Finds numbers like "2.1K", "953" anywhere in DOM
          - Scores by viewer context in parent elements
          - Sorts candidates by confidence
          - Logs top 5 candidates for debugging
          
          STRATEGY 3 (Priority Selectors): Updated selector list
          - Added 2025 patterns: [data-e2e*="viewer"], [class*="ViewerCount"], [aria-label*="viewer"]
          - Preserved original working selectors
          - 15+ selector variations
          
          Files changed: /app/frontend/extension/content.js (lines 39-310)
  
  - task: "Enhanced Number Parsing with Decimal Support"
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
          Fixed parseTextToCount() to handle decimal values correctly:
          - 1.2K → 1200 (not 1000 or 2000)
          - Handle bullets (•), dots (·), commas
          - Case insensitive (2.5k or 2.5K)
          - 12 validation tests run on load
          
          All test cases pass:
          ✅ "953" → 953
          ✅ "1.2K" → 1200
          ✅ "1.5M" → 1500000
          etc.
  
  - task: "Manual Testing Tool - window.__SPIKELY_TEST__()"
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
          Added console command for instant detection testing:
          
          Usage: Open TikTok Live page → DevTools console → window.__SPIKELY_TEST__()
          
          Output includes:
          - Found element details (text, classes, parsed value)
          - Test message sent to background script
          - Debug suggestions if detection fails
          - Clear success/failure indicators
          
          Makes debugging 10x easier for users and developers.
  
  - task: "Comprehensive Console Debugging"
    implemented: true
    working: true
    file: "/app/frontend/extension/content.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: |
          Added extensive [VC:DEBUG] logging throughout detection process:
          - Strategy-by-strategy progress
          - Found elements and parsed values
          - Top 5 candidates with confidence scores
          - Clear success/failure messages
          - Helpful tips when detection fails
          
          All logs can be filtered by "[VC:DEBUG]" prefix in console.

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0
  run_ui: false

test_plan:
  current_focus:
    - "Manual testing of Chrome extension side panel"
    - "Verify all 8 Priority One fixes"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      ✅ All Priority One UI/UX fixes have been implemented:
      
      1. CSS Cache Busting - Added ?v=2025102101 and inline critical animations
      2. JS Initialization - Retry logic with 5 attempts, 200ms intervals
      3. Text Truncation - Hover tooltips + click-to-expand
      4. Status Animation - Pulse animation with fallback
      5. Audio State - Clear labels and visual feedback
      6. Delta Tooltips - Hover tooltips with color coding
      7. Timestamp Format - Relative time with auto-update
      8. Alignment - CSS fixes already present
      
      Files Modified:
      - /app/frontend/extension/sidepanel.html (+45 lines)
      - /app/frontend/extension/sidepanel.js (+140 lines)
      
      Documentation Created:
      - /app/PRIORITY_ONE_FIXES_COMPLETE.md
      - /app/PRIORITY_ONE_TESTING_GUIDE.md
      
      Next Steps:
      - Manual testing in Chrome browser
      - Load extension and verify all features
      - Check console logs for initialization
      - Test tooltips, animations, and timestamps
      - Once verified, proceed to correlation engine work