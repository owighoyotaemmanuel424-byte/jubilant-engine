export class FileEditConflictError extends Error {
  constructor(readonly paths: readonly string[]) { super(`File edit conflict: ${paths.join(", ")}`); this.name = "FileEditConflictError"; }
}
export class FileEditCoordinator {
  private readonly locked = new Set<string>();
  async withFileLocks<T>(paths: readonly string[], operation: () => Promise<T> | T): Promise<T> {
    const normalized = [...new Set(paths.map((path) => path.replaceAll("\\", "/").replace(/^\.\//, "")))].sort();
    if (normalized.length === 0 || normalized.some((path) => path.length === 0 || path.startsWith("/") || path.split("/").includes(".."))) throw new Error("Invalid file lock path");
    const conflicts = normalized.filter((path) => this.locked.has(path));
    if (conflicts.length > 0) throw new FileEditConflictError(conflicts);
    for (const path of normalized) this.locked.add(path);
    try { return await operation(); }
    finally { for (const path of normalized) this.locked.delete(path); }
  }
}
