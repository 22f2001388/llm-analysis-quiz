import { GOVERNOR } from "@/config/constants.js";
import { logger } from "@/adapters/telemetry/logger.js";
import { urlHash } from "@/utils/hash.js";
import { extractFromPage } from "@/core/browser/page-extractor.js";
import { getPage, releasePage } from "@/core/browser/client.js";
import { parseQuiz } from "@/core/parsing/quiz-parser.js";
import { download } from "@/core/data/fetcher.js";
import { convertResourceToJson, type StructuredResource } from "@/core/data/data-converter.js";
import { planSolution } from "@/core/solve/planner.js";
import { solveProblem } from "@/core/solve/llm-advisor.js";
import { prewarmLlm } from "@/adapters/llm/gemini.js";
import { validateResult } from "@/core/solve/validator.js";
import { buildPayload } from "@/core/submit/payload.js";
import { submitAnswer } from "@/core/submit/client.js";
import type { SolveResult } from "@/types/solve.js";

const resourceCache = new Map<string, StructuredResource>();


type ReportItem = {
  quizIndex: number;
  url: string;
  urlHash: string;
  steps: Array<{
    step: string;
    elapsedMs: number;
    info?: Record<string, unknown>;
  }>;
  outcome: 'submitted' | 'ended' | 'timeout' | 'failed';
  nextUrl?: string | null;
  error?: string;
};

export async function loadResourceRaw(url: string): Promise<{ content: string; contentType: string; name: string } | null> {
  try {
    const f = await download(url);
    const content = new TextDecoder().decode(f.data);
    const name = url.split('/').pop() || 'data';
    return { content, contentType: f.contentType, name };
  } catch {
    return null;
  }
}

