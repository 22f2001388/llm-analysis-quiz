import puppeteer, { Browser, Page } from "puppeteer";
import { env } from "@/config/env.js";
import { BROWSER } from "@/config/constants.js";

class BrowserManager {
  private _browser: Browser | null = null;
  private _page: Page | null = null;
  private isClosing = false;

  async open(): Promise<void> {
    if (this._browser || this.isClosing) return;

    const headless: boolean | "shell" = env.HEADLESS ? true : false;

    const baseArgs: string[] = [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
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

    try {
      this._browser = await puppeteer.launch({
        headless,
        args
      });

      this._page = await this._browser.newPage();
      
      // Optimize page for performance
      await this._page.setUserAgent("llm-quiz-bot/1.0");
      
      if (env.LIGHTWEIGHT_BROWSER) {
        await this._page.setRequestInterception(true);
        this._page.on('request', (req) => {
          const resourceType = req.resourceType();
          // Block unnecessary resources for faster loading
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                  void req.abort();
                } else {
                  void req.continue();          }
        });
        
        // Set viewport to minimal size
        await this._page.setViewport({ width: 800, height: 600 });
      }
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  async goto(url: string, timeoutMs = BROWSER.navTimeoutMs): Promise<void> {
    if (!this._browser || !this._page) await this.open();
    if (!this._page) throw new Error("BROWSER_PAGE_UNAVAILABLE");
    await this._page.goto(url, { waitUntil: BROWSER.waitUntil, timeout: timeoutMs });
  }

  getPage(): Page {
    if (!this._page) throw new Error("BROWSER_PAGE_UNAVAILABLE");
    return this._page;
  }

  private async cleanup(): Promise<void> {
    if (this.isClosing) return;
    this.isClosing = true;

    try {
      if (this._page) {
        await this._page.close({ runBeforeUnload: false }).catch(() => {});
        this._page = null;
      }
    } finally {
      if (this._browser) {
        await this._browser.close().catch(() => {});
        this._browser = null;
      }
      this.isClosing = false;
    }
  }

  async close(): Promise<void> {
    await this.cleanup();
  }

  async forceClose(): Promise<void> {
    this.isClosing = true;
    await this.cleanup();
  }

  // Legacy compatibility
  get browser() { return this._browser; }
  get page() { return this._page; }
}

export const browserManager = new BrowserManager();

// Legacy exports for backward compatibility
export const browserState = {
  get browser() { return browserManager.browser; },
  get page() { return browserManager.page; }
};

export const open = () => browserManager.open();
export const goto = (url: string, timeoutMs?: number) => browserManager.goto(url, timeoutMs);
export const getPage = () => browserManager.getPage();
export const close = () => browserManager.close();