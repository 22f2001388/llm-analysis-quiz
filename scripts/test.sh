#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

load_env() {
  if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
  fi
}

check_required_vars() {
  local missing=()
  [[ -z "${SECRET_KEY:-}" ]] && missing+=("SECRET_KEY")
  [[ -z "${EMAIL:-}" ]] && missing+=("EMAIL")
  
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "ERROR: Missing required environment variables: ${missing[*]}"
    echo "Please set them in $PROJECT_ROOT/.env file"
    exit 1
  fi
}

test_endpoint() {
  load_env
  local endpoint_url="${1:-http://localhost:3000/solve}"
  local test_email="${2:-${EMAIL:-test@example.com}}"
  local test_secret="${3:-$SECRET_KEY}"

  echo "Testing LLM Analysis Quiz API endpoint"
  echo "Endpoint: $endpoint_url"
  echo "Email: $test_email"
  echo "Secret: [REDACTED]"
  echo

  echo "Test 1: Health check"
  local base_url="${endpoint_url%/solve}"
  if curl -s -f "$base_url/health" -X GET > /dev/null 2>&1; then
    echo "PASS: Health endpoint available"
  else
    echo "INFO: Health endpoint not available or different route"
  fi
  echo

  echo "Test 2: Invalid request (missing required fields)"
  RESPONSE=$(curl -s -X POST "$endpoint_url" \
    -H 'Content-Type: application/json' \
    -d '{}' 2>/dev/null || echo '{"error": "connection_failed"}')

  if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
    ERROR_FIELD=$(echo "$RESPONSE" | jq -r '.error // empty')
    if [[ -n "$ERROR_FIELD" ]]; then
      echo "PASS: Proper error response: $ERROR_FIELD"
    else
      echo "WARN: Unexpected response format"
      echo "Response: $RESPONSE"
    fi
  else
    echo "FAIL: Invalid JSON response: $RESPONSE"
  fi
  echo

  echo "Test 3: Authentication failure (wrong secret)"
  RESPONSE=$(curl -s -X POST "$endpoint_url" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$test_email\",\"secret\":\"wrong-secret\",\"url\":\"http://example.com\"}" 2>/dev/null || echo '{"error": "connection_failed"}')

  if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
    ERROR_FIELD=$(echo "$RESPONSE" | jq -r '.error // empty')
    if [[ "$ERROR_FIELD" == "Invalid email address" || "$ERROR_FIELD" == "Invalid secret key" ]]; then
      echo "PASS: Correct authentication error: $ERROR_FIELD"
    else
      echo "WARN: Unexpected error response: $ERROR_FIELD"
      echo "Response: $RESPONSE"
    fi
  else
    echo "FAIL: Invalid JSON response: $RESPONSE"
  fi
  echo

  echo "Test 4: Valid request format check"
  RESPONSE=$(curl -s -X POST "$endpoint_url" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$test_email\",\"secret\":\"$test_secret\",\"url\":\"http://example.com\"}" 2>/dev/null || echo '{"error": "connection_failed"}')

  if echo "$RESPONSE" | jq . >/dev/null 2>&1; then
    ERROR_CODE=$(echo "$RESPONSE" | jq -r '.code // empty')
    if [[ -n "$ERROR_CODE" ]]; then
      echo "PASS: Request validation working, got error: $ERROR_CODE"
    else
      echo "INFO: Request processed (may be working or different error)"
    fi
  else
    echo "FAIL: Invalid JSON response: $RESPONSE"
  fi
  echo

  echo "API endpoint testing complete"
}

test_browser() {
  load_env
  local url="${1:-https://example.com}"
  
  echo "Running Browser Functionality Test"
  echo "URL: $url"
  echo "Timestamp: $(date)"
  echo

  if [[ -z "${SECRET_KEY:-}" ]]; then
    echo "WARNING: SECRET_KEY not set in .env file"
  fi

  if [[ -z "${EMAIL:-}" ]]; then
    echo "WARNING: EMAIL not set in .env file"
  fi

  if [[ -z "${LLM_API_KEY:-}" ]]; then
    echo "WARNING: LLM_API_KEY not set (LLM features will be unavailable)"
  fi

  echo

  bun "$SCRIPT_DIR/test-browser.ts" "$url"
  
  echo
  echo "Browser test completed"
}

test_integration() {
  load_env
  check_required_vars

  echo "Using EMAIL: $EMAIL"
  echo "Using SECRET_KEY: [REDACTED]"
  echo "Starting quiz page server..."
  bun "$SCRIPT_DIR/mock-servers.ts" page 3001 &
  QUIZ_SERVER_PID=$!

  sleep 3

  if ! kill -0 $QUIZ_SERVER_PID 2>/dev/null; then
    echo "ERROR: Quiz server failed to start"
    exit 1
  fi

  echo "Sending solve request to main server..."
  RESPONSE=$(curl -s -X POST http://localhost:3000/solve \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"secret\":\"$SECRET_KEY\",\"url\":\"http://localhost:3001/\"}" \
    | jq . 2>/dev/null || echo "Failed to parse response")

  echo "Response from main server:"
  echo "$RESPONSE"

  kill $QUIZ_SERVER_PID 2>/dev/null || true
  wait $QUIZ_SERVER_PID 2>/dev/null || true

  echo "Test completed."
}

test_local() {
  load_env
  
  if [[ -z "${SECRET_KEY:-}" ]]; then
    echo "ERROR: SECRET_KEY environment variable not set (check .env file)"
    exit 1
  fi

  echo "Starting mock server..."
  bun "$SCRIPT_DIR/mock-servers.ts" quiz 4545 &
  SERVER_PID=$!
  sleep 5

  echo "Triggering local /solve request..."
  curl -s -X POST http://127.0.0.1:3000/solve \
    -H 'Content-Type: application/json' \
    -d '{"email":"demo@example.com","secret":"'$SECRET_KEY'","url":"http://localhost:4545/"}' \
    | jq .

  kill $SERVER_PID || true
  echo "Local test complete."
}

show_help() {
  cat << 'EOF'
Unified Test CLI for LLM Analysis Quiz

Usage: ./test.sh <command> [options]

Commands:
  endpoint [url] [email] [secret]  Test API endpoint with various scenarios
  browser [url]                   Test browser functionality
  integration                      Full integration test with quiz server
  local                           Quick local test with mock server
  help                            Show this help message

Examples:
  ./test.sh endpoint                     Test with default values
  ./test.sh endpoint http://localhost:3000/solve test@example.com mysecret
  ./test.sh browser https://example.com
  ./test.sh integration
  ./test.sh local

Environment Variables (from .env):
  EMAIL           Required for integration/local tests
  SECRET_KEY      Required for all tests
  LLM_API_KEY    Optional for LLM features

EOF
}

main() {
  local command="${1:-help}"
  
  case "$command" in
    endpoint)
      test_endpoint "${2:-}" "${3:-}" "${4:-}"
      ;;
    browser)
      test_browser "${2:-}"
      ;;
    integration)
      test_integration
      ;;
    local)
      test_local
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      echo "Error: Unknown command '$command'"
      echo "Run '$0 help' for usage information"
      exit 1
      ;;
  esac
}

main "$@"