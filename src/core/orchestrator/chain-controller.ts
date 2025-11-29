import { GOVERNOR } from "@/config/constants.js";
import { logger } from "@/adapters/telemetry/logger.js";
import { urlHash } from "@/utils/hash.js";
import { extractFromUrl } from "@/core/browser/page-extractor.js";
import { parseQuiz } from "@/core/parsing/quiz-parser.js";
import { download } from "@/core/data/fetcher.js";
import { parseCsv, parseTsv } from "@/core/data/csv.js";
import { parseJson } from "@/core/data/json.js";
import { parsePdf } from "@/core/data/pdf.js";
import { coerceNumbers, normalizeJson } from "@/core/data/normalize.js";
import { parseOperation, applyPlan } from "@/core/solve/deterministic.js";
import { adviseOperation } from "@/core/solve/llm-advisor.js";
import { validateResult } from "@/core/solve/validator.js";
import { buildPayload } from "@/core/submit/payload.js";
import { submitAnswer } from "@/core/submit/client.js";
import type { SolveResult } from "@/types/solve.js";


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

export async function loadResource(url: string) {
  const f = await download(url);
  const ct = f.contentType.toLowerCase();
  const text = new TextDecoder().decode(f.data);

  if (ct.includes('csv')) {
    return parseCsv(text);
  }
  if (ct.includes('tsv')) {
    return parseTsv(text);
  }
  if (ct.includes('json')) {
    return normalizeJson(parseJson(text));
  }
  if (ct.includes('pdf')) {
    const pdf = await parsePdf(f.data);
    const tableMatch = pdf.text.match(/```(?:csv)?\n?([\s\S]*?)\n?```/);
    if (!tableMatch) {
      throw new Error('PDF_NO_TABLE');
    }
    const pseudoCsv = tableMatch[1];
    return parseCsv(pseudoCsv);
  }
  if (url.endsWith('.csv')) {
    return parseCsv(text);
  }
  if (url.endsWith('.tsv')) {
    return parseTsv(text);
  }
  if (url.endsWith('.json')) {
    return normalizeJson(parseJson(text));
  }
  if (url.endsWith('.pdf')) {
    const pdf = await parsePdf(f.data);
    const tableMatch = pdf.text.match(/```(?:csv)?\n?([\s\S]*?)\n?```/);
    if (!tableMatch) throw new Error('PDF_NO_TABLE');
    const pseudoCsv = tableMatch[1];
    return parseCsv(pseudoCsv);
  }

  return null;
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
      const extract = await extractFromUrl(currentUrl);
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
       const quiz = parseQuiz(extract.text, currentUrl);
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

       let table = null;
       if (quiz.resources.length > 0) {
         log.debug({ step: 'resource:start', resourceUrl: quiz.resources[0] }, 'Loading resource data');
         try {
           const t = await loadResource(quiz.resources[0]);
           table = t ? coerceNumbers(t) : null;
           log.info({ step: 'resource:loaded', rows: table?.rows?.length ?? 0, columns: table?.headers?.length ?? 0 }, 'Resource loaded successfully');
         } catch (err: unknown) {
           const msg = err instanceof Error ? err.message : String(err);
           log.error({ step: 'resource:failed', error: msg }, 'Resource load failed');
         }
       } else {
         log.debug({ step: 'resource:skip' }, 'No resources to load');
       }

      let result: SolveResult | null = null;
      if (!result && table) {
          log.debug({ step: 'solve:start', hasTable: !!table }, 'Starting solve attempt');
          try {
            let plan = parseOperation(quiz.taskText);
            if (plan) {
              log.debug({ step: 'solve:deterministic', op: plan.op }, 'Using deterministic solver');
            } else {
              log.debug({ step: 'solve:llm:start' }, 'Falling back to LLM advisor');
              plan = await adviseOperation(quiz.taskText, table);
              log.debug({ step: 'solve:llm:complete', op: plan?.op }, 'LLM advisor completed');
            }
            if (plan) {
              result = applyPlan(table, plan);
              log.info({ step: 'solve:success', answer: result, op: plan.op }, 'Solve completed successfully');
            } else {
              log.warn({ step: 'solve:no-plan' }, 'No operation plan found');
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error({ step: 'solve:failed', error: msg }, 'Solve attempt failed');
          }
        } else {
          log.debug({ step: 'solve:skip', hasTable: !!table }, 'Skipping solve - no table data');
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
       const payload = buildPayload(email, secret, currentUrl, finalAnswer);
       const resp = await submitAnswer(quiz.submitUrl, payload);
       const nextUrl = resp && typeof resp.url === 'string' ? resp.url : null;
       steps.push({
         step: 'submit',
         elapsedMs: Date.now() - sub0,
         info: { correct: !!(resp?.correct), next: !!nextUrl },
       });
       log.info(
         { step: 'submit', correct: !!(resp?.correct), next: !!nextUrl, nextUrl },
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

  logger.info(
    { event: 'chain:complete', quizzes: report.length, totalMs: Date.now() - t0 },
    'Chain completed'
  );
  return { totalMs: Date.now() - t0, quizzes: report };
}
