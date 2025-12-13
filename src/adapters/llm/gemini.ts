import { env } from "@/config/env.js";
import { logger } from "@/adapters/telemetry/logger.js";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("LLM_TIMEOUT")), ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type GeminiCandidate = { content?: { parts?: Array<{ text?: string }> } };
type GeminiResponse = { candidates?: GeminiCandidate[] };


export type GeminiOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  model?: string;
};

const BASE_DOMAIN = "https://generativelanguage.googleapis.com/v1beta/models";

// Key Management
let currentKeyIndex = 0;

function getApiKey(): string | null {
  if (!env.LLM_API_KEYS || env.LLM_API_KEYS.length === 0) return env.LLM_API_KEY || null;
  return env.LLM_API_KEYS[currentKeyIndex % env.LLM_API_KEYS.length];
}

function rotateKey() {
  if (!env.LLM_API_KEYS || env.LLM_API_KEYS.length <= 1) return;
  currentKeyIndex++;
  logger.warn({ event: 'llm:key_rotated', newIndex: currentKeyIndex % env.LLM_API_KEYS.length }, 'Rotated API Key due to rate limit');
}

let preWarmed = false;

export async function prewarmLlm(): Promise<void> {
  if (preWarmed || !env.LLM_API_KEY) return;

  try {
    const model = env.LLM_MODEL;
    // Use getApiKey()
    const currentKey = getApiKey();
    if (!currentKey) return;

    const url = `${BASE_DOMAIN}/${model}:generateContent?key=${encodeURIComponent(currentKey)}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 1 }
    };

    await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }),
      2000
    );
    preWarmed = true;
    logger.debug({ event: 'llm:prewarm:success' }, 'LLM connection pre-warmed');
  } catch {
    logger.debug({ event: 'llm:prewarm:failed' }, 'LLM pre-warm failed (non-critical)');
  }
}

async function callGeminiOnce(prompt: string, options: GeminiOptions): Promise<string | null> {
  if (!env.LLM_API_KEY) return null;

  const model = options.model || env.LLM_MODEL;
  const timeoutMs = options.timeoutMs ?? 20000;

  const currentKey = getApiKey();
  if (!currentKey) return null;

  const url = `${BASE_DOMAIN}/${model}:streamGenerateContent?key=${encodeURIComponent(currentKey)}&alt=sse`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
      topP: 0.8,
      topK: 40
    }
  };

  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }),
    options.timeoutMs ?? 20000
  );

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("LLM_RATE_LIMIT");
    }
    logger.warn({ event: 'llm:api_error', status: res.status, statusText: res.statusText }, 'Gemini API error');
    return null;
  }
  if (!res.body) return null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let jsonFound = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6);
        if (jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr) as GeminiResponse;
          const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            accumulated += text;
            if (!jsonFound && accumulated.includes('{') && accumulated.includes('}')) {
              jsonFound = true;
              const start = accumulated.indexOf('{');
              const end = accumulated.lastIndexOf('}');
              if (start < end) {
                await reader.cancel();
                return accumulated.substring(start, end + 1);
              }
            }
          }
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated || null;
}

export async function callGemini(prompt: string, options: GeminiOptions = {}): Promise<string | null> {
  if (!env.LLM_API_KEY) return null;

  const maxRetries = options.maxRetries ?? 2;
  const timeoutMs = options.timeoutMs ?? 20000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callGeminiOnce(prompt, options);
      if (result) {
        logger.debug({ event: 'llm:success', attempt, model: options.model || env.LLM_MODEL }, 'LLM call succeeded');
        return result;
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "LLM_TIMEOUT";
      const isRateLimit = error instanceof Error && error.message === "LLM_RATE_LIMIT";

      if (isRateLimit) {
        rotateKey();
        logger.warn({ event: 'llm:rate_limit_handled', attempt }, 'Rate limit handled via key rotation');
      }

      logger.debug({ event: 'llm:error', attempt, isTimeout, isRateLimit, error: error instanceof Error ? error.message : String(error) }, 'LLM call failed');

      if (attempt < maxRetries) {
        const backoff = 100 * Math.pow(2, attempt);
        await sleep(backoff);
        logger.debug({ event: 'llm:retry', attempt: attempt + 1, backoffMs: backoff }, 'Retrying LLM call');
      }
    }
  }

  return null;
}

