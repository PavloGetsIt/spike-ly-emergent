#!/usr/bin/env python3
"""
Backend API Testing Suite for Spikely Chrome Extension
Tests FastAPI server endpoints, Claude integration, CORS, MongoDB, and API keys
"""

import requests
import json
import sys
import os
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = "https://live-assistant-2.preview.emergentagent.com/api"

# ANSI color codes for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'
BOLD = '\033[1m'

def print_test_header(test_name):
    """Print formatted test header"""
    print(f"\n{BLUE}{BOLD}{'='*70}{RESET}")
    print(f"{BLUE}{BOLD}TEST: {test_name}{RESET}")
    print(f"{BLUE}{BOLD}{'='*70}{RESET}")

def print_success(message):
    """Print success message"""
    print(f"{GREEN}✅ {message}{RESET}")

def print_error(message):
    """Print error message"""
    print(f"{RED}❌ {message}{RESET}")

def print_warning(message):
    """Print warning message"""
    print(f"{YELLOW}⚠️  {message}{RESET}")

def print_info(message):
    """Print info message"""
    print(f"{BLUE}ℹ️  {message}{RESET}")

# Test results tracking
test_results = {
    "passed": [],
    "failed": [],
    "warnings": []
}

def test_1_server_health():
    """Test 1: Basic server health - GET /api/ endpoint"""
    print_test_header("1. Server Health Check (GET /api/)")
    
    try:
        response = requests.get(f"{BACKEND_URL}/", timeout=10)
        
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("message") == "Hello World":
                print_success("Server is healthy and returning correct response")
                test_results["passed"].append("Server Health Check")
                return True
            else:
                print_error(f"Unexpected response: {data}")
                test_results["failed"].append("Server Health Check - Wrong response")
                return False
        else:
            print_error(f"Server returned status code {response.status_code}")
            test_results["failed"].append(f"Server Health Check - Status {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print_error(f"Failed to connect to server: {str(e)}")
        test_results["failed"].append(f"Server Health Check - Connection error: {str(e)}")
        return False

def test_2_cors_configuration():
    """Test 2: CORS configuration - Verify server accepts requests from Chrome extensions"""
    print_test_header("2. CORS Configuration Check")
    
    try:
        # Test with Chrome extension origin
        headers = {
            "Origin": "chrome-extension://abcdefghijklmnopqrstuvwxyz123456",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"
        }
        
        # OPTIONS preflight request
        response = requests.options(f"{BACKEND_URL}/generate-insight", headers=headers, timeout=10)
        
        print_info(f"Preflight Status Code: {response.status_code}")
        print_info(f"CORS Headers: {dict(response.headers)}")
        
        # Check CORS headers
        cors_headers = {
            "access-control-allow-origin": response.headers.get("access-control-allow-origin"),
            "access-control-allow-methods": response.headers.get("access-control-allow-methods"),
            "access-control-allow-headers": response.headers.get("access-control-allow-headers"),
        }
        
        print_info(f"Allow-Origin: {cors_headers['access-control-allow-origin']}")
        print_info(f"Allow-Methods: {cors_headers['access-control-allow-methods']}")
        print_info(f"Allow-Headers: {cors_headers['access-control-allow-headers']}")
        
        if cors_headers["access-control-allow-origin"] == "*":
            print_success("CORS is configured to allow all origins (including Chrome extensions)")
            test_results["passed"].append("CORS Configuration")
            return True
        else:
            print_warning("CORS may not allow Chrome extension origins")
            test_results["warnings"].append("CORS Configuration - May not allow Chrome extensions")
            return True
            
    except requests.exceptions.RequestException as e:
        print_error(f"CORS test failed: {str(e)}")
        test_results["failed"].append(f"CORS Configuration - {str(e)}")
        return False

def test_3_mongodb_connectivity():
    """Test 3: Database connectivity - Check MongoDB connection"""
    print_test_header("3. MongoDB Connectivity Check")
    
    try:
        # Test by creating and retrieving a status check
        test_data = {
            "client_name": f"test_client_{datetime.now().timestamp()}"
        }
        
        print_info(f"Creating test status check: {test_data}")
        
        # Create status check
        response = requests.post(
            f"{BACKEND_URL}/status",
            json=test_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print_info(f"Create Status Code: {response.status_code}")
        
        if response.status_code == 200:
            created_data = response.json()
            print_info(f"Created record: {created_data}")
            
            # Retrieve status checks
            get_response = requests.get(f"{BACKEND_URL}/status", timeout=10)
            
            if get_response.status_code == 200:
                all_checks = get_response.json()
                print_info(f"Retrieved {len(all_checks)} status checks from database")
                
                # Verify our test record exists
                found = any(check.get("client_name") == test_data["client_name"] for check in all_checks)
                
                if found:
                    print_success("MongoDB is connected and working correctly")
                    test_results["passed"].append("MongoDB Connectivity")
                    return True
                else:
                    print_error("Created record not found in database")
                    test_results["failed"].append("MongoDB Connectivity - Record not found")
                    return False
            else:
                print_error(f"Failed to retrieve status checks: {get_response.status_code}")
                test_results["failed"].append("MongoDB Connectivity - Retrieval failed")
                return False
        else:
            print_error(f"Failed to create status check: {response.status_code}")
            print_error(f"Response: {response.text}")
            test_results["failed"].append("MongoDB Connectivity - Creation failed")
            return False
            
    except requests.exceptions.RequestException as e:
        print_error(f"MongoDB connectivity test failed: {str(e)}")
        test_results["failed"].append(f"MongoDB Connectivity - {str(e)}")
        return False

def test_4_api_key_validation():
    """Test 4: API key validation - Verify ANTHROPIC_API_KEY is configured"""
    print_test_header("4. API Key Validation (ANTHROPIC_API_KEY)")
    
    # Check if API key exists in backend .env file
    env_file_path = "/app/backend/.env"
    
    try:
        with open(env_file_path, 'r') as f:
            env_content = f.read()
            
        if "ANTHROPIC_API_KEY" in env_content:
            # Extract the key (mask it for security)
            for line in env_content.split('\n'):
                if line.startswith("ANTHROPIC_API_KEY"):
                    key_value = line.split('=', 1)[1].strip().strip('"')
                    if key_value and len(key_value) > 10:
                        masked_key = key_value[:10] + "..." + key_value[-4:]
                        print_info(f"API Key found: {masked_key}")
                        print_success("ANTHROPIC_API_KEY is properly configured")
                        test_results["passed"].append("API Key Validation")
                        return True
                    else:
                        print_error("ANTHROPIC_API_KEY is empty or invalid")
                        test_results["failed"].append("API Key Validation - Empty key")
                        return False
        else:
            print_error("ANTHROPIC_API_KEY not found in .env file")
            test_results["failed"].append("API Key Validation - Key not found")
            return False
            
    except Exception as e:
        print_error(f"Failed to validate API key: {str(e)}")
        test_results["failed"].append(f"API Key Validation - {str(e)}")
        return False

def test_5_claude_integration():
    """Test 5: Claude integration - POST /api/generate-insight endpoint"""
    print_test_header("5. Claude Integration (POST /api/generate-insight)")
    
    # Sample payload from review request
    test_payload = {
        "transcript": "Hey everyone, what's up! Should I show you my new setup?",
        "viewerDelta": 5,
        "viewerCount": 150,
        "prevCount": 145,
        "prosody": {
            "topEmotion": "excitement",
            "topScore": 75,
            "energy": 80,
            "excitement": 85,
            "confidence": 70
        },
        "topic": "gaming"
    }
    
    print_info(f"Sending test payload:")
    print_info(json.dumps(test_payload, indent=2))
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/generate-insight",
            json=test_payload,
            headers={"Content-Type": "application/json"},
            timeout=30  # Claude API can take time
        )
        
        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            required_fields = ["emotionalLabel", "nextMove"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                print_error(f"Missing required fields: {missing_fields}")
                test_results["failed"].append(f"Claude Integration - Missing fields: {missing_fields}")
                return False
            
            print_success("Claude API responded successfully")
            print_info(f"Emotional Label: {data['emotionalLabel']}")
            print_info(f"Next Move: {data['nextMove']}")
            print_info(f"Source: {data.get('source', 'unknown')}")
            
            if data.get('source') == 'claude':
                print_success("Response generated by Claude (not fallback)")
                test_results["passed"].append("Claude Integration")
                return True
            elif 'fallback' in data.get('source', ''):
                print_warning("Response generated by fallback (Claude may have rate limits or errors)")
                test_results["warnings"].append("Claude Integration - Using fallback")
                return True
            else:
                print_success("Claude integration working")
                test_results["passed"].append("Claude Integration")
                return True
                
        elif response.status_code == 500:
            print_error("Server error - Check backend logs for details")
            print_error(f"Response: {response.text}")
            test_results["failed"].append("Claude Integration - Server error 500")
            return False
        else:
            print_error(f"Unexpected status code: {response.status_code}")
            print_error(f"Response: {response.text}")
            test_results["failed"].append(f"Claude Integration - Status {response.status_code}")
            return False
            
    except requests.exceptions.Timeout:
        print_error("Request timed out (Claude API may be slow)")
        test_results["failed"].append("Claude Integration - Timeout")
        return False
    except requests.exceptions.RequestException as e:
        print_error(f"Claude integration test failed: {str(e)}")
        test_results["failed"].append(f"Claude Integration - {str(e)}")
        return False

def print_summary():
    """Print test summary"""
    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}TEST SUMMARY{RESET}")
    print(f"{BOLD}{'='*70}{RESET}")
    
    total_tests = len(test_results["passed"]) + len(test_results["failed"]) + len(test_results["warnings"])
    
    print(f"\n{GREEN}✅ Passed: {len(test_results['passed'])}/{total_tests}{RESET}")
    for test in test_results["passed"]:
        print(f"   • {test}")
    
    if test_results["warnings"]:
        print(f"\n{YELLOW}⚠️  Warnings: {len(test_results['warnings'])}{RESET}")
        for test in test_results["warnings"]:
            print(f"   • {test}")
    
    if test_results["failed"]:
        print(f"\n{RED}❌ Failed: {len(test_results['failed'])}/{total_tests}{RESET}")
        for test in test_results["failed"]:
            print(f"   • {test}")
    
    print(f"\n{BOLD}{'='*70}{RESET}\n")
    
    # Return exit code
    return 0 if len(test_results["failed"]) == 0 else 1

def main():
    """Run all backend tests"""
    print(f"\n{BOLD}{BLUE}{'='*70}{RESET}")
    print(f"{BOLD}{BLUE}Spikely Backend API Test Suite{RESET}")
    print(f"{BOLD}{BLUE}Backend URL: {BACKEND_URL}{RESET}")
    print(f"{BOLD}{BLUE}{'='*70}{RESET}\n")
    
    # Run all tests
    test_1_server_health()
    test_2_cors_configuration()
    test_3_mongodb_connectivity()
    test_4_api_key_validation()
    test_5_claude_integration()
    
    # Print summary and exit
    exit_code = print_summary()
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
