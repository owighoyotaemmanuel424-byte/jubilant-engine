import { spawn } from "node:child_process";
import { ManagedProcessRegistry, type ManagedProcess } from "../../agent-runtime/src/managed-process";
export interface SandboxCommandOptions { readonly cwd: string; readonly env?: Readonly<Record<string, string>>; readonly signal?: AbortSignal; }
const registry = new ManagedProcessRegistry();
export async function runSandboxCommand(command: readonly string[], options: SandboxCommandOptions): Promise<number> {
  if (command.length === 0 || command.some((part) => part.length === 0)) throw new Error("Command must contain a program and non-empty arguments");
  const program = command[0];
  if (program === undefined) throw new Error("Missing executable");
  const child = spawn(program, command.slice(1), { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: "ignore" });
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? -1));
  });
  const managed: ManagedProcess = { exited, kill: (signal) => { child.kill(signal); } };
  return registry.waitFor(managed, options.signal);
}
