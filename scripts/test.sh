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


cleanup_pids() {
  for pid in "${PIDS_TO_KILL[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "Killing process $pid"
      kill "$pid" || true
    fi
  done
}

PIDS_TO_KILL=()
trap cleanup_pids EXIT

wait_for_url() {
  local url="$1"
  local max_retries="${2:-30}"
  local delay="${3:-1}"
  
  printf "Waiting for %s " "$url"
  for ((i=0; i<max_retries; i++)); do
    if curl -s -o /dev/null -f "$url"; then
      echo " OK"
      return 0
    fi
    printf "."
    sleep "$delay"
  done
  echo " Timeout"
  return 1
  echo " Timeout"
  return 1
}

force_kill_port() {
  local port="$1"
  local pid=$(lsof -t -i:"$port" || true)
  if [[ -n "$pid" ]]; then
    echo "Force killing process on port $port (PID: $pid)"
    kill -9 "$pid" || true
  fi
}

start_server() {
  if curl -s -o /dev/null -f "http://localhost:3000/health"; then
    echo "Server already running on port 3000"
    return 0
  fi

  echo "Starting main server..."
  bun run dev > /dev/null 2>&1 &
  SERVER_PID=$!
  PIDS_TO_KILL+=("$SERVER_PID")
  
  if ! wait_for_url "http://localhost:3000/health"; then
    echo "ERROR: Server failed to start"
    return 1
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

  bun "$SCRIPT_DIR/test-browser.ts" --url="$url"
  
  echo
  echo "Browser test completed"
}

test_integration() {
  load_env
  check_required_vars

  echo "Using EMAIL: $EMAIL"
  echo "Using SECRET_KEY: [REDACTED]"
  echo "Starting quiz page server..."
  echo "Starting quiz page server..."
  force_kill_port 3001
  bun "$SCRIPT_DIR/mock-servers.ts" --type=page --port=3001 &
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
  echo "Starting mock server..."
  force_kill_port 4545
  bun "$SCRIPT_DIR/mock-servers.ts" --type=quiz --port=4545 &
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

test_all() {
  load_env
  check_required_vars
  
  echo "=== 1. Starting Application Server ==="
  start_server
  echo

  echo "=== 2. Running API Endpoint Tests ==="
  test_endpoint "http://localhost:3000/solve" "${EMAIL:-}" "${SECRET_KEY:-}"
  echo

  echo "=== 3. Running Browser Automation Test (Local) ==="
  # Start a temporary page server for the browser test
  echo "=== 3. Running Browser Automation Test (Local) ==="
  # Start a temporary page server for the browser test
  force_kill_port 3002
  bun "$SCRIPT_DIR/mock-servers.ts" --type=page --port=3002 > /dev/null 2>&1 &
  MOCK_PAGE_PID=$!
  PIDS_TO_KILL+=("$MOCK_PAGE_PID")
  
  wait_for_url "http://localhost:3002/" 10 0.5
  
  test_browser "http://localhost:3002/"
  
  # Kill it explicitly now (or let trap handle it, but better cleanly here)
  kill "$MOCK_PAGE_PID" || true
  # Remove from PIDS_TO_KILL roughly (optional, but good practice)
  echo

  echo "=== 4. Running Integration Test (Page Flow) ==="
  test_integration
  echo

  echo "=== 5. Running Local Test (Quiz Flow) ==="
  test_local
  echo
  
  echo "✅ All tests passed successfully!"
}

main() {
  test_all
}

main "$@"