# Test Plan — LLM Analysis Quiz

## 1. Overview

This test plan defines acceptance gates, test matrix, and data sets for validating the LLM Analysis Quiz system. It includes a bash script (`test-endpoint.sh`) to orchestrate curl-based tests against the deployed API endpoint.

## 2. Acceptance Gates

- **Unit Tests**: All core functions (parser, validator, time-governor) pass.
- **API Tests**: Endpoint returns correct HTTP codes and JSON responses.
- **Integration Tests**: Demo quiz solves correctly; chained quizzes handled.
- **Performance Tests**: Completes within 180s; cold start <12s.
- **Security Tests**: No secrets leaked; HTTPS enforced.
- **Go-Live**: 3 consecutive green runs on prod infra with ≥20s margin.

## 3. Test Matrix

| Test Type       | Description                          | Expected Outcome                  | Tools/Script |
|-----------------|--------------------------------------|-----------------------------------|--------------|
| Unit            | Secret validation, URL extraction    | Pass/fail assertions              | Jest/Mocha   |
| API Validation  | POST /solve with various payloads    | 200/400/403 responses            | curl script  |
| Integration     | Demo URL E2E, chained quiz simulation| Correct submission, chain follow  | curl script  |
| Performance     | Time budgets, parallel requests      | <180s total, no timeouts          | curl + time  |
| Edge Cases      | Malformed data, slow network         | Graceful failures, retries        | curl script  |
| Security        | Secret exposure, URL validation      | No leaks, valid URLs only         | Manual + logs|

## 4. Data Sets

- **Demo Payload**: `{"email": "test@example.com", "secret": "test-secret", "url": "https://tds-llm-analysis.s-anand.net/demo"}`
- **Invalid Secret**: Same payload with wrong secret → 403.
- **Malformed JSON**: `{"email": "test", "secret":}` → 400.
- **Chained Quiz**: Simulate response with next URL for chain testing.
- **Large Payload**: Payload >1MB → reject.
- **Timeout Test**: Slow endpoint simulation.

## 5. Bash Test Script

Create a bash script (`scripts/test-endpoint.sh`) that orchestrates curl commands to test the API endpoint. The script should:

- Accept endpoint URL, email, and secret as arguments.
- Test valid request (expect 200 response).
- Test invalid secret (expect 403).
- Test malformed JSON (expect 400).
- Test demo quiz solve (check for acceptance response).
- Measure performance (ensure <180s completion).
- Output PASS/FAIL for each test.

Run the script against the deployed endpoint to validate API behavior.

## 6. Manual Tests

- **Chained Quiz**: Manually send requests with next URLs from responses.
- **Parallel Load**: Run multiple instances: `for i in {1..3}; do ./test-endpoint.sh ... & done`
- **Logs Review**: Check server logs for structured output, redactions, and error codes.

## 7. Fixtures

- Sample HTML: `tests/fixtures/quiz-page.html` (with `#result` div).
- CSV/JSON/PDF: `tests/fixtures/sample-data/` for parser tests.