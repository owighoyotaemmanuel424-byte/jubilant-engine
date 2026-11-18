export interface ManagedProcess {
  readonly exited: Promise<number>;
  kill(signal: "SIGTERM" | "SIGKILL"): void;
  /** Wait for every member of the process tree to disappear; escalate if needed. */
  reapTree?(graceMs: number): Promise<void>;
  /** Release external resources such as a sandbox container after process exit. */
  cleanup?(): Promise<void>;
}

export class ProcessAbortedError extends Error {
  constructor() { super("Process cancelled"); this.name = "AbortError"; }
}

export class ProcessTimedOutError extends Error {
  constructor() { super("Process timed out"); this.name = "TimeoutError"; }
}

const DEFAULT_GRACE_MS = 250;
const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class ManagedProcessRegistry {
  private readonly active = new Set<ManagedProcess>();
  get activeCount(): number { return this.active.size; }

  async waitFor(process: ManagedProcess, signal?: AbortSignal, timeoutMs?: number): Promise<number> {
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new RangeError("timeoutMs must be positive");
    this.active.add(process);
    let abortListener: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (signal?.aborted) throw new ProcessAbortedError();

      const interrupted = new Promise<never>((_, reject) => {
        if (signal) {
          abortListener = () => reject(new ProcessAbortedError());
          signal.addEventListener("abort", abortListener, { once: true });
        }
        if (timeoutMs !== undefined) {
          timeout = setTimeout(() => reject(new ProcessTimedOutError()), timeoutMs);
        }
      });

      const exitCode = await Promise.race([process.exited, interrupted]);
      await process.reapTree?.(DEFAULT_GRACE_MS);
      await process.cleanup?.();
      return exitCode;
    } catch (error) {
      if (error instanceof ProcessAbortedError || error instanceof ProcessTimedOutError) {
        await this.terminateAndReap(process);
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (abortListener) signal?.removeEventListener("abort", abortListener);
      this.active.delete(process);
    }
  }

  /** The single reaper used by both cancellation and timeout. */
  private async terminateAndReap(process: ManagedProcess): Promise<void> {
    process.kill("SIGTERM");
    const exited = await Promise.race([
      process.exited.then(() => true, () => true),
      delay(DEFAULT_GRACE_MS).then(() => false),
    ]);
    if (!exited) process.kill("SIGKILL");
    await process.exited.catch(() => -1);
    await process.reapTree?.(DEFAULT_GRACE_MS);
    await process.cleanup?.();
  }
}
