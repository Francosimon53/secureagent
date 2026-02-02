#!/bin/bash

# SecureAgent Comprehensive Test Script
# Tests endpoints and pages on the deployed site

BASE_URL="https://secureagent.vercel.app"
RESULTS_FILE="/tmp/secureagent-test-results.json"

echo "=========================================="
echo "SecureAgent Comprehensive Test Suite"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Date: $(date)"
echo ""

# Initialize results
echo '{"endpoints":[],"pages":[],"summary":{}}' > $RESULTS_FILE

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0
warnings=0

test_endpoint() {
    local name="$1"
    local url="$2"
    local expected_status="${3:-200}"

    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10 2>/dev/null)

    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} $name (HTTP $response)"
        ((passed++))
        return 0
    elif [ "$response" = "000" ]; then
        echo -e "${RED}✗${NC} $name (Timeout/Connection Error)"
        ((failed++))
        return 1
    else
        echo -e "${RED}✗${NC} $name (Expected $expected_status, got $response)"
        ((failed++))
        return 1
    fi
}

test_page_content() {
    local name="$1"
    local url="$2"
    local search_text="$3"

    content=$(curl -s "$url" --max-time 10 2>/dev/null)

    if echo "$content" | grep -q "$search_text"; then
        echo -e "${GREEN}✓${NC} $name (Content verified)"
        ((passed++))
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $name (Content '$search_text' not found)"
        ((warnings++))
        return 1
    fi
}

echo "--- Testing API Endpoints ---"
echo ""

# API Endpoints
test_endpoint "GET /api/blog/posts" "$BASE_URL/api/blog/posts"
test_endpoint "GET /api/skills/marketplace" "$BASE_URL/api/skills/marketplace"
test_endpoint "GET /api/integrations" "$BASE_URL/api/integrations"
test_endpoint "GET /api/music" "$BASE_URL/api/music"
test_endpoint "GET /api/social/accounts" "$BASE_URL/api/social/accounts"
test_endpoint "GET /api/voice/settings" "$BASE_URL/api/voice/settings"

echo ""
echo "--- Testing Dashboard Pages ---"
echo ""

# Dashboard Pages
test_endpoint "Dashboard Home" "$BASE_URL/dashboard"
test_endpoint "Dashboard Chat" "$BASE_URL/dashboard/chat"
test_endpoint "Dashboard Integrations" "$BASE_URL/dashboard/integrations"
test_endpoint "Dashboard Marketplace" "$BASE_URL/dashboard/marketplace"
test_endpoint "Dashboard Social" "$BASE_URL/dashboard/social"
test_endpoint "Dashboard Smart Home" "$BASE_URL/dashboard/smart-home"
test_endpoint "Dashboard Voice Calls" "$BASE_URL/dashboard/voice-calls"
test_endpoint "Dashboard Music" "$BASE_URL/dashboard/music"
test_endpoint "Dashboard ARIA" "$BASE_URL/dashboard/aria"
test_endpoint "Dashboard Settings" "$BASE_URL/dashboard/settings"

echo ""
echo "--- Testing Public Pages ---"
echo ""

# Public Pages
test_endpoint "Landing Page" "$BASE_URL"
test_endpoint "Blog Page" "$BASE_URL/blog"
test_endpoint "Pricing Page" "$BASE_URL/pricing"
test_endpoint "Docs Page" "$BASE_URL/docs"
test_endpoint "Privacy Page" "$BASE_URL/privacy"
test_endpoint "Sitemap" "$BASE_URL/sitemap.xml"
test_endpoint "Robots.txt" "$BASE_URL/robots.txt"

echo ""
echo "--- Testing Page Content ---"
echo ""

# Content verification
test_page_content "Launch Banner" "$BASE_URL" "PRODUCTHUNT50"
test_page_content "Testimonials Section" "$BASE_URL" "What Users Are Saying"
test_page_content "Product Hunt Badge" "$BASE_URL" "Product Hunt"
test_page_content "Blog Posts Exist" "$BASE_URL/blog" "Getting Started"

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed:${NC} $passed"
echo -e "${RED}Failed:${NC} $failed"
echo -e "${YELLOW}Warnings:${NC} $warnings"
echo ""

total=$((passed + failed))
if [ $failed -eq 0 ]; then
    echo -e "${GREEN}All critical tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Please review.${NC}"
    exit 1
fi
