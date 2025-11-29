# Reuse Plan — From “LLM Code Deployment” → “LLM Analysis Quiz”

## 1) What we’re reusing (TL;DR)

- **Keep as-is (lift & shift):**

  - Fastify server bootstrap + logging scaffolding
  - Env config loader & validation
  - Retry helper & structured logging
  - LLM client wrappers (Gemini + AIPipe), with timeouts/backoff
  - Request pattern: accept → validate → 200 immediately → process in background

- **Adapt lightly:**

  - Route handler (schema + auth) → new `/solve` contract
  - Background job orchestration → quiz chain controller
  - Callback sender → quiz submission client pattern (different payload)

- **Do NOT reuse:**

  - GitHub gateways, Pages deployment logic, repo file committers, README/plan generators

The bullets above map directly to concrete files/modules below, with where they go in the new repo.

---

## 2) Direct reuse (copy over, keep behavior)

### Server bootstrap & logging

- **Files to reuse**

  - `src/app/server.ts` — Fastify setup, logger wiring, lifecycle & signals.
  - `src/shared/logger.ts` — Pino logger wrapper (structured JSON).

- **Why it’s reusable**

  - New system also needs Fastify + JSON logs with request-scoped context and graceful shutdown.

- **New placement**

  - `src/app/server.ts`, `src/adapters/telemetry/logger.ts` (if you follow the new structure doc).

### Env & config

- **Files to reuse**

  - `src/shared/env.ts` — centralizes secrets (`SECRET_KEY`, API keys), ports, etc.

- **Why**

  - Same pattern: secrets via env, single typed config object.

- **New placement**

  - `src/config/env.ts`

### Retry & utility primitives

- **Files to reuse**

  - `src/shared/retry.ts` — exponential backoff with allowlist of retriable errors.
  - `src/shared/text.ts` (only helper bits you actually need).

- **Why**

  - New project also needs bounded retries for LLM calls, downloads, and submissions.

- **New placement**

  - `src/utils/retry.ts`, `src/utils/text.ts` (optional)

### LLM clients (Gemini + AIPipe)

- **Files to reuse**

  - `src/adapters/llm/GeminiLLMClient.ts` — key rotation, request timeout, chat wrapper, usage accounting.
  - `src/adapters/llm/AIPipeLLMClient.ts` — token rotation, retry on 429/503, timeout.
  - `src/core/ports/LLMClient.ts` — interface + typed config.

- **Why**

  - New system needs fast, bounded LLM calls for disambiguation and strategy—your wrappers already solve reliability.

- **New placement**

  - `src/adapters/llm/gemini.ts`, `src/adapters/llm/aipipe.ts`, `src/types/llm.ts`

### Request pattern: accept, auth, background

- **Files to reuse**

  - `src/app/routes/project.route.ts` — pattern of: validate → 200/401/400 → process in background with logger.
  - `src/contracts/project.schema.ts` — schema-driven request checking (reuse approach, not fields).

- **Why**

  - New API also needs immediate 200 + async processing to stay responsive.

- **New placement**

  - `src/app/routes.ts`, `src/types/api.ts`

---

## 3) Light adaptations (rename + small logic swap)

### Route → new `/solve` contract

- **Source**

  - `src/app/routes/project.route.ts` (Fastify route, auth with `SECRET_KEY`, early 200).

- **Change**

  - Replace body schema (`email`, `secret`, `url`), keep secret check + early return; swap downstream call to **chain-controller** instead of “MakeProject/UpdateProject”.

- **Landing**

  - `src/app/routes.ts` → handler that delegates to `core/orchestrator/chain-controller.ts`.

### Background orchestration → quiz chain

- **Source**

  - The “processRequest” pattern inside `project.route.ts` (LLM clients instantiation, logging, catching, callback).

- **Change**

  - Replace “Make/Update project” paths with **render → parse → solve → submit → next** loop; preserve structured try/catch and final reporting.

- **Landing**

  - `src/core/orchestrator/chain-controller.ts`

### Callback sender → submission client

- **Source**

  - `sendCallback` in `project.route.ts` — POST JSON, check `.ok`, log on error.

- **Change**

  - Rename as `submit/client.ts`; payload becomes `{ email, secret, url, answer }`, parse `{ correct, url, reason }`.

- **Landing**

  - `src/core/submit/client.ts`

### Logging patterns & error taxonomy

- **Source**

  - `server.ts` logger setup; route child loggers with context (nonce/route).

- **Change**

  - Keep the child-logger style, move fields to: `requestId`, `quizIndex`, `urlHash`, `elapsedMs`.

- **Landing**

  - `src/adapters/telemetry/logger.ts`, `src/types/telemetry.ts`

---

## 4) Inspiration only (patterns to borrow, not copy verbatim)

### Schema-first contracts

- **Source**

  - `src/contracts/project.schema.ts` (explicit JSON schema for body & responses).

- **Borrow**

  - Use the same style for `/solve` (clear 200/400/403 structure). Don’t reuse fields wholesale.

