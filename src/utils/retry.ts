import { logger } from '@/adapters/telemetry/logger.js';

export async function retry<T>(
  fn: () => Promise<T>,
  attempts: number,
  delayMs: number
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastError = e instanceof Error ? e : new Error(String(e));
      logger.warn(
        { attempt: i + 1, total: attempts, err: lastError.message },
        'Retryable operation failed'
      );
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError ?? new Error('Retry failed after all attempts');
}
