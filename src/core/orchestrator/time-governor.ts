export type Timer = { t0: number };

export function startTimer(): Timer {
  return { t0: Date.now() };
}

export function elapsedMs(t: Timer): number {
  return Date.now() - t.t0;
}

export function remainingMs(t: Timer, totalMs: number): number {
  const rem = totalMs - elapsedMs(t);
  return rem > 0 ? rem : 0;
}

export function canStart(t: Timer, totalMs: number, minStartMs: number): boolean {
  return remainingMs(t, totalMs) >= minStartMs;
}
