import { lstat, open, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { FileEditCoordinator } from "../../../packages/agent-runtime/src/file-edit-coordinator";
import type { RuntimeTool } from "../../../packages/agent-runtime/src/agent-loop";

export const MAX_MULTI_FILE_COUNT = 20;
export const MAX_FILE_BYTES = 1_000_000;
export const MAX_TOTAL_BYTES = 5_000_000;

export interface MultiFileEdit {
  readonly path: string;
  readonly expectedContent: string | null;
  readonly content: string;
}

export interface MultiFileEditFileSystem {
  resolveProjectRoot(path: string): Promise<string>;
  resolveTarget(projectRoot: string, relativePath: string): Promise<string>;
  read(path: string): Promise<string | null>;
  writeAtomic(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface MultiFileEditOptions {
  readonly projectRoot: string;
  readonly coordinator?: FileEditCoordinator;
  readonly fileSystem?: MultiFileEditFileSystem;
}

export interface MultiFileEditResult {
  readonly changed: readonly { readonly path: string; readonly bytes: number }[];
  readonly totalBytes: number;
}

export class MultiFileEditConflictError extends Error {
  constructor(readonly path: string, message = "File changed since it was read") {
    super(`${message}: ${path}`);
    this.name = "MultiFileEditConflictError";
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function normalizeRelativePath(path: string): string {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0") || isAbsolute(path)) {
    throw new TypeError("Edit paths must be non-empty relative paths.");
  }
  const normalized = path.replaceAll("\\", "/");
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError(`Unsafe edit path: ${path}`);
  }
  return parts.join("/");
}

const sharedFileEditCoordinator = new FileEditCoordinator();

const nodeFileSystem: MultiFileEditFileSystem = {
  async resolveProjectRoot(path) { return realpath(path); },
  async resolveTarget(projectRoot, relativePath) {
    const root = await realpath(projectRoot);
    const target = resolve(root, relativePath);
    const rel = relative(root, target);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new TypeError(`Edit path escapes the project: ${relativePath}`);
    }
    const parent = await realpath(dirname(target));
    const parentRelative = relative(root, parent);
    if (parentRelative === ".." || parentRelative.startsWith(`..${sep}`) || isAbsolute(parentRelative)) {
      throw new TypeError(`Edit parent escapes the project: ${relativePath}`);
    }
    try {
      if ((await lstat(target)).isSymbolicLink()) throw new TypeError(`Symbolic-link edits are not allowed: ${relativePath}`);
    } catch (error) { if (!isMissing(error)) throw error; }
    return target;
  },
  async read(path) {
    try { return await readFile(path, "utf8"); }
    catch (error) { if (isMissing(error)) return null; throw error; }
  },
  async writeAtomic(path, content) {
    const temp = join(dirname(path), `.freebuff-${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      let mode = 0o600;
      try { mode = (await stat(path)).mode & 0o777; } catch (error) { if (!isMissing(error)) throw error; }
      handle = await open(temp, "wx", mode);
      await handle.writeFile(content, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temp, path);
    } catch (error) {
      if (handle) await handle.close();
      try { await unlink(temp); } catch (cleanupError) { if (!isMissing(cleanupError)) throw new AggregateError([error, cleanupError], "Atomic write and temporary-file cleanup failed"); }
      throw error;
    }
  },
  async remove(path) { try { await unlink(path); } catch (error) { if (!isMissing(error)) throw error; } },
};

function validateEdits(edits: readonly MultiFileEdit[]): { readonly edits: readonly MultiFileEdit[]; readonly totalBytes: number } {
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > MAX_MULTI_FILE_COUNT) {
    throw new RangeError(`A multi-file edit must contain 1 to ${MAX_MULTI_FILE_COUNT} files.`);
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const normalized = edits.map((edit) => {
    if (!edit || typeof edit !== "object" || typeof edit.content !== "string" || !(typeof edit.expectedContent === "string" || edit.expectedContent === null)) {
      throw new TypeError("Each edit requires path, expectedContent, and content.");
    }
    const path = normalizeRelativePath(edit.path);
    if (seen.has(path)) throw new TypeError(`Duplicate edit path: ${path}`);
    seen.add(path);
    const bytes = Buffer.byteLength(edit.content, "utf8");
    if (bytes > MAX_FILE_BYTES) throw new RangeError(`File exceeds ${MAX_FILE_BYTES} bytes: ${path}`);
    totalBytes += bytes;
    return { path, expectedContent: edit.expectedContent, content: edit.content };
  });
  if (totalBytes > MAX_TOTAL_BYTES) throw new RangeError(`Multi-file edit exceeds ${MAX_TOTAL_BYTES} total bytes.`);
  return { edits: normalized, totalBytes };
}

/** Applies a validated batch under the shared runtime locks and rolls back prior writes on failure. */
export async function applyMultiFileEdit(
  edits: readonly MultiFileEdit[],
  options: MultiFileEditOptions,
): Promise<MultiFileEditResult> {
  const validated = validateEdits(edits);
  const coordinator = options.coordinator ?? sharedFileEditCoordinator;
  const fileSystem = options.fileSystem ?? nodeFileSystem;
  const root = await fileSystem.resolveProjectRoot(options.projectRoot);
  return coordinator.withFileLocks(validated.edits.map((edit) => edit.path), async () => {
    const resolved = await Promise.all(validated.edits.map(async (edit) => ({ edit, target: await fileSystem.resolveTarget(root, edit.path) })));
    const originals = await Promise.all(resolved.map(async ({ edit, target }) => ({ edit, target, original: await fileSystem.read(target) })));
    for (const item of originals) {
      if (item.original !== item.edit.expectedContent) throw new MultiFileEditConflictError(item.edit.path);
    }
    const committed: typeof originals = [];
    try {
      for (const item of originals) {
        await fileSystem.writeAtomic(item.target, item.edit.content);
        committed.push(item);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const item of committed.reverse()) {
        try {
          if (item.original === null) await fileSystem.remove(item.target);
          else await fileSystem.writeAtomic(item.target, item.original);
        } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      }
      if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], "Multi-file edit failed and rollback was incomplete");
      throw error;
    }
    return {
      changed: originals.map(({ edit }) => ({ path: edit.path, bytes: Buffer.byteLength(edit.content, "utf8") })),
      totalBytes: validated.totalBytes,
    };
  });
}

export function createMultiFileEditTool(options: MultiFileEditOptions): RuntimeTool {
  return {
    name: "multi_file_edit",
    async execute(input) {
      if (!Array.isArray(input["files"])) throw new TypeError("multi_file_edit requires a files array.");
      const result = await applyMultiFileEdit(input["files"] as MultiFileEdit[], options);
      return { changed: result.changed, totalBytes: result.totalBytes };
    },
  };
}
