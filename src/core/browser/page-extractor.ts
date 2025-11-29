import {
  open,
  goto,
  getPage,
  close,
} from "@/core/browser/client.js";
import type { Page } from 'puppeteer';
import { BROWSER } from "@/config/constants.js";
import type { ExtractResult } from "@/types/quiz.js";
import { makeError, ErrorCode } from "@/types/errors.js";
import { logger } from "@/adapters/telemetry/logger.js";

async function waitForResult(page: Page, timeoutMs: number = BROWSER.selectorTimeoutMs): Promise<ExtractResult> {
  const selector = '#result';
  const t0 = Date.now();
  logger.debug({ event: 'browser:wait:start', selector, timeoutMs }, 'Starting selector wait');
  try {
      await page.waitForSelector(selector, { visible: true, timeout: timeoutMs });
      logger.debug({ event: 'browser:wait:success', selector, waitMs: Date.now() - t0 }, 'Selector found successfully');
   } catch {
      logger.warn({ event: 'browser:wait:timeout', selector, timeoutMs, elapsedMs: Date.now() - t0 }, 'Selector wait timed out');
      throw makeError(
          ErrorCode.RENDER_TIMEOUT,
          'Timed out waiting for #result',
          { selector, timeoutMs }
      );
  }

  const selectorMs = Date.now() - t0;
  const el = await page.$(selector);
  if (!el) {
    throw makeError(ErrorCode.RENDER_NO_SELECTOR, 'Selector #result not found', {
      selector,
    });
  }

  const text = await page.evaluate((e) => e.textContent?.trim(), el);
  const html = await page.evaluate((e) => e.outerHTML, el);
  const title = await page.title();
  const url = page.url();

  if (!text) {
    throw makeError(ErrorCode.RENDER_EMPTY_RESULT, 'Empty result content', {
      selector,
    });
  }
  const totalMs = Date.now() - t0;

  return {
    text,
    html,
    meta: {
      url,
      title,
      selectorWaitMs: selectorMs,
      totalMs,
    },
  };
}

export async function extractFromUrl(url: string): Promise<ExtractResult> {
  logger.debug({ event: 'browser:extract:start', url }, 'Starting page extraction');
  await open();
  
  try {
    logger.debug({ event: 'browser:goto', url }, 'Navigating to URL');
    await goto(url);
    const page = getPage();
    logger.debug({ event: 'browser:wait', selector: '#result' }, 'Waiting for result selector');
    const result = await waitForResult(page);
    logger.info({ event: 'browser:extract:success', url, textLength: result.text.length }, 'Successfully extracted page content');
    return result;
  } catch (error) {
    logger.error({ event: 'browser:extract:error', url, error: error instanceof Error ? error.message : String(error) }, 'Page extraction failed');
    throw error;
  } finally {
    try {
      await close();
      logger.debug({ event: 'browser:close' }, 'Browser session closed');
    } catch (closeError) {
      logger.warn({ event: 'browser:close:error', error: closeError instanceof Error ? closeError.message : String(closeError) }, 'Browser cleanup failed');
    }
  }
}