### “Accept → 200 → work” lifecycle

- **Source**

  - Route sends 200 then spawns work; all failures reported via callback.

- **Borrow**

  - Same UX for the quiz endpoint; the “work” now drives the chain instead of repo work.

### Multi-provider LLM strategy

- **Source**

  - `GenerateFiles` uses primary + fallback model, switching on errors; retries are bounded.

- **Borrow**

  - Keep the primary/fallback pattern for Quiz LLM advisory, with strict 5s timeout and 1 retry.

---

## 5) Do NOT reuse (remove entirely)

- **GitHub adapters & domain** (`src/adapters/github/*`, `src/core/domain/GitHub.ts`, `src/core/usecases/*Commit*/VerifyAndDeploy/MakeProject/UpdateProject/ReplanProject/ReviewCode`) — these are repo/deploy flows irrelevant to the quiz.
- **Project/Plan domain + prompts** (`src/core/domain/Plan.ts`, `src/core/domain/prompts.ts`) — centered on generating repositories and READMEs, not needed here.
- **README/codegen paths** — not part of quiz workflow.

---

## 6) One-to-one mapping (old → new)

| Old file/module                       | New home                           | Notes                                              |
| ------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `src/app/server.ts`                   | `src/app/server.ts`                | Keep bootstrap & logger; mount `/solve`.           |
| `src/app/routes/project.route.ts`     | `src/app/routes.ts`                | Rewire body schema + delegate to chain-controller. |
| `src/shared/env.ts`                   | `src/config/env.ts`                | Same env pattern; add browser vars.                |
| `src/shared/logger.ts`                | `src/adapters/telemetry/logger.ts` | Same pino setup; add redactions.                   |
| `src/shared/retry.ts`                 | `src/utils/retry.ts`               | Wrap with time-governor checks.                    |
| `src/adapters/llm/GeminiLLMClient.ts` | `src/adapters/llm/gemini.ts`       | Keep API/timeouts; change default model/ttl.       |
| `src/adapters/llm/AIPipeLLMClient.ts` | `src/adapters/llm/aipipe.ts`       | Keep 429 rotation/retries.                         |
| `src/core/ports/LLMClient.ts`         | `src/types/llm.ts`                 | Interfaces unchanged.                              |
| `sendCallback` helper (inline)        | `src/core/submit/client.ts`        | Same POST pattern, new payload/response.           |

---

## 7) Adaptation specifics (how to change minimal code)

- **Auth & status codes:** keep the exact pattern from the old route: reject bad secret, return 200/401/400 accordingly; rename 401→403 if aligning to quiz spec.
- **Async processing:** keep the “respond 200, then process” design to avoid blocking the caller.
- **Retries:** import old `retry` and wrap _only_ network/LLM steps; cap attempts to fit the 3-minute budget.
- **LLM usage:** reuse the timeout & key-rotation; set stricter per-call timeout (≈5s).
- **Telemetry:** preserve route-child logger; replace `nonce` context with `requestId`, `quizIndex`, `urlHash`.

---

## 8) What changes because the domain changed (quiz vs repo)

- **From “notify evaluation API” → “submit quiz answer”**
  Same POST mechanics; different payload & validations. Old callback code shows the exact error handling, backoff pattern, and logging to copy.
- **From “round 1/2 project flow” → “quiz chaining”**
  Replace multi-round logic with loop over `{ correct, url }` responses; still driven by one controller.

---

## 9) Quick port checklist (1–2 days)

1. **Copy**: `server.ts`, `env.ts`, `logger.ts`, `retry.ts`, `LLMClient.ts`, `GeminiLLMClient.ts`, `AIPipeLLMClient.ts`. Wire them into the new skeleton.
2. **Rewrite small**: route handler → `/solve` with new schema; keep secret check + early 200.
3. **Replace internals**: in background path, call `chain-controller` instead of Make/Update/Deploy.
4. **Swap callback**: old `sendCallback` → `submit/client.ts` for quiz answer POSTs.
5. **Tighten LLM**: enforce 5s timeout, 1 retry; keep key rotation.
6. **Remove**: all GitHub/adapters/usecases and “plan/README” domains. They’re dead weight here.

---

## 10) Risk flags (watch these while porting)

- **Mixing old GitHub flows** into quiz route—strip them out or you’ll waste time and memory.
- **Time budget creep** from generous LLM timeouts—cut to 5s & bound retries.
- **Leaky logs** (email, full URLs) — keep the old structured logging discipline and redact.

---

## 11) Why this reuse is safe

Your old system already proved:

- **Robust request lifecycle** with Fastify, schema checks, and secret validation.
- **Resilient LLM integration** (timeouts, retries, key rotation).
- **Clean async pattern** (accept → do work → callback). That maps 1:1 to quiz submit.

What’s new—browser rendering, parsing, deterministic solvers—sits **beside** these reused pieces, not inside them. So you save time without bending the new architecture.
