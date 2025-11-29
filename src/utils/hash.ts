import { createHash } from "node:crypto";


export function urlHash(input: string, bytes = 6): string {
  const hex = createHash("sha256").update(input).digest("hex");
  return hex.slice(0, bytes * 2);
}
