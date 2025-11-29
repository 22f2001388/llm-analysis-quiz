import { retry } from "@/utils/retry.js";

type SubmitResponse = { correct?: boolean; url?: string; reason?: string };

export async function submitAnswer(submitUrl: string, payload: unknown): Promise<SubmitResponse> {
  return retry(async () => {
    const res = await fetch(submitUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`Submit failed: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    try {
      const json = JSON.parse(text) as SubmitResponse;
      return json;
    } catch {
      return {};
    }
  }, 3, 1000);
}
