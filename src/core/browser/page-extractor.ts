import type { Page } from "puppeteer-core";
import { BROWSER } from "../../config/constants.js";

export type ExtractResult = {
  text: string;
  html: string;
  meta: { url: string; title: string };
};

export async function waitForResult(page: Page, timeoutMs = BROWSER.selectorTimeoutMs): Promise<ExtractResult> {
  const selector = "#result";
  await page.waitForSelector(selector, { visible: true, timeout: timeoutMs });
  const el = await page.$(selector);
  if (!el) throw new Error("RENDER_NO_SELECTOR");

  const text = await page.evaluate(e => (e.textContent || "").trim(), el);
  const html = await page.evaluate(e => e.outerHTML, el);
  const title = await page.title();
  const url = page.url();

  if (!text) throw new Error("RENDER_EMPTY_RESULT");
  return { text, html, meta: { url, title } };
}
