#!/usr/bin/env bun

import { open, goto, close } from "../src/core/browser/client.js";
import { parseArgs } from "util";

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

  try {
    await open();
    console.log('Browser launched successfully');

    await goto(url);
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
  }
}

async function testIntegration(url: string) {
  console.log(`Running integration test with URL: ${url}`);

  try {
    await open();
    console.log('Browser launched for integration test');

    await goto(url);
    console.log(`Navigated to ${url}`);

    console.log('Testing page extraction...');
    const { extractFromUrl } = await import("../src/core/browser/page-extractor.js");
    const result = await extractFromUrl(url);
    
    console.log('Extraction successful:');
    console.log(`- Text length: ${result.text.length} characters`);
    console.log(`- Selector wait time: ${result.meta.selectorWaitMs}ms`);
    console.log(`- Text preview: ${result.text.substring(0, 200)}...`);

  } catch (error) {
    console.error('Integration test failed:');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function testDebug(url: string) {
  console.log(`Running debug test with URL: ${url}`);

  try {
    await open();
    console.log('Browser launched in debug mode');

    await goto(url);
    console.log(`Navigated to ${url}`);

    console.log('Debug: Testing page extraction...');
    const { extractFromUrl } = await import("../src/core/browser/page-extractor.js");
    const result = await extractFromUrl(url);
    
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
      await close();
      console.log('Browser closed successfully');
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    }
  }
}

main();