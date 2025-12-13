import { config as loadEnv } from "dotenv";
loadEnv({ quiet: true });
import { timingSafeEqual } from "node:crypto";

const required = ["SECRET_KEY", "NODE_ENV", "EMAIL"] as const;
for (const k of required) {
  if (!process.env[k]) throw new Error(`Missing env ${k}`);
}
if (!process.env.LLM_API_KEY) {
  console.warn("LLM_API_KEY not set; LLM advisor will be unavailable");
}

const secret = Buffer.from(process.env.SECRET_KEY as string);
const email = process.env.EMAIL as string;
if (secret.length === 0) throw new Error("Invalid SECRET_KEY");
if (!email) throw new Error("Invalid EMAIL");

export const env = {
  NODE_ENV: process.env.NODE_ENV as "development" | "production" | "test",
  SECRET_KEY: process.env.SECRET_KEY as string,
  EMAIL: process.env.EMAIL as string,
  LLM_API_KEY: process.env.LLM_API_KEY as string,
  LLM_API_KEYS: (process.env.LLM_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean),
  LLM_MODEL: (process.env.LLM_MODEL || "gemma-3-27b-it-it") as string,
  HEADLESS: (process.env.HEADLESS || "true").toLowerCase() !== "false",
  LIGHTWEIGHT_BROWSER: (process.env.LIGHTWEIGHT_BROWSER || "true").toLowerCase() !== "false"
};

const SUPPORTED_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemma-3-1b",
  "gemma-3-2b",
  "gemma-3-4b",
  "gemma-3-12b",
  "gemma-3-27b-it"
];

if (!SUPPORTED_MODELS.includes(env.LLM_MODEL)) {
  console.warn(`Warning: LLM_MODEL "${env.LLM_MODEL}" is not in the supported list: ${SUPPORTED_MODELS.join(", ")}`);
}

export function safeEqualsSecret(input: string): boolean {
  const probe = Buffer.from(input);
  if (probe.length !== secret.length) {
    const dummy = Buffer.alloc(secret.length, 0);
    try {
      timingSafeEqual(dummy, secret);
    } catch {
      // Ignore error
    }
    return false;
  }
  try {
    return timingSafeEqual(probe, secret);
  } catch {
    return false;
  }
}

export function safeEqualsEmail(input: string): boolean {
  if (typeof input !== 'string' || typeof email !== 'string') {
    return false;
  }

  const inputLower = input.toLowerCase();
  const emailLower = email.toLowerCase();

  // Use timing-safe comparison for emails
  if (inputLower.length !== emailLower.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(inputLower), Buffer.from(emailLower));
  } catch {
    // Fallback to regular comparison if timingSafeEqual fails
    return inputLower === emailLower;
  }
}
