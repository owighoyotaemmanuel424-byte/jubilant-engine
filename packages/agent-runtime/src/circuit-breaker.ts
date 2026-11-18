export type CircuitState = "closed" | "open" | "half-open";
export interface CircuitBreakerOptions { readonly failureThreshold: number; readonly resetTimeoutMs: number; }
export class CircuitBreaker {
  private currentState: CircuitState = "closed";
  private failures = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;
  constructor(private readonly options: CircuitBreakerOptions, private readonly now: () => number = Date.now) {
    if (options.failureThreshold < 1 || options.resetTimeoutMs < 1) throw new RangeError("invalid circuit breaker options");
  }
  get state(): CircuitState {
    if (this.currentState === "open" && this.now() - this.openedAt >= this.options.resetTimeoutMs) return "half-open";
    return this.currentState;
  }
  canRequest(): boolean {
    if (this.currentState === "open" && this.now() - this.openedAt >= this.options.resetTimeoutMs) this.currentState = "half-open";
    if (this.currentState === "open" || (this.currentState === "half-open" && this.halfOpenProbeInFlight)) return false;
    if (this.currentState === "half-open") this.halfOpenProbeInFlight = true;
    return true;
  }
  recordSuccess(): void { this.currentState = "closed"; this.failures = 0; this.halfOpenProbeInFlight = false; }
  recordFailure(): void {
    this.halfOpenProbeInFlight = false;
    this.failures += 1;
    if (this.currentState === "half-open" || this.failures >= this.options.failureThreshold) {
      this.currentState = "open";
      this.openedAt = this.now();
    }
  }
}
