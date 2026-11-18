import { describe, expect, it } from "vitest";
import { FileEditConflictError, FileEditCoordinator } from "../packages/agent-runtime/src";
import { applyMultiFileEdit, createMultiFileEditTool, MultiFileEditConflictError, type MultiFileEditFileSystem } from "../apps/cli/src/multi-file-edit";

function memoryFs(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  let writes = 0;
  const fs: MultiFileEditFileSystem = {
    async resolveProjectRoot(path) { return path; },
    async resolveTarget(_root, path) { return path; },
    async read(path) { return files.get(path) ?? null; },
    async writeAtomic(path, content) { writes += 1; if (path === "b.ts" && failSecond) throw new Error("simulated disk failure"); files.set(path, content); },
    async remove(path) { files.delete(path); },
  };
  let failSecond = false;
  return { fs, files, setFailSecond(value: boolean) { failSecond = value; }, get writes() { return writes; } };
}

describe("CLI multi-file edit", () => {
  it("applies multiple changes while using the shared FileEditCoordinator", async () => {
    const memory = memoryFs({ "a.ts": "old-a", "b.ts": "old-b" });
    const result = await applyMultiFileEdit([
      { path: "a.ts", expectedContent: "old-a", content: "new-a" },
      { path: "b.ts", expectedContent: "old-b", content: "new-b" },
    ], { projectRoot: "/workspace", coordinator: new FileEditCoordinator(), fileSystem: memory.fs });
    expect(memory.files.get("a.ts")).toBe("new-a");
    expect(memory.files.get("b.ts")).toBe("new-b");
    expect(result.changed.map((item) => item.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("rejects stale expected content before writing any file", async () => {
    const memory = memoryFs({ "a.ts": "changed", "b.ts": "old-b" });
    await expect(applyMultiFileEdit([
      { path: "a.ts", expectedContent: "old-a", content: "new-a" },
      { path: "b.ts", expectedContent: "old-b", content: "new-b" },
    ], { projectRoot: "/workspace", fileSystem: memory.fs })).rejects.toBeInstanceOf(MultiFileEditConflictError);
    expect(memory.writes).toBe(0);
    expect(memory.files.get("b.ts")).toBe("old-b");
  });

  it("rejects traversal, absolute, duplicate, and empty paths", async () => {
    const memory = memoryFs();
    for (const path of ["../outside.ts", "/etc/passwd", "src//a.ts", ""]) {
      await expect(applyMultiFileEdit([{ path, expectedContent: null, content: "x" }], { projectRoot: "/workspace", fileSystem: memory.fs })).rejects.toThrow();
    }
    await expect(applyMultiFileEdit([
      { path: "same.ts", expectedContent: null, content: "a" },
      { path: "same.ts", expectedContent: null, content: "b" },
    ], { projectRoot: "/workspace", fileSystem: memory.fs })).rejects.toThrow("Duplicate edit path");
  });

  it("rolls back already committed files when a later write fails", async () => {
    const memory = memoryFs({ "a.ts": "old-a", "b.ts": "old-b" });
    memory.setFailSecond(true);
    await expect(applyMultiFileEdit([
      { path: "a.ts", expectedContent: "old-a", content: "new-a" },
      { path: "b.ts", expectedContent: "old-b", content: "new-b" },
    ], { projectRoot: "/workspace", fileSystem: memory.fs })).rejects.toThrow("simulated disk failure");
    expect(memory.files.get("a.ts")).toBe("old-a");
    expect(memory.files.get("b.ts")).toBe("old-b");
  });

  it("serializes overlapping edits through the shared coordinator", async () => {
    const memory = memoryFs({ "a.ts": "old" });
    const coordinator = new FileEditCoordinator();
    let release: (() => void) | undefined;
    let entered: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const slowFs: MultiFileEditFileSystem = {
      ...memory.fs,
      async read(path) { entered?.(); await gate; return memory.fs.read(path); },
    };
    const first = applyMultiFileEdit([{ path: "a.ts", expectedContent: "old", content: "first" }], { projectRoot: "/workspace", coordinator, fileSystem: slowFs });
    await started;
    await expect(applyMultiFileEdit([{ path: "a.ts", expectedContent: "old", content: "second" }], { projectRoot: "/workspace", coordinator, fileSystem: memory.fs })).rejects.toBeInstanceOf(FileEditConflictError);
    release?.();
    await first;
  });

  it("exposes the batch operation as a runtime tool", async () => {
    const memory = memoryFs({ "cli.ts": "before" });
    const tool = createMultiFileEditTool({ projectRoot: "/workspace", fileSystem: memory.fs });
    expect(tool.name).toBe("multi_file_edit");
    await tool.execute({ files: [{ path: "cli.ts", expectedContent: "before", content: "after" }] });
    expect(memory.files.get("cli.ts")).toBe("after");
  });
});
