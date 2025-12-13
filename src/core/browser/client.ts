import puppeteer, { Browser, Page, HTTPRequest } from "puppeteer";
import { env } from "@/config/env.js";
import { BROWSER } from "@/config/constants.js";
import { logger } from "@/adapters/telemetry/logger.js";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

class BrowserManager {
  private _browser: Browser | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _activePages = 0;
  private isClosing = false;

  private async getBrowser(): Promise<Browser> {
    if (this._browser && this._browser.isConnected()) {
      return this._browser;
    }

    this.clearIdleTimer();

    const headless: boolean | "shell" = env.HEADLESS ? true : false;

    const baseArgs: string[] = [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
      // Stealth args
      "--disable-blink-features=AutomationControlled",
    ];

    const lightweightArgs: string[] = [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=TranslateUI",
      "--disable-extensions",
      "--disable-plugins",
      "--disable-images",
      "--disable-javascript-harmony-shipping",
      "--disable-default-apps",
      "--mute-audio",
      "--no-default-browser-check",
      "--disable-hang-monitor",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--disable-web-security",
      "--disable-ipc-flooding-protection",
      "--disable-logging",
      "--disable-permissions-api",
      "--disable-notifications",
      "--disable-popup-blocking",
      "--disable-prompt-on-repost",
      "--disable-component-extensions-with-background-pages",
      "--disable-background-networking",
      "--disable-client-side-phishing-detection",
      "--disable-component-update",
      "--disable-domain-reliability",
      "--disable-features=AudioServiceOutOfProcess",
      "--disable-features=VizDisplayCompositor"
    ];

    const args = env.LIGHTWEIGHT_BROWSER ? [...baseArgs, ...lightweightArgs] : baseArgs;

    logger.debug({ event: 'browser:launch:start' }, 'Launching new browser instance');

    logger.info({
      event: 'browser:config',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 'bundled',
      cwd: process.cwd(),
      files: import.meta.dir
    }, 'Browser Launch Configuration');

    // Explicitly cast to avoid type issues if inference fails
    const browser = await puppeteer.launch({
      headless,
      args,
      ignoreDefaultArgs: ["--enable-automation"],
    });
    this._browser = browser as unknown as Browser;

    this._browser.on('disconnected', () => {
      logger.warn({ event: 'browser:disconnected' }, 'Browser disconnected unexpectedly');
      this._browser = null;
    });

    return this._browser;
  }

  async getPage(): Promise<Page> {
    this.clearIdleTimer();
    this._activePages++;

    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      // Stealth transformations
      await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

      await page.evaluateOnNewDocument(() => {
        // Mask webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Mock plugins/languages if needed, but webdriver is the main signal
      });

      if (env.LIGHTWEIGHT_BROWSER) {
        await page.setRequestInterception(true);
        page.on('request', (req: HTTPRequest) => {
          if (req.isInterceptResolutionHandled()) return;

          const resourceType = req.resourceType();
          if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            void req.abort();
          } else {
            void req.continue();
          }
        });

        await page.setViewport({ width: 1280, height: 800 }); // More realistic viewport
      }

      return page;
    } catch (error) {
      this._activePages--;
      this.checkIdle();
      throw error;
    }
  }

  async releasePage(page: Page): Promise<void> {
    try {
      if (page && !page.isClosed()) {
        await page.close({ runBeforeUnload: false }).catch(() => { });
      }
    } finally {
      this._activePages--;
      this.checkIdle();
    }
  }

  private clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  private checkIdle() {
    if (this._activePages <= 0 && !this.isClosing) {
      this._activePages = 0;
      if (this._idleTimer) clearTimeout(this._idleTimer);

      logger.debug({ event: 'browser:idle_timer_start', timeoutMs: IDLE_TIMEOUT_MS }, 'Browser idle timer started');
      this._idleTimer = setTimeout(() => {
        void this.shutdown();
      }, IDLE_TIMEOUT_MS);
    }
  }

  async shutdown(): Promise<void> {
    if (this.isClosing || !this._browser) return;
    this.isClosing = true;
    this.clearIdleTimer();

    logger.info({ event: 'browser:shutdown' }, 'Shutting down browser instance');
    try {
      if (this._browser) {
        await this._browser.close().catch(() => { });
        this._browser = null;
      }
    } finally {
      this.isClosing = false;
    }
  }

  // Legacy/Compatibility methods
  async open(): Promise<void> {
    await this.getBrowser();
  }

  async close(): Promise<void> {
  }

  get page() { return null; }
}

export const browserManager = new BrowserManager();

export const getPage = () => browserManager.getPage();
export const releasePage = (p: Page) => browserManager.releasePage(p);
export const shutdown = () => browserManager.shutdown();

export const open = () => browserManager.open();
export const close = () => { };
export const goto = (_url: string, _timeoutMs = BROWSER.navTimeoutMs): Promise<void> => {
  void _url;
  void _timeoutMs;
  return Promise.reject(new Error("Use page.goto instead of global goto"));
};