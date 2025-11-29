# 🧾 Technical Specification — LLM Analysis Quiz Project



## 1. Functional Requirements

### 2.1 Input Specification

**HTTP Method:** `POST`
**Content-Type:** `application/json`

**Request Payload:**

```json
{
  "email": "you@example.com",
  "secret": "your-secret",
  "url": "https://example.com/quiz-834"
}
```

### 2.2 Validation Rules

| Condition                     | Response                     | HTTP Code |
| ----------------------------- | ---------------------------- | --------- |
| Valid JSON and correct secret | `{ "status": "accepted" }`   | 200       |
| Invalid secret                | `{ "error": "Forbidden" }`   | 403       |
| Malformed or missing JSON     | `{ "error": "Bad Request" }` | 400       |

### 2.3 Processing Flow

1. Validate incoming request and credentials.
2. Launch headless browser session to render quiz page.
3. Extract base64-encoded question content from DOM.
4. Decode and parse human-readable quiz text.
5. Identify submission endpoint dynamically from question content.
6. Solve the problem using analysis tools and/or LLM.
7. Submit result to extracted endpoint.
8. Repeat for subsequent quiz URLs (chained tasks).
9. Enforce total runtime ≤ **180 seconds**.

---

## 2. System Architecture

### 3.1 High-Level Components

| Component             | Responsibility                                       |
| --------------------- | ---------------------------------------------------- |
| **API Server**        | Handles HTTP requests and response lifecycle         |
| **Task Orchestrator** | Controls timing, chaining, retries                   |
| **Browser Client**    | Executes JS-rendered pages and extracts DOM data     |
| **Parser Module**     | Decodes base64 and extracts structured question info |
| **Solver Engine**     | Executes analytical and LLM-based reasoning          |
| **Submission Client** | Sends formatted answers to quiz URLs                 |
| **Logger**            | Tracks events, errors, and timing data               |

### 3.2 Control Flow Diagram

```
[POST Request]
     ↓
[Validation]
     ↓
[Browser Client → Render Page]
     ↓
[Parser → Decode Base64 & Extract URL]
     ↓
[Solver Engine → Compute Answer]
     ↓
[Submission Client → POST Answer]
     ↓
[Response → (New URL?) → Loop]
     ↓
[End / Timeout (3 min cap)]
```

---

## 3. Technical Stack

| Layer            | Technology                           | Purpose                                   |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| Language         | **TypeScript (Node.js)**             | Type safety and async runtime             |
| Framework        | **Fastify**                          | Lightweight, high-performance HTTP server |
| Browser Engine   | **`sparticuz/chromium-min`**         | Headless Chrome for serverless execution  |
| LLM Interface    | **Gemini / OpenAI API**              | Text and data reasoning                   |
| Pipeline Manager | **`aipipe`**                         | Orchestrates modular task flow            |
| HTTP Client      | **fetch / axios**                    | Network requests and file downloads       |
| Logging          | **pino**                             | Structured, performant logging            |
| Data Handling    | **danfo.js / built-in Node modules** | Tabular and numeric analysis              |
| Visualization    | **chart.js / plotly.js**             | Chart generation and base64 encoding      |
| Deployment       | **Vercel / Railway / Docker VPS**    | Public HTTPS endpoint hosting             |

---

## 4. Data and Operations Handling

### 5.1 Supported Data Types

| Data Type | Library / Tool       | Example Operations                             |
| --------- | -------------------- | ---------------------------------------------- |
| CSV/Excel | danfo.js / papaparse | Aggregation, filtering                         |
| JSON      | native JSON / lodash | Key extraction, nesting                        |
| PDF       | pdf-parse / pdf.js   | Text extraction, table parsing                 |
| Image     | sharp / canvas       | Optional (if quiz requires image manipulation) |
| API Data  | fetch / axios        | Authenticated calls, pagination handling       |

### 5.2 Analytical Capabilities

- **Statistical:** mean, median, variance, correlation
- **Machine Learning:** basic regression or classification (if required)
- **Visualization:** bar, line, scatter, pie (output as base64-encoded PNG)
- **Scraping:** DOM extraction with JavaScript execution (AJAX-ready)

---

## 5. LLM Integration

### 6.1 Architecture

- Each quiz text is parsed and fed into an LLM prompt template.
- LLM determines problem type and computation method.
- Output is validated, formatted, and used as final answer.

### 6.2 Prompt Configuration

| Prompt Type       | Description                           | Length Limit |
| ----------------- | ------------------------------------- | ------------ |
| **System Prompt** | Defines model role and hides a secret | ≤ 100 chars  |
| **User Prompt**   | Attempts to extract the hidden secret | ≤ 100 chars  |

