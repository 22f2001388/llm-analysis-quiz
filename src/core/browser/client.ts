import puppeteer, { Browser, Page, Viewport } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { env } from "../../config/env.js";
import { BROWSER } from "../../config/constants.js";

let browser: Browser | null = null;
let page: Page | null = null;

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === "string");
}

function isViewport(x: unknown): x is Viewport {
  return typeof x === "object" && x !== null && "width" in (x as Record<string, unknown>) && "height" in (x as Record<string, unknown>);
}

async function resolveExecutablePath(): Promise<string> {
  if (env.BROWSER_PATH) return env.BROWSER_PATH;
  const p = await chromium.executablePath();
  return typeof p === "string" ? p : String(p);
}

export async function open(): Promise<void> {
  if (browser) return;

  const executablePath = await resolveExecutablePath();
  const headless: boolean | "shell" = env.HEADLESS ? true : false;

  const baseArgsUnknown: unknown = (chromium as unknown as { args?: unknown }).args;
  const chromiumArgs: string[] = isStringArray(baseArgsUnknown) ? baseArgsUnknown : [];
  const args: string[] = [...chromiumArgs, "--disable-dev-shm-usage", "--no-sandbox"];

  const vpUnknown: unknown = (chromium as unknown as { defaultViewport?: unknown }).defaultViewport;
  const defaultViewport: Viewport | undefined = isViewport(vpUnknown) ? vpUnknown : undefined;

  browser = await puppeteer.launch({
    executablePath,
    headless,
    args,
    defaultViewport
  });

  page = await browser.newPage();
  await page.setUserAgent("llm-quiz-bot/1.0");
}

export async function goto(url: string, timeoutMs = BROWSER.navTimeoutMs): Promise<void> {
  if (!browser || !page) await open();
  if (!page) throw new Error("BROWSER_PAGE_UNAVAILABLE");
  await page.goto(url, { waitUntil: BROWSER.waitUntil, timeout: timeoutMs });
}

export function getPage(): Page {
  if (!page) throw new Error("BROWSER_PAGE_UNAVAILABLE");
  return page;
}

export async function close(): Promise<void> {
  try {
    if (page) {
      await page.close({ runBeforeUnload: false });
      page = null;
    }
  } finally {
    if (browser) {
      await browser.close();
      browser = null;
    }
  }
}
