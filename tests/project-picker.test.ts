import { describe, expect, it } from "vitest";
import { discoverProjects, type ProjectPickerAdapters } from "../apps/cli/src/project-picker";

function adapters(input: {
  entries?: readonly { name: string; isDirectory: boolean }[];
  selectedIsRepo?: string | null;
  childRepos?: Readonly<Record<string, string>>;
  denyRead?: string | boolean;
} = {}): ProjectPickerAdapters {
  return {
    fileSystem: {
      async assertReadable(path) { if (input.denyRead === true || input.denyRead === path) throw Object.assign(new Error("denied"), { code: "EACCES" }); },
      async isDirectory() { return true; },
      async resolvePath(path) { return path; },
      async readDirectory() { return input.entries ?? []; },
    },
    git: {
      async findRepositoryRoot(path) {
        if (path === "/workspace") return input.selectedIsRepo ?? null;
        return input.childRepos?.[path] ?? null;
      },
    },
  };
}

describe("project picker", () => {
  it("enumerates immediate child git repositories in stable name order", async () => {
    const result = await discoverProjects("/workspace", adapters({
      entries: [{ name: "zeta", isDirectory: true }, { name: "notes", isDirectory: true }, { name: "alpha", isDirectory: true }],
      childRepos: { "/workspace/zeta": "/workspace/zeta", "/workspace/alpha": "/workspace/alpha" },
    }));
    expect(result.kind).toBe("projects");
    if (result.kind === "projects") expect(result.projects.map((project) => project.name)).toEqual(["alpha", "zeta"]);
  });

  it("returns an explicit empty-directory state", async () => {
    expect(await discoverProjects("/workspace", adapters())).toEqual({ kind: "empty_directory", directory: "/workspace" });
  });

  it("distinguishes a populated non-git directory from an empty directory", async () => {
    const result = await discoverProjects("/workspace", adapters({ entries: [{ name: "notes.txt", isDirectory: false }] }));
    expect(result).toEqual({ kind: "not_git_repository", directory: "/workspace" });
  });

  it("reports permission-denied paths without swallowing them as empty", async () => {
    expect(await discoverProjects("/restricted", adapters({ denyRead: true }))).toEqual({ kind: "permission_denied", path: "/restricted" });
  });

  it("reports a permission-denied child rather than silently omitting it", async () => {
    const result = await discoverProjects("/workspace", adapters({
      entries: [{ name: "private-repo", isDirectory: true }],
      denyRead: "/workspace/private-repo",
    }));
    expect(result).toEqual({ kind: "permission_denied", path: "/workspace/private-repo" });
  });

  it("recognizes the selected directory itself as a repository", async () => {
    const result = await discoverProjects("/workspace", adapters({ selectedIsRepo: "/workspace" }));
    expect(result.kind).toBe("projects");
    if (result.kind === "projects") expect(result.projects).toEqual([{ name: "workspace", path: "/workspace" }]);
  });
});
