
import {
  getPage,
  releasePage, // Added releasePage import
} from "@/core/browser/client.js";
import type { Page } from 'puppeteer';
import { BROWSER } from "@/config/constants.js";
import type { ExtractResult } from "@/types/quiz.js";
import { makeError, ErrorCode } from "@/types/errors.js";
import { logger } from "@/adapters/telemetry/logger.js";

async function waitForContent(page: Page, timeoutMs: number = BROWSER.selectorTimeoutMs): Promise<ExtractResult> {
  const t0 = Date.now();
  logger.debug({ event: 'browser:wait:start', timeoutMs }, 'Starting content wait');

  try {
    // Wait for body to be present - this is the minimal check for "page interaction ready"
    await page.waitForSelector('body', { visible: true, timeout: timeoutMs });
    logger.debug({ event: 'browser:wait:success', waitMs: Date.now() - t0 }, 'Body found successfully');
  } catch {
    logger.warn({ event: 'browser:wait:timeout', timeoutMs, elapsedMs: Date.now() - t0 }, 'Body wait timed out');
    throw makeError(
      ErrorCode.RENDER_TIMEOUT,
      'Timed out waiting for page body',
      { timeoutMs }
    );
  }

  const selectorMs = Date.now() - t0;

  // Extract content from body
  const bodyHandle = await page.$('body');
  if (!bodyHandle) {
    throw makeError(ErrorCode.RENDER_NO_SELECTOR, 'Body element not found');
  }

  const text = await page.evaluate((e) => e.innerText?.trim() || e.textContent?.trim() || "", bodyHandle);
  const html = await page.evaluate((e) => e.outerHTML, bodyHandle);
  const title = await page.title();
  const url = page.url();

  if (!text && !html) {
    throw makeError(ErrorCode.RENDER_EMPTY_RESULT, 'Empty page content');
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

const MAX_RETRIES = 3;

export async function extractFromPage(page: Page, url: string): Promise<ExtractResult> {
  logger.debug({ event: 'browser:extract:start', url }, 'Starting page extraction');

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        logger.warn({ event: 'browser:extract:retry', url, attempt }, 'Retrying page extraction');
        // Exponential backoff: 1s, 2s, 4s...
        const waitMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }

      logger.debug({ event: 'browser:goto', url, attempt }, 'Navigating to URL');
      await page.goto(url, { waitUntil: BROWSER.waitUntil, timeout: BROWSER.navTimeoutMs });

      logger.debug({ event: 'browser:wait' }, 'Waiting for page content');
      const result = await waitForContent(page);
      logger.info({ event: 'browser:extract:success', url, textLength: result.text.length }, 'Successfully extracted page content');
      return result;

    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);

      // Don't retry if it's a render timeout on the SELECTOR, as that implies the page load worked but content is missing.
      // But do retry on navigation failures (Network errors).
      const isNavError = msg.includes('net::') || msg.includes('Navigation timeout');

      if (!isNavError && attempt < MAX_RETRIES) {
        // If it's NOT a navigation error (meaning page loaded but selector failed), maybe we shouldn't retry? 
        // Actually, typically we DO want to reload and try again as dynamic content might have failed.
        // Let's retry everything safely.
      }

      logger.warn({ event: 'browser:extract:attempt_failed', url, error: msg, attempt }, 'Page extraction attempt failed');
    }
  }

  logger.error({ event: 'browser:extract:error', url, error: lastError instanceof Error ? lastError.message : String(lastError) }, 'Page extraction failed after retries');
  throw lastError;
}

// Deprecated: kept for backward compatibility if needed, but intended to be replaced
export async function extractFromUrl(url: string): Promise<ExtractResult> {
  const page = await getPage();
  // Note: this creates a detached page that might not be cleaned up if the caller doesn't handle it.
  // Ideally we should warn or throw.
  // For now, let's close it immediately after use to be safe, though this defeats Reuse for this specific function call.
  // The main optimization target is runChain which we will switch to extractFromPage.
  try {
    return await extractFromPage(page, url);
  } finally {
    // Since this helper method allows no access to the page for the caller, we MUST close it here
    // to prevent leaks.
    // But wait, client.ts `getPage` tracks active pages. 
    // We need to import releasePage.
    await releasePage(page);
  }
}

