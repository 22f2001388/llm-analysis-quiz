# LLM Analysis Quiz — Project Structure & File Responsibilities

> Single, stable structure for all phases. Add code over time; do not move files or invent new layers without sign-off.

## 1) Repository Tree (stable)

```
.
├── docs
│   ├── low-level-plan.md
│   ├── project-llm-analysis-quiz.md
│   ├── project-structure.md
│   ├── reuse.md
│   ├── senior-level-plan.md
│   ├── technical-spec.md
│   └── understanding.md
├─ src/
│  ├─ app/
│  │  ├─ server.ts
│  │  ├─ routes.ts
│  │  └─ middleware/
│  │     ├─ request-id.ts
│  │     └─ error-handler.ts
│  ├─ config/
│  │  ├─ env.ts
│  │  └─ constants.ts
│  ├─ core/
│  │  ├─ orchestrator/
│  │  │  ├─ chain-controller.ts
│  │  │  └─ time-governor.ts
│  │  ├─ browser/
│  │  │  ├─ client.ts
│  │  │  └─ page-extractor.ts
│  │  ├─ parsing/
│  │  │  ├─ quiz-parser.ts
│  │  │  └─ url-extractor.ts
│  │  ├─ data/
│  │  │  ├─ fetcher.ts
│  │  │  ├─ csv.ts
│  │  │  ├─ json.ts
│  │  │  ├─ pdf.ts
│  │  │  └─ normalize.ts
│  │  ├─ solve/
│  │  │  ├─ deterministic.ts
│  │  │  ├─ llm-advisor.ts
│  │  │  └─ validator.ts
│  │  ├─ submit/
│  │  │  ├─ payload.ts
│  │  │  └─ client.ts
│  │  └─ viz/
│  │     └─ chart.ts
│  ├─ adapters/
│  │  ├─ http/axios.ts
│  │  ├─ llm/gemini.ts
│  │  └─ telemetry/logger.ts
│  ├─ types/
│  │  ├─ api.ts
│  │  ├─ quiz.ts
│  │  ├─ data.ts
│  │  ├─ errors.ts
│  │  └─ telemetry.ts
│  └─ utils/
│     ├─ base64.ts
│     ├─ retry.ts
│     ├─ time.ts
│     └─ hash.ts
│     └─ logger.ts
├── docs
│   ├── low-level-plan.md
│   ├── project-llm-analysis-quiz.md
│   ├── project-structure.md
│   ├── reuse.md
│   ├── senior-level-plan.md
│   ├── technical-spec.md
│   └── understanding.md
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ fixtures/
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ .nvmrc
├─ .gitignore
├─ LICENSE
└─ README.md
```

---

## 2) File-Level Responsibilities (what each file must contain)

### docs/

- **project-overview.md** — Friendly overview; how the system works (for new devs).
- **technical-spec.md** — Formal spec (I/O, flows, budgets, errors).
- **project-structure.md** — This document; canonical layout + file intents.
- **prompts.md** — Final system/user prompts with exact char counts and rationale.
- **test-plan.md** — Test matrix, data sets, and acceptance gates.
- **security.md** — HTTPS, secrets handling, URL validation rules, logging redaction policy.
- **runbook.md** — On-call cheatsheet: common failures, log signatures, restart steps.

### src/app/

- **server.ts**

  - Fastify bootstrap, plugin registration, health route, graceful shutdown.
  - Loads env/config; wires global middleware; mounts `routes.ts`.

- **routes.ts**

  - Declares `POST /solve` handler.
  - Input schema binding (no business logic).
  - Maps request → `core.orchestrator.chain-controller`.

- **middleware/request-id.ts**

  - Generates/propagates `x-request-id`; attaches to logger context.

- **middleware/error-handler.ts**

  - Normalizes thrown domain errors → HTTP responses (400/403/500).
  - Ensures never leaking secrets/URLs in bodies.

### src/config/

- **env.ts**

  - Reads and validates environment variables (SECRET_KEY, LLM_API_KEY, NODE_ENV, optional BROWSER_PATH).
  - Provides typed config object used everywhere.

- **constants.ts**

  - Time budgets (global 180s, per-step soft budgets), retry caps, payload size limit, user-agent string, default timeouts.

### src/core/orchestrator/

- **chain-controller.ts**

  - Orchestrates the loop: render → parse → solve → submit → next.
  - Maintains chain state (quizIndex, urls[], timings, lastResult).
  - Single entrypoint used by route handler.

- **time-governor.ts**

  - Global start time capture and remaining-time checks.
  - “Do-not-start-if-remaining < threshold” rules.

### src/core/browser/

- **client.ts**

  - Chromium-min + puppeteer-core launch options, single tab lifecycle.
  - Abstractions: `open()`, `close()`, `goto(url, timeout)`.

- **page-extractor.ts**

  - Waits for `#result` (selector + non-empty).
  - Returns decoded question text (text content), plus HTML snapshot and meta for diagnostics.

