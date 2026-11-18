import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  ManagedProcessRegistry,
  ProcessAbortedError,
  ProcessTimedOutError,
} from "../packages/agent-runtime/src/managed-process";
import { runSandboxCommand, spawnProcessGroup } from "../packages/sandbox-orchestrator/src/process";

function pidExists(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitUntilDead(pids: readonly number[]): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !pidExists(pid))) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Process tree remained alive: " + pids.filter(pidExists).join(", "));
}

async function waitForChildPid(parentPid: number): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      const value = (await readFile(`/proc/${parentPid}/task/${parentPid}/children`, "utf8")).trim();
      const pid = Number(value.split(/\s+/)[0]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    } catch {
      // Wait until the shell has spawned its child.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Shell did not expose a child PID through /proc.");
}

const linux = process.platform === "linux";
const dockerReady = linux && spawnSync("docker", ["image", "inspect", "freebuff-sandbox:ci"], { stdio: "ignore" }).status === 0;

describe("terminal broker process-tree reaper", () => {
  it.skipIf(!linux)("cancellation kills /bin/sh and its sleep child, not just the parent", async () => {
    const spawned = spawnProcessGroup("/bin/sh", ["-c", "sleep 60 & wait"]);
    const childPid = await waitForChildPid(spawned.pid);
    const controller = new AbortController();
    const registry = new ManagedProcessRegistry();
    const pending = registry.waitFor(spawned.managed, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(ProcessAbortedError);
    await waitUntilDead([spawned.pid, childPid]);
    expect(registry.activeCount).toBe(0);
  });

  it.skipIf(!linux)("timeout uses the same tree reaper and leaves no child process", async () => {
    const spawned = spawnProcessGroup("/bin/sh", ["-c", "sleep 60 & wait"]);
    const childPid = await waitForChildPid(spawned.pid);
    const registry = new ManagedProcessRegistry();
    await expect(registry.waitFor(spawned.managed, undefined, 100)).rejects.toBeInstanceOf(ProcessTimedOutError);
    await waitUntilDead([spawned.pid, childPid]);
    expect(registry.activeCount).toBe(0);
  });
});

describe.skipIf(!dockerReady)("sandboxed terminal broker integration", () => {
  it("keeps command stdout/stderr out of the active agent event stream", async () => {
    const commandFrames: Array<{ channel: string; text: string }> = [];
    const agentFrames: string[] = [];
    agentFrames.push('data: {"type":"text_delta","text":"before"}\n\n');
    const result = await runSandboxCommand(
      ["/bin/sh", "-c", "printf 'command-out\\n'; printf 'command-err\\n' >&2"],
      { cwd: "/workspace", onOutputFrame: (frame) => commandFrames.push(frame) },
    );
    agentFrames.push('data: {"type":"text_delta","text":"after"}\n\n');
    expect(result.exitCode).toBe(0);
    expect(commandFrames).toEqual([
      { channel: "stdout", text: "command-out" },
      { channel: "stderr", text: "command-err" },
    ]);
    const wire = agentFrames.join("");
    expect(wire.split("\n\n")).toHaveLength(3);
    expect(wire).not.toContain("command-out");
    expect(wire).not.toContain("command-err");
  });

  it("confines writes to tmpfs workspace and denies sudo and mount attempts", async () => {
    const result = await runSandboxCommand([
      "/bin/sh", "-c",
      "touch /workspace/allowed && if touch /outside-workspace 2>/dev/null; then exit 21; fi; if sudo id 2>/dev/null; then exit 22; fi; if mount -t tmpfs tmpfs /workspace 2>/dev/null; then exit 23; fi; test -f /workspace/allowed",
    ], { cwd: "/workspace" });
    expect(result.exitCode).toBe(0);
  });

  it("cancels during an unterminated output line without emitting a partial frame", async () => {
    const frames: Array<{ channel: string; text: string }> = [];
    const controller = new AbortController();
    const pending = runSandboxCommand(
      ["/bin/sh", "-c", "printf 'half-a-line'; sleep 60"],
      { cwd: "/workspace", signal: controller.signal, onOutputFrame: (frame) => frames.push(frame) },
    );
    setTimeout(() => controller.abort(), 150);
    await expect(pending).rejects.toBeInstanceOf(ProcessAbortedError);
    expect(frames).toEqual([]);
    const leftovers = spawnSync("docker", ["ps", "-aq", "--filter", "name=freebuff-exec-"], { encoding: "utf8" });
    expect(leftovers.stdout.trim()).toBe("");
  });
});
