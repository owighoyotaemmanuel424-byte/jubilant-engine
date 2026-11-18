export interface RetryOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
}
export function retryDelayMs(attempt: number, options: RetryOptions, random: () => number = Math.random): number {
  if (!Number.isInteger(attempt) || attempt < 0) throw new RangeError("attempt must be a non-negative integer");
  if (options.maxAttempts < 1 || options.baseDelayMs < 0 || options.maxDelayMs < 0 || options.jitterRatio < 0 || options.jitterRatio > 1) throw new RangeError("invalid retry options");
  const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * (2 ** attempt));
  const sample = Math.min(1, Math.max(0, random()));
  const factor = 1 - options.jitterRatio + (2 * options.jitterRatio * sample);
  return Math.min(options.maxDelayMs, Math.max(0, Math.round(exponential * factor)));
}
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}