### src/core/parsing/

- **quiz-parser.ts**

  - Transforms decoded text into normalized `QuizTask`:

    - `taskText`, `submitUrl`, `resources[]`, `answerTypeHint?`.

- **url-extractor.ts**

  - Robust submission URL detection across prose/code blocks, punctuation, variants.
  - URL sanitation and scheme validation (https preferred).

### src/core/data/

- **fetcher.ts**

  - HTTP download with content-type sniffing, size/time guards, caching per chain.

- **csv.ts**

  - CSV/TSV parsing → tabular structure with inferred types.

- **json.ts**

  - Safe JSON parse, path picking, shape validation utilities.

- **pdf.ts**

  - PDF text extraction (and simple tables best-effort), page targeting.

- **normalize.ts**

  - Common in-memory table abstraction (headers, rows, types), numeric coercion, column matching (case/trim/aliases).

### src/core/solve/

- **deterministic.ts**

  - Primitive operations: sum/avg/min/max, filter, select, simple group-by.
  - Column resolution and numeric normalization policies.

- **llm-advisor.ts**

  - When invoked: produce an operation plan (intent, fields, operation, answer type).
  - Enforce time budget (timeout) and one retry; validate feasibility against data.

- **validator.ts**

  - Ensures final answer matches expected type/shape and payload size (<1 MB).
  - Sanity checks (NaN, infinite, empty).

### src/core/submit/

- **payload.ts**

  - Assembles canonical submission JSON (email, secret, url, answer).
  - Attaches minimal provenance fields if needed (non-sensitive).

- **client.ts**

  - Sends POST to submitUrl; parses response:

    - `correct: boolean`, optional `url` (next quiz), optional `reason`.

### src/core/viz/

- **chart.ts**

  - Optional: render bar/line/scatter from normalized table; export PNG as base64.
  - Enforce output size budget and fallback text summary if oversized.

### src/adapters/

- **http/axios.ts**

  - Preconfigured HTTP client (timeouts, redirects policy, user-agent).

- **llm/gemini.ts**

  - Thin wrapper for LLM calls (model name, timeout, retries, error mapping).

- **telemetry/logger.ts**

  - Pino setup with request-scoped metadata, redactions, serializers.

### src/types/

- **api.ts**

  - Request/response DTOs for `/solve` (typed shape; status enums).

- **quiz.ts**

  - `QuizTask`, `QuizState`, `QuizResult` types; chain progress shape.

- **data.ts**

  - Normalized table type, cell types, dataset descriptors.

- **errors.ts**

  - Domain error catalogue and identifiers:
    `INPUT_400`, `AUTH_403`, `RENDER_TIMEOUT`, `PARSER_NO_URL`, `FETCH_FAIL`, `FORMAT_INVALID`, `SUBMIT_FAIL`, `LLM_TIMEOUT`, `TIME_BUDGET_EXCEEDED`.

- **telemetry.ts**

  - Log event shapes: step name, elapsedMs, quizIndex, urlHash, sizes, counters.

### src/utils/

- **base64.ts**

  - Data-URI helpers, encode/decode, mime validators.

- **retry.ts**

  - Time-aware retry wrapper (consults time-governor before re-attempt).

- **time.ts**

  - Monotonic clock helpers, elapsed/remaining calculations.

- **hash.ts**

  - Non-reversible hash for URL/email logging (fixed salt from env).

### tests/

