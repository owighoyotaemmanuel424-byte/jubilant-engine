import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { ManagedProcessRegistry, type ManagedProcess } from "../packages/agent-runtime/src/managed-process";
describe("real subprocess cancellation integration", () => {
  it("terminates and drains an actual OS subprocess after cancellation", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    const exited = new Promise<number>((resolve, reject) => { child.once("error", reject); child.once("exit", (code) => resolve(code ?? -1)); });
    const managed: ManagedProcess = { exited, kill: (signal) => { child.kill(signal); } };
    const registry = new ManagedProcessRegistry();
    const controller = new AbortController();
    const pending = registry.waitFor(managed, controller.signal);
    setTimeout(() => controller.abort(), 30);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await exited;
    expect(registry.activeCount).toBe(0);
  });
});
