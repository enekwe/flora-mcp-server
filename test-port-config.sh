#!/bin/bash

# Flora MCP Server - PORT Configuration Test
# Tests that the PORT configuration changes work correctly

set -e

echo "=========================================="
echo "Flora MCP Server - PORT Config Test"
echo "=========================================="
echo ""

cd "$(dirname "$0")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_case() {
    local name="$1"
    local command="$2"
    local expected_output="$3"
    local expected_failure="$4"

    echo "----------------------------------------"
    echo "Test: $name"
    echo "Command: $command"
    echo ""

    # Run the command and capture output and exit code
    set +e
    output=$(eval "$command" 2>&1)
    exit_code=$?
    set -e

    echo "Output:"
    echo "$output"
    echo ""
    echo "Exit code: $exit_code"
    echo ""

    # Check if test passed
    if [ "$expected_failure" = "true" ]; then
        if [ $exit_code -ne 0 ]; then
            if echo "$output" | grep -q "$expected_output"; then
                echo -e "${GREEN}✓ PASS${NC} - Expected failure occurred with correct message"
                ((TESTS_PASSED++))
            else
                echo -e "${RED}✗ FAIL${NC} - Expected failure but wrong error message"
                echo "Expected to find: $expected_output"
                ((TESTS_FAILED++))
            fi
        else
            echo -e "${RED}✗ FAIL${NC} - Expected failure but command succeeded"
            ((TESTS_FAILED++))
        fi
    else
        if [ $exit_code -eq 0 ]; then
            if echo "$output" | grep -q "$expected_output"; then
                echo -e "${GREEN}✓ PASS${NC} - Command succeeded with expected output"
                ((TESTS_PASSED++))
            else
                echo -e "${RED}✗ FAIL${NC} - Command succeeded but output doesn't match"
                echo "Expected to find: $expected_output"
                ((TESTS_FAILED++))
            fi
        else
            echo -e "${RED}✗ FAIL${NC} - Command failed unexpectedly"
            ((TESTS_FAILED++))
        fi
    fi

    echo ""
}

# Test 1: Check config file syntax
echo "=========================================="
echo "Test Suite: Config File Validation"
echo "=========================================="
echo ""

test_case \
    "Config file has valid syntax" \
    "node -c src/config/index.js" \
    "" \
    "false"

# Test 2: Check that config exports PORT
test_case \
    "Config exports PORT property" \
    "node -e \"const config = require('./src/config/index.js'); console.log('PORT:', config.PORT); process.exit(0);\"" \
    "PORT:" \
    "false"

# Test 3: Test production mode without PORT (should fail)
test_case \
    "Production mode without PORT should fail" \
    "NODE_ENV=production node -e \"try { require('./src/config/index.js'); } catch(e) { console.log(e.message); process.exit(1); }\"" \
    "PORT environment variable is required in production" \
    "true"

# Test 4: Test production mode with PORT (should succeed)
test_case \
    "Production mode with PORT should succeed" \
    "NODE_ENV=production PORT=8080 node -e \"const config = require('./src/config/index.js'); console.log('PORT:', config.PORT); process.exit(0);\"" \
    "PORT: 8080" \
    "false"

# Test 5: Test development mode without PORT (should use fallback)
test_case \
    "Development mode without PORT should use fallback 4005" \
    "NODE_ENV=development node -e \"const config = require('./src/config/index.js'); console.log('PORT:', config.PORT); process.exit(0);\"" \
    "PORT: 4005" \
    "false"

# Test 6: Test development mode with PORT (should use it)
test_case \
    "Development mode with PORT should use it" \
    "NODE_ENV=development PORT=3000 node -e \"const config = require('./src/config/index.js'); console.log('PORT:', config.PORT); process.exit(0);\"" \
    "PORT: 3000" \
    "false"

# Test 7: Check server.js syntax
echo "=========================================="
echo "Test Suite: Server File Validation"
echo "=========================================="
echo ""

test_case \
    "server.js has valid syntax" \
    "node -c server.js" \
    "" \
    "false"

# Test 8: Check index.js syntax
test_case \
    "src/index.js has valid syntax" \
    "node -c src/index.js" \
    "" \
    "false"

# Test 9: Verify Dockerfile doesn't have EXPOSE 4005
echo "=========================================="
echo "Test Suite: Dockerfile Validation"
echo "=========================================="
echo ""

if grep -q "EXPOSE 4005" Dockerfile; then
    echo -e "${RED}✗ FAIL${NC} - Dockerfile still contains 'EXPOSE 4005'"
    ((TESTS_FAILED++))
else
    echo -e "${GREEN}✓ PASS${NC} - Dockerfile does not contain 'EXPOSE 4005'"
    ((TESTS_PASSED++))
fi

echo ""

# Test 10: Verify Dockerfile doesn't have HEALTHCHECK directive (comments are OK)
if grep "^HEALTHCHECK" Dockerfile | grep -v "^#" > /dev/null 2>&1; then
    echo -e "${RED}✗ FAIL${NC} - Dockerfile still contains 'HEALTHCHECK' directive"
    ((TESTS_FAILED++))
else
    echo -e "${GREEN}✓ PASS${NC} - Dockerfile does not contain 'HEALTHCHECK' directive"
    ((TESTS_PASSED++))
fi

echo ""

# Final summary
echo "=========================================="
echo "Test Results Summary"
echo "=========================================="
echo ""
echo -e "Tests passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    echo ""
    echo "The PORT configuration fix is working correctly."
    echo "Ready to deploy to Railway."
    echo ""
    echo "Next step: Run ./DEPLOY_PORT_FIX.sh"
    exit 0
else
    echo -e "${RED}Some tests failed! ✗${NC}"
    echo ""
    echo "Please review the failures above before deploying."
    exit 1
fi