- **unit/** — Pure functions (parser, url, normalize, validator, time-governor).
- **integration/** — E2E `POST /solve` with local/demo targets; chained quizzes; timeout path.
- **fixtures/** — Static HTML snippets, CSV/JSON/PDF samples, decoded text cases.

---

## 3) Phase-to-File Mapping (who edits what, when)

| Phase (from development plan) | Primary Files Touched                                                                                     | Notes                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 0 Repo & Env                | `README.md`, `.env.example`, `tsconfig.json`, `.nvmrc`, `docs/*`                                          | No runtime behavior.                   |
| 14 Test Plan                 | `docs/test-plan.md`, `scripts/test-endpoint.sh`                                                           | Curl-based API testing.                |
| 1 API Shell & Auth          | `src/app/server.ts`, `src/app/routes.ts`, `src/app/middleware/*`, `src/config/env.ts`, `src/types/api.ts` | Only request validation + 200/400/403. |
| 2 Browser Subsystem         | `src/core/browser/client.ts`, `page-extractor.ts`, `src/config/constants.ts`                              | Launch flags, timeouts, cleanup.       |
| 3 Quiz Extraction           | `page-extractor.ts`, `src/types/quiz.ts`, `src/adapters/telemetry/logger.ts`                              | Return decoded text + diagnostics.     |
| 4 Question Parser           | `quiz-parser.ts`, `url-extractor.ts`                                                                      | Build `QuizTask`.                      |
| 5 Fetch & Readers           | `data/fetcher.ts`, `csv.ts`, `json.ts`, `pdf.ts`, `normalize.ts`                                          | Add size/time guards.                  |
| 6 Deterministic Solver      | `solve/deterministic.ts`, `solve/validator.ts`, `types/data.ts`                                           | Core arithmetic/filter ops.            |
| 7 LLM Advisor               | `adapters/llm/gemini.ts`, `solve/llm-advisor.ts`                                                          | Timeout + 1 retry; guardrails.         |
| 8 Submit & Chain            | `submit/payload.ts`, `submit/client.ts`, `orchestrator/chain-controller.ts`                               | Response parsing + next URL.           |
| 9 Time Governor             | `orchestrator/time-governor.ts`, `config/constants.ts`                                                    | Do-not-start thresholds.               |
| 10 Observability            | `adapters/telemetry/logger.ts`, `types/telemetry.ts`, `types/errors.ts`                                   | Structured logs + taxonomy.            |
| 11 Charts (optional)        | `core/viz/chart.ts`                                                                                       | Only when requested by quiz.           |
| 12 Security                 | `docs/security.md`, `middleware/error-handler.ts`, `utils/hash.ts`                                        | Redactions + URL validation.           |
| 13 Deploy                   | `README.md`, `.env.example`, `docs/runbook.md`                                                            | Cold/warm start notes.                 |
| 14 Prompts                  | `docs/prompts.md`                                                                                         | 100-char limits, rationale.            |
| 15 Tests & Rehearsal        | `tests/**`, `docs/test-plan.md`                                                                           | E2E and failure drills.                |
| 16 Submission               | `README.md`, `docs/runbook.md`                                                                            | Freeze versions, form links.           |

---

## 4) Design Rules (do not break these)

- **Single entrypoint:** Only `chain-controller.ts` is called from the route handler.
- **No cross-layer imports sideways:**

  - `core/*` may use `adapters/*`, `utils/*`, `types/*`.
  - `adapters/*` must not import from `core/*`.

- **Error discipline:** Only throw domain errors declared in `types/errors.ts`.
- **Logging discipline:** Only log via `adapters/telemetry/logger.ts` (structured JSON).
- **Time awareness:** Any retriable function must consult `time-governor.ts`.
- **URL hygiene:** All outgoing submit URLs must be validated in `url-extractor.ts`.

---

## 5) What each file must _contain_ (content checklist)

- **Every `core/*` module**

  - Clear, single responsibility summary (top docblock).
  - Input/output interface names from `src/types/*`.
  - Explicit timeouts (pull from `constants.ts`), no magic numbers.
  - On error: throw domain error ID from `types/errors.ts`.

- **`adapters/*`**

  - External boundary code only (HTTP/LLM/logger).
  - Default timeouts + retry policy; map low-level exceptions → domain errors.

- **`types/*`**

  - DTOs, enums, and shapes that are stable across phases.
  - No business logic. No imports from `core/*`.

- **`utils/*`**

  - Pure helpers; no network or filesystem effects.

- **`tests/*`**

  - Unit tests: one spec per file in `core/parsing`, `core/solve`, `utils`.
  - Integration: “POST /solve” golden paths + representative failures.
  - Fixtures: small, deterministic sample files.

---

## 6) Extensibility Without Restructuring

- **New data format?** Add a file under `src/core/data/` and register in `normalize.ts`.
- **New operation?** Add to `solve/deterministic.ts`; extend `solve/validator.ts` if output type changes.
- **New visualization?** Extend `core/viz/chart.ts`; keep size checks centralized.
- **Alternative LLM?** Add `adapters/llm/<provider>.ts`; switch via `env.ts` + small shim in `llm-advisor.ts`.
- **Additional telemetry sink?** Extend `adapters/telemetry/logger.ts`; configuration-gated.

---

## 7) Required Environment Keys (documented in `.env.example`)

- `SECRET_KEY` — Constant used to validate incoming POSTs.
- `LLM_API_KEY` — Key for Gemini (or alternative).
- `NODE_ENV` — `development`/`production`.
- `BROWSER_PATH` — Optional override for Chromium binary.
- (Optional) `LOG_REDACT_EMAIL` — Toggle email redaction in logs.

---

## 8) Standard Log Fields (every step)

- `requestId`, `quizIndex`, `step`, `elapsedMs`, `remainingMs`, `urlHash`,
- `op` (e.g., `render`, `parse`, `fetch`, `solve.det`, `solve.llm`, `submit`),
- `sizes` (downloadedBytes, payloadBytes), `retries`, `result` (succ/fail/errorId).

---

## 9) Acceptance Snapshot (structure-level)

- All files exist as listed.
- No business logic leaking into `routes.ts`.
- All steps throw/use domain errors from `types/errors.ts`.
- Time and retry policies centralized (`time-governor.ts`, `utils/retry.ts`).
- Logs are structured and redact secrets/PII.
- Tests directory mirrors core responsibilities.
