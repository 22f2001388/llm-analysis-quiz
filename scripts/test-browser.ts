
import { getPage, releasePage, shutdown } from "../src/core/browser/client.js";
import { parseArgs } from "util";
import type { Page } from "puppeteer";

import "../src/config/env.js";

const args = parseArgs({
  args: process.argv.slice(2),
  options: {
    mode: { type: 'string' },
    url: { type: 'string' },
    wait: { type: 'string' }
  }
});

const mode = args.values.mode || 'simple';
const url = args.values.url || '';
const waitTime = parseInt(args.values.wait || '0');

if (!url) {
  console.error('Error: URL is required');
  console.log('Usage: bun scripts/test-browser.ts --url=<url> [--mode=<mode>] [--wait=<seconds>]');
  console.log('Modes: simple, integration, debug');
  console.log('Example: bun scripts/test-browser.ts --url=https://example.com --mode=simple');
  process.exit(1);
}

try {
  new URL(url);
} catch {
  console.error('Error: Invalid URL format');
  console.log(`Provided URL: ${url}`);
  process.exit(1);
}

async function testSimple(url: string, waitTime: number) {
  console.log(`Opening browser with URL: ${url}`);
  let page: Page | null = null;

  try {
    page = await getPage();
    console.log('Browser page acquired successfully');

    await page.goto(url);
    console.log(`Navigated to ${url}`);

    if (waitTime > 0) {
      console.log(`Waiting for ${waitTime} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
      console.log('Wait completed');
    }

  } catch (error) {
    console.error('Browser test failed:');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (page) await releasePage(page);
  }
}

async function testIntegration(url: string) {
  console.log(`Running integration test with URL: ${url}`);
  let page: Page | null = null;

  try {
    page = await getPage();
    console.log('Browser page acquired');

    console.log('Testing page extraction...');
    const { extractFromPage } = await import("../src/core/browser/page-extractor.js");

    // extractFromPage handles navigation
    const result = await extractFromPage(page, url);

    console.log('Extraction successful:');
    console.log(`- Text length: ${result.text.length} characters`);
    console.log(`- Selector wait time: ${result.meta.selectorWaitMs}ms`);
    console.log(`- Text preview: ${result.text.substring(0, 200)}...`);

  } catch (error) {
    console.error('Integration test failed:');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    if (page) await releasePage(page);
  }
}

async function testDebug(url: string) {
  console.log(`Running debug test with URL: ${url}`);
  let page: Page | null = null;

  try {
    page = await getPage();
    console.log('Browser page acquired in debug mode');

    console.log('Debug: Testing page extraction...');
    const { extractFromPage } = await import("../src/core/browser/page-extractor.js");

    const result = await extractFromPage(page, url);

    console.log('=== DEBUG INFO ===');
    console.log(`URL: ${url}`);
    console.log(`Text length: ${result.text.length}`);
    console.log(`Selector wait: ${result.meta.selectorWaitMs}ms`);
    console.log(`First 500 chars:`);
    console.log(result.text.substring(0, 500));
    console.log('==================');

    if (waitTime > 0) {
      console.log(`Keeping browser open for ${waitTime} seconds for manual inspection...`);
      await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
    }

  } catch (error) {
    console.error('Debug test failed:');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  } finally {
    if (page) await releasePage(page);
  }
}

async function main() {
  try {
    switch (mode) {
      case 'simple':
        await testSimple(url, waitTime);
        break;
      case 'integration':
        await testIntegration(url);
        break;
      case 'debug':
        await testDebug(url);
        break;
      default:
        console.error(`Error: Unknown mode '${mode}'`);
        console.log('Available modes: simple, integration, debug');
        process.exit(1);
    }

    console.log('Test completed successfully');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  } finally {
    try {
      await shutdown();
      console.log('Browser shutdown successfully');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    }
  }
}

main();