import { config as loadEnv } from "dotenv";
loadEnv();
import { randomBytes, timingSafeEqual } from "node:crypto";

const required = ["SECRET_KEY", "NODE_ENV"] as const;
for (const k of required) {
  if (!process.env[k]) throw new Error(`Missing env ${k}`);
}

const secretBuf = Buffer.from(process.env.SECRET_KEY as string);
if (secretBuf.length === 0) throw new Error("Invalid SECRET_KEY");

export const env = {
  NODE_ENV: process.env.NODE_ENV as "development" | "production" | "test",
  SECRET_KEY: process.env.SECRET_KEY as string,
  BROWSER_PATH: process.env.BROWSER_PATH || "",
  HEADLESS: (process.env.HEADLESS || "true").toLowerCase() !== "false"
};

export function safeEqualsSecret(input: string): boolean {
  const inputBuf = Buffer.from(input);
  const a = inputBuf.length === secretBuf.length ? inputBuf : Buffer.concat([inputBuf, randomBytes(secretBuf.length - inputBuf.length)]);
  const b = secretBuf.length === inputBuf.length ? secretBuf : secretBuf.subarray(0, a.length);
  return timingSafeEqual(a, b);
}
