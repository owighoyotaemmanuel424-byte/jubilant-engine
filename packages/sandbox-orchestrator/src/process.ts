import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { posix as path } from "node:path";
import { ManagedProcessRegistry, type ManagedProcess } from "../../agent-runtime/src/managed-process";

export interface SandboxOutputFrame {
  readonly channel: "stdout" | "stderr";
  readonly text: string;
}

export interface SandboxCommandOptions {
  /** Absolute path inside the isolated /workspace tmpfs, never a host path. */
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly sandboxImage?: string;
  readonly maxOutputBytes?: number;
  /** Receives complete newline-terminated lines only; never writes to process stdout. */
  readonly onOutputFrame?: (frame: SandboxOutputFrame) => void;
}

export interface SandboxCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SpawnedProcessGroup {
  readonly child: ChildProcess;
  readonly managed: ManagedProcess;
  readonly pid: number;
}

const registry = new ManagedProcessRegistry();

function groupExists(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForGroupGone(pgid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!groupExists(pgid)) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  return !groupExists(pgid);
}

/** Spawn a detached POSIX process group so cancellation can signal the whole tree. */
export function spawnProcessGroup(program: string, args: readonly string[], options: SpawnOptions = {}): SpawnedProcessGroup {
  if (process.platform === "win32") throw new Error("Process-group broker currently requires a POSIX host.");
  const child = spawn(program, [...args], { ...options, detached: true, stdio: options.stdio ?? ["ignore", "pipe", "pipe"] });
  if (!child.pid) throw new Error("Unable to start managed process.");
  const pid = child.pid;
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? -1));
  });
  const managed: ManagedProcess = {
    exited,
    kill: (signal) => {
      try { process.kill(-pid, signal); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    },
    async reapTree(graceMs) {
      if (await waitForGroupGone(pid, graceMs)) return;
      try { process.kill(-pid, "SIGKILL"); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
      if (!await waitForGroupGone(pid, 5_000)) throw new Error("Process group did not exit after SIGKILL.");
    },
  };
  return { child, managed, pid };
}

function workspacePath(cwd: string): string {
  const normalized = path.normalize(cwd);
  if (!normalized.startsWith("/workspace/") && normalized !== "/workspace") {
    throw new Error("Sandbox cwd must remain inside /workspace.");
  }
  if (normalized.split("/").includes("..")) throw new Error("Sandbox cwd traversal is not allowed.");
  return normalized;
}

function emitCompleteLines(
  channel: "stdout" | "stderr",
  chunk: string,
  pending: string,
  emit: ((frame: SandboxOutputFrame) => void) | undefined,
): string {
  const combined = pending + chunk;
  const lines = combined.split("\n");
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (text.length > 0) emit?.({ channel, text });
  }
  return remainder;
}

function runDockerCleanup(containerName: string): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = spawn("docker", ["rm", "-f", containerName], { stdio: "ignore" });
    cleanup.once("error", () => resolve());
    cleanup.once("exit", () => resolve());
  });
}

export async function runSandboxCommand(
  command: readonly string[],
  options: SandboxCommandOptions,
): Promise<SandboxCommandResult> {
  if (command.length === 0 || command.some((part) => part.length === 0)) {
    throw new Error("Command must contain a program and non-empty arguments");
  }
  const program = command[0];
  if (program === undefined) throw new Error("Missing executable");
  const cwd = workspacePath(options.cwd);
  const image = options.sandboxImage ?? process.env["FREEBUFF_SANDBOX_IMAGE"] ?? "freebuff-sandbox:ci";
  const containerName = "freebuff-exec-" + randomUUID();
  const args = [
    "run", "--rm", "--name", containerName,
    "--network", "none",
    "--read-only",
    "--tmpfs", "/workspace:rw,noexec,nosuid,size=64m",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
    "--workdir", cwd,
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--pids-limit", "64",
    "--memory", "256m",
    "--cpus", "1",
    "--user", "runner",
  ];
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("\0")) {
      throw new Error("Invalid sandbox environment entry.");
    }
    args.push("--env", key + "=" + value);
  }
  args.push(image, program, ...command.slice(1));

  const { child, managed } = spawnProcessGroup("docker", args);
  let stdout = "";
  let stderr = "";
  let stdoutPending = "";
  let stderrPending = "";
  let outputBytes = 0;
  let outputOverflow = false;
  let callbackError: unknown;
  const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;

  child.stdout?.on("data", (chunk: Buffer) => {
    const value = chunk.toString("utf8");
    outputBytes += Buffer.byteLength(value);
    stdout += value;
    stdoutPending = emitCompleteLines("stdout", value, stdoutPending, (frame) => {
      try { options.onOutputFrame?.(frame); } catch (error) { callbackError = error; }
    });
    if (outputBytes > maxOutputBytes && !outputOverflow) {
      outputOverflow = true;
      managed.kill("SIGTERM");
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const value = chunk.toString("utf8");
    outputBytes += Buffer.byteLength(value);
    stderr += value;
    stderrPending = emitCompleteLines("stderr", value, stderrPending, (frame) => {
      try { options.onOutputFrame?.(frame); } catch (error) { callbackError = error; }
    });
    if (outputBytes > maxOutputBytes && !outputOverflow) {
      outputOverflow = true;
      managed.kill("SIGTERM");
    }
  });

  const managedWithCleanup: ManagedProcess = {
    ...managed,
    cleanup: () => runDockerCleanup(containerName),
  };
  const exitCode = await registry.waitFor(managedWithCleanup, options.signal, options.timeoutMs);
  // Deliberately do not emit unterminated trailing buffers: cancellation mid-line
  // must never leak a partial output frame into the agent event stream.
  stdoutPending = "";
  stderrPending = "";
  void stdoutPending;
  void stderrPending;
  if (outputOverflow) throw new RangeError("Sandbox command output exceeded the configured limit.");
  if (callbackError) throw callbackError;
  return { exitCode, stdout, stderr };
}
