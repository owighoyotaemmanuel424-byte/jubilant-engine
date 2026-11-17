import { describe, expect, it } from "vitest";
import { CircuitBreaker, retryDelayMs } from "../packages/agent-runtime/src/index";
describe("retry jitter bounds", () => {
  const options = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 1_000, jitterRatio: 0.25 };
  it("clamps random samples and keeps jitter within the configured interval", () => {
    for (const sample of [-10, 0, 0.1, 0.5, 0.9, 1, 10]) {
      const delay = retryDelayMs(2, options, () => sample);
      expect(delay).toBeGreaterThanOrEqual(300);
      expect(delay).toBeLessThanOrEqual(500);
    }
  });
  it("caps exponential retry at maxDelayMs", () => {
    expect(retryDelayMs(20, options, () => 1)).toBe(1_000);
  });
});
describe("circuit breaker transitions", () => {
  it("moves closed → open → half-open → closed after a successful probe", () => {
    let now = 100;
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 500 }, () => now);
    expect(breaker.state).toBe("closed");
    breaker.recordFailure();
    expect(breaker.state).toBe("closed");
    breaker.recordFailure();
    expect(breaker.state).toBe("open");
    expect(breaker.canRequest()).toBe(false);
    now += 500;
    expect(breaker.canRequest()).toBe(true);
    expect(breaker.state).toBe("half-open");
    expect(breaker.canRequest()).toBe(false);
    breaker.recordSuccess();
    expect(breaker.state).toBe("closed");
    expect(breaker.canRequest()).toBe(true);
  });
  it("reopens after a failed half-open probe", () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10 }, () => now);
    breaker.recordFailure();
    now = 10;
    expect(breaker.canRequest()).toBe(true);
    breaker.recordFailure();
    expect(breaker.state).toBe("open");
  });
});
