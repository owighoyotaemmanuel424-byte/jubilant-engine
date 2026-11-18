export interface ManagedProcess { readonly exited: Promise<number>; kill(signal: "SIGTERM" | "SIGKILL"): void; }
export class ProcessAbortedError extends Error { constructor() { super("Process cancelled"); this.name = "AbortError"; } }
export class ManagedProcessRegistry {
  private readonly active = new Set<ManagedProcess>();
  get activeCount(): number { return this.active.size; }
  async waitFor(process: ManagedProcess, signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) { process.kill("SIGTERM"); await process.exited; throw new ProcessAbortedError(); }
    this.active.add(process);
    let abortListener: (() => void) | undefined;
    let escalation: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!signal) return await process.exited;
      const cancelled = new Promise<never>((_, reject) => {
        abortListener = () => {
          reject(new ProcessAbortedError());
          escalation = setTimeout(() => process.kill("SIGKILL"), 250);
          process.kill("SIGTERM");
        };
        signal.addEventListener("abort", abortListener, { once: true });
      });
      return await Promise.race([process.exited, cancelled]);
    } catch (error) {
      if (error instanceof ProcessAbortedError) await process.exited;
      throw error;
    } finally {
      if (escalation) clearTimeout(escalation);
      if (abortListener) signal?.removeEventListener("abort", abortListener);
      this.active.delete(process);
    }
  }
}
