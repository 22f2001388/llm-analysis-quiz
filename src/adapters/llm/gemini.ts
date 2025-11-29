import { env } from "@/config/env.js";

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

type GeminiCandidate = { content?: { parts?: Array<{ text?: string }> } };
type GeminiResponse = { candidates?: GeminiCandidate[] };

export async function callGemini(prompt: string, timeoutMs = 20000): Promise<string | null> {
  if (!env.LLM_API_KEY) return null;

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(env.LLM_API_KEY);

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt } as const] }],
    generationConfig: { 
      temperature: 0.3,
      maxOutputTokens: 1024,
      topP: 0.8,
      topK: 40
    }
  };

  try {
    const res = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }),
      timeoutMs
    );

    if (!res.ok) return null;
    const json = (await res.json()) as unknown as GeminiResponse;
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    return typeof text === "string" ? text : null;
  } catch (error) {
    // Distinguish between timeout and other errors for better debugging
    if (error instanceof Error && error.message === "LLM_TIMEOUT") {
      // Log timeout specifically
      return null;
    }
    // Log other errors but don't expose details
    return null;
  }
}
