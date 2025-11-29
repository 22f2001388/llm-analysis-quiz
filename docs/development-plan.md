# LLM Analysis Quiz — Low-Level Development Plan (Phased, No Code)

**Global constraints**

- 3-minute hard cap per full quiz chain (from first POST).
- HTTPS public endpoint.
- Payloads < 1 MB.
- Evaluation window: Sat, 29 Nov 2025, 3:00–4:00 PM IST.

**Locked stack**

- **Node.js + TypeScript**, **Fastify**, **puppeteer-core** + **sparticuz/chromium-min**, **Gemini** (LLM), **aipipe** (orchestrator), **danfo.js/papaparse/xlsx** (data), **pdf-parse** (PDF), **chart.js** (only if needed), **pino** (logs).

---

## Phase 0 — Repo & Environment Baseline

**Goal:** Clean, Bun-powered repo with repeatable local and CI runs; secrets isolated and Node v25 LTS enforced.

**Inputs:** Locked stack (Node 25 LTS + Bun), MIT license requirement.

**Tasks (do all)**

- Initialize repo with MIT **LICENSE**, **README**, **.gitignore**, `.editorconfig`, `tsconfig.json`, and Bun lockfile.
- Create **.env.example** with `SECRET_KEY`, `LLM_API_KEY`, `NODE_ENV`.
- Add Bun scripts for: `bun build`, `bun dev`, `bun start`, `bun test`, `bun lint`, `bun typecheck`.
- Add minimal **/docs/** with `understanding.md` and `technical-spec.md`.
- Define Node engine constraint (`"engines": { "node": "^25.0.0" }`) and verify Bun uses it in CI.

**Artifacts**

- Clean repo; `.env.example`; `docs/` folder; Bun lockfile.

**Acceptance**

- `bun build` and `bun dev` succeed locally.
- Repo lints/types clean; no secrets committed.
- CI runs on Node 25 LTS image.

**Pitfalls**

- Forgetting Bun’s `bun.lockb` commit → non-reproducible installs.
- Mixing npm/yarn scripts with Bun.
- Not enforcing Node 25 → drift between local and deploy.

---

## Phase 1 — API Shell & Auth

**Goal:** POST endpoint exists, validates JSON and secret, returns correct status codes.
**Runtime note:** Bun as package runner; Node 25; Fastify + TypeScript (ESM).

**Inputs:** Google Form contract (email, secret, url).

**Tasks**

- Stand up Fastify server (Bun runtime) with POST `/solve`. Keep ESM/TS config explicit (tsconfig module/target, `type: "module"` if used).
- Parse JSON body safely; validate required fields against a schema (typebox/zod with Fastify) with:

  - `email` format check,
  - `secret` non-empty string,
  - `url` string with basic `https?://` pattern,
  - `additionalProperties: false`.

- Compare `secret` to env `SECRET_KEY` using **timing-safe** comparison (`crypto.timingSafeEqual` with fixed-length buffers).
- Return only:

  - **200** on valid,
  - **403** on bad secret,
  - **400** on malformed/invalid JSON (schema failures included).

- Add structured logging with **pino**:

  - Attach a per-request **requestId** (plugin or hook).
  - Redact sensitive fields (`body.secret`, `headers.authorization`).
  - Set dev vs prod log levels.

- Boot-time env checks: verify `SECRET_KEY` (and other critical vars) are present; fail fast with clear error.
- CORS policy: default **off** (server-to-server). If enabling, restrict to known origin and only `POST`.
- Provide Bun scripts: `bun dev`, `bun start`, `bun test`, `bun lint`, `bun typecheck`.

**Artifacts**

- Running local endpoint; request/response samples.
- Logging/redaction config noted in docs (brief).

**Acceptance**

- Manual tests: valid → 200; invalid secret → 403; bad JSON → 400.
- Logs include request id and minimal metadata.

**Pitfalls**

- Logging full payloads or secrets (don’t).
- Naive string compare for secret (timing leak).
- Missing `SECRET_KEY` until first request (do a boot-time check).
- Mixing npm-style assumptions with Bun scripts.

---

## Phase 2 — Browser Subsystem (Chromium-min)

**Goal:** Headless browser launches in target env and renders JS.

**Inputs:** `sparticuz/chromium-min`, `puppeteer-core`.

**Tasks**

- Wire launch options compatible with serverless/VPS (args, executable path).
- Implement **single-tab** open/close routine per quiz.
- Page navigation with timeout; wait for network idle or target selector.
- Ensure clean teardown (close page + browser) on success/failure.
- Verify runs locally and in deployment sandbox.

**Artifacts**

- Browser config doc (launch flags, memory notes).
- Log timing for boot and first navigation.

**Acceptance**

- Can open a known JS site and read rendered DOM text.
- Boot time logged; no orphaned processes.

**Pitfalls**

- Missing system deps on host → test on target infra early.
- Not closing browser on exceptions → memory leaks.

---

## Phase 3 — Quiz Page Extraction

**Goal:** Given a quiz URL, reliably extract **decoded question text** and raw HTML.

**Inputs:** Spec says content appears in `#result` after JS `atob`.

**Tasks**

- Navigate to quiz URL.
- Wait for `#result` to exist and not be empty.
- Read **final inner text** (already decoded by JS).
- Also capture page URL, title, and outerHTML (for debugging attachment).
- Record timings; include selector wait ms in logs.

**Artifacts**

- Extraction function contract: inputs (url), outputs (text, html, meta).
- Error messages for missing selector/timeout.

**Acceptance**

- Works against demo endpoint; produces non-empty decoded text.
- Fails fast (clear error) if selector never appears.

**Pitfalls**

- Reading `innerHTML` with tags; prefer text unless spec needs HTML.
- Waiting forever (no hard timeout).

---

## Phase 4 — Question Parser

**Goal:** From decoded text, extract: **task description**, **submission URL**, **referenced resources**.

**Inputs:** Decoded text blob.

**Tasks**

- Parse submission URL robustly (handle code blocks, punctuation, http/https).
- Extract explicit instructions (e.g., “sum of column X on page 2”).
- Identify referenced files/links (PDF/CSV/JSON), collect absolute URLs.
- Validate submission URL scheme and structure.
- Normalize output to a structured object (task, submitUrl, resources, answer type hint if present).

**Artifacts**

- URL extraction patterns documented.
- Parser error taxonomy (NO_SUBMIT_URL, NO_TASK).

**Acceptance**

- Works on demo text variants (URL in prose vs code block).
- Rejects invalid submit URLs (no hardcoding).

**Pitfalls**

- Anchoring regex too narrowly.
- Accepting non-https (reject unless spec says otherwise).

---

## Phase 5 — File Fetch & Data Readers

**Goal:** Fetch referenced files safely; support **CSV/TSV**, **JSON**, **PDF (text/tables)**.

**Inputs:** Resource URLs from parser.

**Tasks**

- Implement HTTP fetch with content-type sniffing, size check (<1 MB guidance).
- CSV/TSV: use papaparse or danfo.js to produce rows/columns structure.
- JSON: parse and validate shape.
- PDF: extract text (pdf-parse) and basic tables (best-effort); support page selection if the instruction names a page.
- Normalize outputs: **DataFrame-like** for tables, **string** for text, **object** for JSON.
- Cache per-quiz to avoid re-downloads.

**Artifacts**

- Data format contracts documented.
- Size/time guardrails (e.g., skip if >1 MB or >8s download).

**Acceptance**

- Downloads and parses sample CSV/JSON/PDF quickly.
- Handles missing or wrong content-type with clear errors.

**Pitfalls**

- Failing to enforce size/time limits.
- PDF tables are messy—fall back to text if needed.

---

## Phase 6 — Deterministic Solver Primitives

**Goal:** Cover common tasks without LLM: **sum/avg/min/max**, **filter/select**, **simple group-by**, **column find**.

**Inputs:** Parsed instruction, normalized data.

**Tasks**

- Implement operation selector from instruction cues (e.g., “sum of ‘value’ column”).
- Column name resolution: case-insensitive, trim, alias detection (e.g., “Value” vs “value”).
- Numeric coercion and NaN handling rules.
- For PDFs: if table unreliable, allow numeric scraping from specified page context.
- Validate output matches expected answer type (number/string/bool/object/base64 image).

**Artifacts**

- Operation decision table (keywords → operation).
- Result validator (type + range/checksum if available).

**Acceptance**

- Solves demo-style sums/filters from CSV and PDF text.
- Produces single value or small JSON under 1 MB.

**Pitfalls**

- Locale issues in numbers (commas); normalize.
- Off-by-one page assumptions—respect “page 2” exactly.

---

## Phase 7 — LLM Integration (Targeted, Bounded)

**Goal:** Use LLM **only** when deterministic path is unclear; 5s timeout, 1 retry.

**Inputs:** Question text, sample data snippets/headers, what’s already parsed.

**Tasks**

- Define prompt template for: clarify task intent, identify required fields/ops, produce compact plan & expected answer type.
- Never send full large files; include headers, samples, stats.
- Validate LLM suggestion against available data; if mismatch, reject and fall back.
- Enforce 5s request timeout; single retry with shorter context.
- Record every LLM call (purpose, elapsed, tokens if exposed).

**Artifacts**

- LLM usage policy (when to call, what to send, timeout numbers).
- Response schema (operation + parameters + answer type).

**Acceptance**

- Ambiguous demo variants resolved within time budget.
- No dependence on LLM for straightforward arithmetic.

**Pitfalls**

- Letting LLM invent columns—guard and verify.
- Blowing time budget on retries.

---

## Phase 8 — Answer Submission & Chain Controller

**Goal:** Submit answer to **dynamic submit URL**, follow chain until done or time up.

**Inputs:** submitUrl, answer, email, secret, current quiz url.

**Tasks**

- Build JSON payload with fields required by spec (email, secret, url, answer).
- POST; parse response: `correct` flag, optional next `url`, optional `reason`.
- If incorrect but next URL provided, decide: **proceed** vs **retry** based on time left (see Phase 9 rules).
- Keep a per-chain state: current index, timestamps, last result.

**Artifacts**

- Submission/response schema doc.
- Chain state shape (for logs and debugging).

**Acceptance**

- Works with demo: submit, receive next URL, continue, stop on end.
- Handles incorrect answer path cleanly.

**Pitfalls**

- Hardcoding any submit endpoints (don’t).
- Ignoring `reason` field (log it for diagnostics).

---

## Phase 9 — Time Governor & Retry Policy

**Goal:** Enforce global ≤180s; avoid starting steps that cannot finish in time.

**Inputs:** Start timestamp; per-step budgets.

**Tasks**

- Record `t0` at first valid POST.
- Before each step: check **remaining time**. Do not start heavy steps if `< 5s` remain.
- Retries: at most **1 per failing step** if **≥ 15s** remain; otherwise skip/abort.
- Wrong answer: only re-submit if **≥ 30s** remain; else move on if next URL exists.

**Artifacts**

- Budget table: boot (≤8s cold), page render (≤4s), parse/solve/submit per quiz (≤12s).
- “Do not start if <X seconds remain” rules documented.

**Acceptance**

- Typical chain completes in ≤150s in target env.
- Graceful timeout response when budget exhausted.

**Pitfalls**

- Local runs feel faster—calibrate with deployment latency.
- Over-retrying and burning time.

---

## Phase 10 — Observability & Error Taxonomy

**Goal:** See every step; classify failures consistently.

**Inputs:** pino or similar.

**Tasks**

- Correlate by request id; log fields: quizIndex, elapsedMs, step, outcome, url hash (not full URL), sizes.
- Error codes: `INPUT_400`, `AUTH_403`, `RENDER_TIMEOUT`, `PARSER_NO_URL`, `FETCH_FAIL`, `FORMAT_INVALID`, `SUBMIT_FAIL`, `LLM_TIMEOUT`, `TIME_BUDGET_EXCEEDED`.
- Metrics (counters/timers) printed in logs or exposed via simple `/health` (optional).

**Artifacts**

- Logging schema doc; error code table.

**Acceptance**

- Logs allow reconstructing a full chain without guessing.
- Distinct errors are identifiable at a glance.

**Pitfalls**

- Logging secrets or full URLs (hash them).
- Unstructured, free-form error text.

---

## Phase 11 — Chart Generation (Only If Requested)

**Goal:** Create charts, encode as base64, ensure <1 MB.

**Inputs:** Data frame; chart spec inferred from question.

**Tasks**

- Generate minimal chart (bar/line/scatter), clear labels.
- Export PNG; encode as `data:image/png;base64,...`.
- Validate payload size; if >1 MB, reduce resolution/points.

**Artifacts**

- Chart payload size policy; fallback to textual summary if still too large.

**Acceptance**

- Produces valid data URI under 1 MB when requested.

**Pitfalls**

- Generating charts when not required (wastes time).
- High-resolution defaults causing size blowups.

---

## Phase 12 — Security & Compliance Pass

**Goal:** Sanity check before exposing publicly.

**Inputs:** Running service in staging.

**Tasks**

- HTTPS confirmed; reject non-POST.
- Validate submit URL scheme & sane hostname format; no file:// or data:// navigations.
- PII minimization in logs; redact email domain or hash email.
- Rate-limit basic (optional) to avoid abuse.

**Artifacts**

- Security checklist in `/docs/security.md`.

**Acceptance**

- Basic abuse and misrouting mitigated.
- No secret or PII leakage in logs.

**Pitfalls**

- Over-logging; leaving verbose debug in prod.

---

## Phase 13 — Deployment & Infra Validation

**Goal:** Public endpoint works with browser stack and time budgets.

**Inputs:** Target platform chosen.

**Tasks**

- Provision environment; set env vars.
- Validate headless Chromium runs (cold/warm starts measured).
- Add health check endpoint (optional).
- Capture deployment logs; confirm stdout/stderr flow.

**Artifacts**

- Deployment notes with platform specifics and known flags.

**Acceptance**

- Cold start ≤12s target; warm start ≤5s.
- Demo endpoint passes in deployed environment.

**Pitfalls**

- Building locally, failing on host due to missing fonts/libs for PDF/chromium.

---

## Phase 14 — Adversarial Prompts (100-char limit)

**Goal:** Provide final **system** (defensive) & **user** (extraction) prompts.

**Inputs:** Prompt testing rules from spec.

**Tasks**

- Draft concise system prompt to **never reveal code word**; include handling for jailbreak cues.
- Draft concise user prompt to **force reveal**.
- Character count checks (≤100 chars).
- Dry-run locally against small models to sanity-check behavior.

**Artifacts**

- Final prompts in `/docs/prompts.md` with exact char counts.

**Acceptance**

- Both prompts ≤100 chars; behavior aligns with goals.

**Pitfalls**

- Overly clever wording that breaks character budget.
- Ambiguous instructions that leak loopholes.

---

## Phase 15 — Test Matrix & Rehearsal

**Goal:** Repeated green runs; failure drills.

**Inputs:** Phases 0–14 complete.

**Tasks**

- **Unit:** secret check, JSON guard, URL extraction, base64 extraction, timer guard.
- **Integration:** demo URL E2E; malformed JSON; bad secret; missing `#result`; chained two-hop; chart task.
- **Perf:** simulate slow network; 3 parallel requests; measure total time.
- **Failure drills:** render timeout, missing submit URL, big file, LLM timeout.

**Artifacts**

- Test checklist in `/docs/test-plan.md`.
- Logs from 3 consecutive green runs.

**Acceptance**

- 3 consecutive full passes in deployment env with ≥20s time margin.
- Distinct failure cases produce expected error codes.

**Pitfalls**

- Only testing locally; must test on deployed infra with real latency.

---

## Phase 16 — Submission & Go-Live Prep

**Goal:** Be ready for the evaluation window.

**Inputs:** All prior artifacts.

**Tasks**

- Repo public; MIT license checked.
- Fill Google Form with email, secret, prompts, endpoint, repo URL.
- On-call notes: restart procedure, interpreting error codes, known quirks.
- Freeze main branch; tag release.

**Artifacts**

- `/docs/runbook.md` (1-pager).

**Acceptance**

- Form submitted; endpoint live; logs monitored during the window.

**Pitfalls**

- Last-minute dependency updates—freeze versions.

---

## Quick Responsibility Map (who can own what)

- **Junior A:** Phases 1–3 (API + Browser + Extraction)
- **Junior B:** Phases 4–6 (Parser + Fetch/Readers + Deterministic Solver)
- **Junior C:** Phases 7–9 (LLM bounded use + Submission/Chain + Time Governor)
- **Anyone (rotation):** Phases 10–12 (Observability + Security), 13 (Deploy), 15–16 (Tests + Submission)

---

## Definition of Done (per quiz run)

- Validates input (400/403/200 correct).
- Renders, extracts, parses, solves, submits.
- Follows chain until completion or time cap.
- Stays under 1 MB response; logs are structured.
- Leaves ≥20s buffer in typical run on prod infra.

---

**Bottom line:** Ship **deterministic first**, keep LLM usage tight, guard time, and make logs your superpower.

---

## Appendix: Brief Execution Plan (Senior-Level Overview)

## 0) Objectives & Constraints

**Goal:** Ship an HTTPS API that solves chained quizzes (render → parse → analyze → submit) under a **3-minute global cap**.
**Evaluation window:** **Sat, 29 Nov 2025, 3:00–4:00 PM IST**.
**Accuracy > Speed > Features.** Only build what’s needed to pass the demo and likely quiz variants.

## 1) Tech Decisions (locked)

**Runtime:** Node.js + **TypeScript**
**HTTP:** **Fastify**
**Headless browser:** **sparticuz/chromium-min** + puppeteer-core (serverless-friendly)
**LLM:** **Gemini** (fallback: OpenAI if needed)
**Orchestration:** **aipipe** (modular steps: fetch → parse → solve → submit)
**Data utils:** Minimal JS libs (CSV/Excel: papaparse/xlsx; PDF: pdf-parse or pdf.js bundling)
**Charts:** chart.js or quick canvas → base64 (only if needed)
**Deploy:** Railway/Render or Docker-on-VPS (prefer VPS for predictable Chromium)

## 2) Critical Path (do in order)

1. **API shell + auth**

   - POST `/solve`: validate JSON, secret → 200/400/403.

2. **Browser render + extraction**

   - Launch chromium-min once per quiz; render page; **wait for `#result`**; read decoded block.

3. **Question parser**

   - Extract: task text, **submission URL**, referenced files.

4. **Solver core (deterministic-first)**

   - Implement fast primitives: CSV sum/mean/filter, JSON field pick, basic PDF text/table read.
   - **Only call LLM** when deterministic path unclear.

5. **Submit + chain**

   - POST answer; follow `url` in response; stop on timeout or no new URL.

6. **Time governor**

   - Global timer from request start; **no step starts if <5s remain**; target finish ≤ 150s.

7. **Deploy + run demo**

   - Verify demo flow E2E; add logs, metrics; harden.

## 3) Performance & Reliability Budgets

**Total wall time:** ≤ **180s** (target ≤ **150s**)

- Browser boot: ≤ 4s warm / ≤ 8s cold
- Page load+render: ≤ 4s each
- Parse/solve/submit per quiz: ≤ 6–12s

**Retries:** max 1 per failing step; time-aware (skip if <15s remain).
**Payload size:** answers < **1 MB**.
**Memory:** keep Chromium single-tab; close cleanly.

## 4) Minimal Feature Set (MVP that passes)

- **Formats:** CSV, JSON, PDF text (tables best-effort).
- **Ops:** sum/avg/min/max, filter/select, simple joins if obvious.
- **LLM usage:** summarize ambiguous instructions, choose operation, sanity-check result.
- **Charts:** only if explicitly requested; PNG → base64.

## 5) Observability (must-have)

**Structured logs (JSON):** request id, elapsed ms, step, outcome, url hash, quiz index.
**Counters:** browser boot ms, page render ms, solver ms, LLM calls, submissions, retries.
**Error taxonomy:** INPUT_400, AUTH_403, RENDER_TIMEOUT, PARSE_FAIL, SUBMIT_FAIL, TIMEOUT.

## 6) Failure & Fallback Strategy

- **Browser fails:** one relaunch; if still failing → return error quickly (protect time).
- **Parser can’t find submit URL:** LLM extract; if still missing → abort.
- **Data fetch fails:** retry once; if file huge/slow → skip with rationale (don’t stall).
- **LLM slow:** 5s hard timeout; fallback to deterministic guess when applicable.
- **Wrong answer:** only re-submit if **≥30s** remain; otherwise proceed if next URL provided.

## 7) Security & Compliance

- Secrets via env; never log plaintext secrets or full URLs (hash).
- HTTPS only. Validate outgoing submission URL scheme + host format.
- No PII beyond provided email; redact in logs.

## 8) Test Matrix (fast but meaningful)

- **Unit:** secret check; timer guard; CSV sum; URL extraction; base64 decode.
- **Integration:** demo URL E2E; malformed JSON (400), bad secret (403); chained quizzes (2–3 hops); timeout path.
- **Perf:** cold start container; N=3 parallel requests; slow network (2× latency).

## 9) Execution Timeline (aggressive)

- **Day 1 (AM):** Fastify endpoint + auth + JSON paths.
- **Day 1 (PM):** chromium-min render; extract `#result`; parse submit URL.
- **Day 2 (AM):** Deterministic solver (CSV/JSON/PDF text).
- **Day 2 (PM):** Submission + chaining + time governor.
- **Day 3 (AM):** LLM integration (thin wrapper; 5s timeout; 1 retry).
- **Day 3 (PM):** Observability, error taxonomy, perf passes.
- **Day 4:** Deploy, demo drills, resilience patches, finalize prompts, fill form.

## 10) Acceptance Criteria (go/no-go)

- Returns **200/400/403** correctly.
- Solves demo quiz end-to-end; submits correct answer.
- Handles at least **one chained** quiz hop.
- Completes typical chain **≤150s** on target infra.
- Logs are sufficient to audit failures post-hoc.
- Prompts finalized (≤100 chars each); Google Form done; repo public (MIT).

## 11) Pre-Eval Readiness Checklist

- [ ] Cold start < 12s; warm < 5s.
- [ ] Demo E2E pass ×3 consecutive runs.
- [ ] Chained quiz pass with timer margin ≥ 20s.
- [ ] Fail fast on bad input; no unbounded retries.
- [ ] Secrets verified in prod env; HTTPS confirmed.
- [ ] On-call notes: restart procedure; known failure signatures.
