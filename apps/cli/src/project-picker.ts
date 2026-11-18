import { constants } from "node:fs";
import { access, readdir, realpath, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export interface ProjectDirectoryEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}

export interface ProjectPickerFileSystem {
  assertReadable(path: string): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  resolvePath(path: string): Promise<string>;
  readDirectory(path: string): Promise<readonly ProjectDirectoryEntry[]>;
}

export interface GitRepositoryInspector {
  findRepositoryRoot(path: string): Promise<string | null>;
}

export interface ProjectPickerAdapters {
  readonly fileSystem: ProjectPickerFileSystem;
  readonly git: GitRepositoryInspector;
}

export interface DiscoveredProject {
  readonly name: string;
  readonly path: string;
}

export type ProjectPickerResult =
  | { readonly kind: "projects"; readonly directory: string; readonly projects: readonly DiscoveredProject[] }
  | { readonly kind: "empty_directory"; readonly directory: string }
  | { readonly kind: "not_git_repository"; readonly directory: string }
  | { readonly kind: "permission_denied"; readonly path: string }
  | { readonly kind: "not_a_directory"; readonly path: string };

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function isPermissionError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "EACCES" || code === "EPERM";
}

const defaultAdapters: ProjectPickerAdapters = {
  fileSystem: {
    async assertReadable(path) { await access(path, constants.R_OK); },
    async isDirectory(path) { return (await stat(path)).isDirectory(); },
    async resolvePath(path) { return realpath(path); },
    async readDirectory(path) {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    },
  },
  git: {
    async findRepositoryRoot(path) {
      try {
        const result = await execFileAsync("git", ["-C", path, "rev-parse", "--show-toplevel"], { timeout: 3_000 });
        return result.stdout.trim() || null;
      } catch (error) {
        if (isPermissionError(error)) throw error;
        return null;
      }
    },
  },
};

/**
 * Finds the selected directory if it is a repository, otherwise enumerates
 * immediate child repositories. No recursive walk or shell interpolation is used.
 */
export async function discoverProjects(
  selectedPath: string,
  adapters: ProjectPickerAdapters = defaultAdapters,
): Promise<ProjectPickerResult> {
  let directory: string;
  try {
    await adapters.fileSystem.assertReadable(selectedPath);
    if (!(await adapters.fileSystem.isDirectory(selectedPath))) {
      return { kind: "not_a_directory", path: selectedPath };
    }
    directory = await adapters.fileSystem.resolvePath(selectedPath);
    const selectedRepository = await adapters.git.findRepositoryRoot(directory);
    if (selectedRepository !== null) {
      return {
        kind: "projects",
        directory,
        projects: [{ name: selectedRepository.split(/[\\/]/).filter(Boolean).at(-1) ?? selectedRepository, path: selectedRepository }],
      };
    }
    const entries = await adapters.fileSystem.readDirectory(directory);
    if (entries.length === 0) return { kind: "empty_directory", directory };
    const childDirectories = entries.filter((entry) => entry.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
    const projects: DiscoveredProject[] = [];
    for (const entry of childDirectories) {
      const childPath = join(directory, entry.name);
      try {
        await adapters.fileSystem.assertReadable(childPath);
      } catch (error) {
        if (isPermissionError(error)) return { kind: "permission_denied", path: childPath };
        throw error;
      }
      const repositoryRoot = await adapters.git.findRepositoryRoot(childPath);
      if (repositoryRoot !== null) projects.push({ name: entry.name, path: repositoryRoot });
    }
    if (projects.length === 0) return { kind: "not_git_repository", directory };
    return { kind: "projects", directory, projects };
  } catch (error) {
    if (isPermissionError(error)) return { kind: "permission_denied", path: selectedPath };
    throw error;
  }
}
