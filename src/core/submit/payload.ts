import type { SolveResult } from "@/types/solve.js";

function toAnswerValue(r: SolveResult): unknown {
  if (r.kind === "number") return r.value;
  if (r.kind === "string") return r.value;
  if (r.kind === "boolean") return r.value;
  return r.value;
}

export function buildPayload(email: string, secret: string, url: string, result: SolveResult) {
  return {
    email,
    secret,
    url,
    answer: toAnswerValue(result)
  };
}
