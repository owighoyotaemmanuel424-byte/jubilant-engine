import { describe, expect, it } from "vitest";
import { FileEditConflictError, FileEditCoordinator, ManagedProcessRegistry } from "../packages/agent-runtime/src";
describe("parallel subagent file coordination", () => {
  it("allows concurrent disjoint file edits", async () => {
    const coordinator = new FileEditCoordinator(); let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = coordinator.withFileLocks(["src/a.ts"], async () => { await gate; return "a"; });
    const second = coordinator.withFileLocks(["src/b.ts"], async () => "b");
    expect(await second).toBe("b"); release?.(); expect(await first).toBe("a");
  });
  it("rejects overlapping edits while a lock is held", async () => {
    const coordinator = new FileEditCoordinator(); let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = coordinator.withFileLocks(["src/shared.ts"], async () => { await gate; });
    await Promise.resolve();
    await expect(coordinator.withFileLocks(["src/shared.ts"], async () => undefined)).rejects.toBeInstanceOf(FileEditConflictError);
    release?.(); await first;
  });
});
describe("mid-stream cancellation cleanup", () => {
  it("kills and drains a managed subprocess before returning cancellation", async () => {
    const registry = new ManagedProcessRegistry(); let finish: ((code: number) => void) | undefined; let killed = false;
    const process = { exited: new Promise<number>((resolve) => { finish = resolve; }), kill: () => { killed = true; finish?.(143); } };
    const controller = new AbortController(); const waiting = registry.waitFor(process, controller.signal);
    expect(registry.activeCount).toBe(1); controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(killed).toBe(true); expect(registry.activeCount).toBe(0);
  });
});
