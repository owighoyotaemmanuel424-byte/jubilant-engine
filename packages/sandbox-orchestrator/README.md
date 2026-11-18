# Sandbox Orchestrator

Runs terminal commands inside an isolated Docker container. The broker is POSIX-host-only today because process-tree cancellation uses detached process groups.

## Execution contract

`runSandboxCommand(command, options)` accepts an argument array (never shell-interpolates it) and a `cwd` inside `/workspace`. It returns exit code plus separately captured stdout/stderr. Optional `onOutputFrame` receives complete newline-terminated records tagged as `stdout` or `stderr`; command output is never written directly to the CLI/agent process stdout. Unterminated trailing lines are intentionally not emitted as frames.

## Isolation boundary

Each invocation creates an ephemeral container with:

- read-only container root filesystem;
- writable `/workspace` and `/tmp` tmpfs mounts only;
- no network;
- all Linux capabilities dropped and `no-new-privileges`;
- unprivileged `runner` user;
- PID, memory, and CPU limits;
- no host project bind mounts or host filesystem write access.

The sandbox image is built by CI as `freebuff-sandbox:ci`. Override it with `FREEBUFF_SANDBOX_IMAGE` when using a separately built image.

## Cancellation and timeout

Commands run in detached POSIX process groups. Cancellation and timeout share the same reaper: signal the whole process group with SIGTERM, wait for the grace period, escalate to SIGKILL, wait for the group to disappear, then remove the Docker container. This prevents the parent-exits/child-orphans failure mode.

## Verification

`tests/terminal-broker.integration.test.ts` covers shell-plus-child termination, timeout reaping, active agent-stream framing, tmpfs write confinement, sudo/mount denial, cancellation during a partial output line, and container cleanup.