### 6.3 API Handling

- All LLM requests must include:

  - API key from environment variable
  - Timeout ≤ 5 seconds per request
  - Automatic retries with backoff (up to 2 attempts)

---

## 6. Quiz Chaining & Time Management

### 7.1 Chaining Rules

1. After answer submission, response may contain a new quiz URL.
2. Continue solving recursively until no new URL is returned.
3. If incorrect but response provides next URL, proceed.
4. Stop when total time ≥ **180 seconds**.

### 7.2 Time Management

- Record start time at first request.
- All components check elapsed time before execution.
- No operation begins if remaining time < 5 seconds.
- Graceful termination with `{ "status": "timeout" }` if limit exceeded.

---

## 7. Error Handling and Recovery

| Error Type                | Mitigation                                      |
| ------------------------- | ----------------------------------------------- |
| **Invalid Secret / JSON** | Return HTTP 400 or 403 immediately              |
| **Browser Crash**         | Restart browser session once; abort if repeated |
| **Page Timeout**          | Failover after 10 seconds per page load         |
| **LLM Timeout**           | Retry once, then fallback to rule-based solver  |
| **Submission Failure**    | Retry up to 2 times within time budget          |
| **Unexpected Response**   | Log error, mark quiz skipped                    |
| **Memory Leaks**          | Ensure browser closure per quiz session         |

---

## 8. Logging and Monitoring

**Required Logs:**

- Request metadata (email, URL, timestamp)
- Quiz sequence index
- Time elapsed at each stage
- Browser load time
- LLM response time
- Submission status (success/fail)
- Error details and stack traces

**Format:** JSON logs (structured for machine parsing)
**Retention:** 7 days (rotating log files)

---

## 9. Testing Strategy

### 10.1 Unit Tests

- Secret validation logic
- Base64 decoding utilities
- Time calculation and limit enforcement
- LLM response format checks

### 10.2 Integration Tests

- End-to-end quiz solving with demo URL
- Multi-quiz chain traversal
- Browser interaction and extraction
- Submission and validation sequence

### 10.3 Stress Tests

- Concurrent requests (3–5 parallel)
- Slow network simulation
- High-latency LLM response simulation

---

## 10. Deployment Requirements

| Requirement               | Description                                  |
| ------------------------- | -------------------------------------------- |
| **Hosting**               | Must support headless Chromium runtime       |
| **Runtime Memory**        | ≥ 512 MB                                     |
| **Storage**               | Temporary storage for downloaded files       |
| **Environment Variables** | `SECRET_KEY`, `LLM_API_KEY`, `BROWSER_PATH`  |
| **Logging Access**        | Required for debugging and viva presentation |

Recommended Deployment Targets:

- **Vercel (Edge + Chromium)** for lightweight workloads
- **Railway / Render** for heavier data processing
- **Dockerized VPS** for full control and browser binary access

---

## 11. Evaluation Criteria

| Metric               | Weight | Description                           |
| -------------------- | ------ | ------------------------------------- |
| **Accuracy**         | 30%    | Correctly solves quiz chain           |
| **Performance**      | 25%    | Completes within 3-minute limit       |
| **Prompt Design**    | 15%    | Effective and compliant prompts       |
| **Code Quality**     | 15%    | Clean, modular, well-documented       |
| **Viva Explanation** | 15%    | Understanding of design and execution |

---

## 12. Security and Compliance

- No secrets or API keys committed to Git.
- All credentials stored in environment variables.
- HTTPS-only communication enforced.
- Quiz URLs must be validated before navigation.
- User data (email, secret) never logged in plaintext.

---

## 13. Documentation Deliverables

| Document              | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| **README.md**         | Overview, setup, and running guide                     |
| **technical-spec.md** | This document — defines behavior and requirements      |
| **project-overview.md**  | Conceptual overview for quick understanding            |
| **LICENSE (MIT)**     | Open-source compliance                                 |
| **/src/**             | Implementation code with comments and type annotations |

---

## 14. Summary

**Core Workflow:**
`POST → Validate → Render Page → Extract Question → Solve → Submit → Chain → Exit`

**Time Constraint:**
Total 3 minutes from initial request to final submission.

**Core Dependencies:**
`Fastify`, `TypeScript`, `sparticuz/chromium-min`, `Gemini`, `aipipe`, `danfo.js`, `chart.js`.

**Primary Goal:**
Deliver a fully automated, intelligent quiz solver capable of data-driven reasoning under real-time constraints.
