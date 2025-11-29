import type { JsonData } from "@/types/data.js";

export function parseJson(input: string): JsonData {
  return JSON.parse(input);
}