export async function runChain(email: string, secret: string, startUrl: string, requestId: string) {
  const t0 = Date.now();
  const baseLogger = logger.child({ requestId });
  baseLogger.info({ event: 'chain:start' }, 'Starting quiz chain');
  const report: ReportItem[] = [];
  let currentUrl: string | null = startUrl;
  let quizIndex = 0;
  const MAX_QUIZZES = 50; // Prevent infinite loops
  const seenUrls = new Set<string>(); // Prevent URL cycles
  resourceCache.clear(); // Clear cache at chain start

  prewarmLlm().catch(() => { }); // Pre-warm LLM connection in background

  // Acquire a dedicated page for this chain execution
  let page: import("puppeteer").Page | null = null;

  try {
    try {
      page = await getPage();
    } catch (err) {
      baseLogger.error({ event: 'browser:acquire_failed', error: err instanceof Error ? err.message : String(err) }, 'Failed to acquire browser page');
      throw err;
    }

    while (currentUrl && quizIndex < MAX_QUIZZES) {
      const start = Date.now();
      const h = urlHash(currentUrl);

      // Check for URL cycles to prevent infinite loops
      if (seenUrls.has(currentUrl)) {
        baseLogger.warn({ event: 'chain:cycle_detected', url: currentUrl, urlHash: h }, 'URL cycle detected, stopping chain');
        report.push({
          quizIndex,
          url: currentUrl,
          urlHash: h,
          steps: [],
          outcome: 'failed',
          error: 'URL_CYCLE_DETECTED',
        });
        break;
      }
      seenUrls.add(currentUrl);

      const steps: ReportItem['steps'] = [];
      const log = baseLogger.child({ step: 'start', quizIndex, urlHash: h });

      const remaining = GOVERNOR.totalMs - (Date.now() - t0);
      if (remaining < GOVERNOR.minStartMs) {
        log.warn(
          { event: 'governor:skip', remainingMs: remaining },
          'Not enough time to start next quiz'
        );
        report.push({
          quizIndex,
          url: currentUrl,
          urlHash: h,
          steps,
          outcome: 'timeout',
          error: 'TIME_BUDGET_EXCEEDED',
        });
        break;
      }

      try {
        const e0 = Date.now();
        log.debug({ step: 'extract:start', url: currentUrl }, 'Starting page extraction');

        // Use the reused page instance
        const extract = await extractFromPage(page, currentUrl);

        steps.push({
          step: 'extract',
          elapsedMs: Date.now() - e0,
          info: { selectorWaitMs: extract.meta.selectorWaitMs },
        });
        log.info(
          { step: 'extract', elapsedMs: Date.now() - e0, textLength: extract.text.length },
          'Extracted result from page'
        );

        const p0 = Date.now();
        log.debug({ step: 'parse:start' }, 'Starting quiz parsing');
        const quiz = await parseQuiz(extract.text, currentUrl);
        steps.push({
          step: 'parse',
          elapsedMs: Date.now() - p0,
          info: {
            submitUrl: quiz.submitUrl,
            resources: quiz.resources?.length ?? 0,
          },
        });
        log.info(
          { step: 'parse', elapsedMs: Date.now() - p0, submitUrl: quiz.submitUrl, resources: quiz.resources?.length ?? 0 },
          'Parsed quiz successfully'
        );
        log.debug({ step: 'parse:details', taskText: quiz.taskText?.substring(0, 100), resources: quiz.resources }, 'Quiz parsing details');

        // STAGE 2: Load and convert resources using LLM (gemini-2.5-flash-lite)
        const structuredResources: StructuredResource[] = [];
        if (quiz.resources.length > 0) {
          log.debug({ step: 'resource:start', resourceCount: quiz.resources.length }, 'Loading and converting resources');

          for (const url of quiz.resources) {
            if (resourceCache.has(url)) {
              log.debug({ step: 'resource:cache-hit', url }, 'Using cached resource');
              structuredResources.push(resourceCache.get(url)!);
              continue;
            }

            const raw = await loadResourceRaw(url);
            if (raw) {
              log.debug({ step: 'resource:converting', name: raw.name }, 'Converting resource to JSON');
              const structured = await convertResourceToJson(raw.name, raw.content, url, raw.contentType);
              if (structured) {
                resourceCache.set(url, structured);
                structuredResources.push(structured);
                log.info({ step: 'resource:converted', name: raw.name, rows: structured.rowCount }, 'Resource converted');
              }
            }
          }
        } else {
          log.debug({ step: 'resource:skip' }, 'No resources to load');
        }

        // STAGE 3: Plan solution (gemini-2.5-flash-lite)
        log.debug({ step: 'plan:start' }, 'Planning solution');
        const plan = await planSolution(quiz.taskText, structuredResources);
        log.info({ step: 'plan:complete', complexity: plan.complexity, strategy: plan.strategy }, 'Solution planned');

        // STAGE 4: Solve problem with model cascade (flash-lite → flash → gemma → pro)
        let result: SolveResult | null = null;
        log.debug({ step: 'solve:start', complexity: plan.complexity }, 'Starting solve attempt');
        try {
          result = await solveProblem(quiz.taskText, plan, structuredResources);
          if (result) {
            log.info({ step: 'solve:success', answer: result }, 'Solve completed successfully');
          } else {
            log.warn({ step: 'solve:no-result' }, 'No result from solver');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error({ step: 'solve:failed', error: msg }, 'Solve attempt failed');
        }

        if (!result) {
          throw new Error('SOLVE_NO_RESULT');
        }

        const finalAnswer = validateResult(result);
        steps.push({
          step: 'solve',
          elapsedMs: Date.now() - p0,
          info: { haveAnswer: !!finalAnswer },
        });
        log.info(
          { step: 'solve', elapsedMs: Date.now() - p0, haveAnswer: !!finalAnswer },
          'Solved or attempted'
        );

        const v0 = Date.now();
        steps.push({ step: 'validate', elapsedMs: Date.now() - v0 });

        const sub0 = Date.now();
        log.debug({ step: 'submit:start', submitUrl: quiz.submitUrl, answer: finalAnswer }, 'Starting answer submission');
        let payload = buildPayload(email, secret, currentUrl, finalAnswer);
        log.info({ step: 'submit:payload', payload: JSON.stringify(payload) }, 'Submitting payload');
        let resp = await submitAnswer(quiz.submitUrl, payload);

        const MAX_RETRIES = 3;
        let retryCount = 0;
        // Allow retry even if no table, as LLM might be able to correct itself on text questions
        while (!resp?.correct && retryCount < MAX_RETRIES) {
          const retryRemaining = GOVERNOR.totalMs - (Date.now() - t0);
          if (retryRemaining < GOVERNOR.minStartMs) {
            log.warn({ step: 'retry:timeout', retryCount }, 'Not enough time for retry');
            break;
          }

          retryCount++;
          log.warn({ step: 'retry', attempt: retryCount, maxRetries: MAX_RETRIES }, 'Answer incorrect, retrying');

          try {
            const retryResult = await solveProblem(quiz.taskText, plan, structuredResources);
            if (retryResult) {
              const retryValidated = validateResult(retryResult);
              payload = buildPayload(email, secret, currentUrl, retryValidated);
              resp = await submitAnswer(quiz.submitUrl, payload);
              log.info({ step: 'retry:submit', attempt: retryCount, correct: resp?.correct }, 'Retry submission completed');
            }
          } catch (retryErr) {
            log.error({ step: 'retry:failed', attempt: retryCount, error: retryErr instanceof Error ? retryErr.message : String(retryErr) }, 'Retry attempt failed');
          }
        }

        const nextUrl = resp && typeof resp.url === 'string' ? resp.url : null;
        steps.push({
          step: 'submit',
          elapsedMs: Date.now() - sub0,
          info: { correct: !!(resp?.correct), next: !!nextUrl, retries: retryCount },
        });
        log.info(
          { step: 'submit', correct: !!(resp?.correct), next: !!nextUrl, nextUrl, retries: retryCount },
          'Submitted answer successfully'
        );

        const item: ReportItem = {
          quizIndex,
          url: currentUrl,
          urlHash: h,
          steps,
          outcome: nextUrl ? 'submitted' : 'ended',
          nextUrl,
        };
        report.push(item);

        if (!nextUrl) {
          break;
        }
        currentUrl = nextUrl;
        quizIndex++;

        // Check if we hit the max quiz limit
        if (quizIndex >= MAX_QUIZZES) {
          baseLogger.warn({ event: 'chain:max_quizzes_reached', maxQuizzes: MAX_QUIZZES }, 'Maximum quiz limit reached, stopping chain');
          report.push({
            quizIndex,
            url: currentUrl || 'unknown',
            urlHash: currentUrl ? urlHash(currentUrl) : 'unknown',
            steps: [],
            outcome: 'failed',
            error: 'MAX_QUIZZES_EXCEEDED',
          });
          break;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const item: ReportItem = {
          quizIndex,
          url: currentUrl,
          urlHash: h,
          steps,
          outcome: remaining <= 0 ? 'timeout' : 'failed',
          error: errorMsg,
        };
        log.error(
          { step: 'fail', quizIndex, urlHash: h, error: errorMsg, stack: err instanceof Error ? err.stack : undefined },
          'Chain step failed - stopping execution'
        );
        report.push(item);
        break;
      } finally {
        const elapsedMs = Date.now() - start;
        logger.info(
          { step: 'end', quizIndex, urlHash: h, elapsedMs },
          'Quiz step complete'
        );
      }
    }
  } finally {
    // Release the page back to the manager (or close it)
    if (page) {
      try {
        await releasePage(page);
        baseLogger.debug({ event: 'browser:page_release' }, 'Browser page released');
      } catch (closeError) {
        baseLogger.warn({ event: 'browser:page_release:error', error: closeError instanceof Error ? closeError.message : String(closeError) }, 'Failed to release browser page');
      }
    }
  }

  logger.info(
    { event: 'chain:complete', quizzes: report.length, totalMs: Date.now() - t0 },
    'Chain completed'
  );
  return { totalMs: Date.now() - t0, quizzes: report };
}
