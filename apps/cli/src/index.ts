export const applicationName = "@freebuff/cli" as const;
export const applicationStatus = "phase-2-project-picker" as const;

export { discoverProjects } from "./project-picker";
export type {
  DiscoveredProject,
  GitRepositoryInspector,
  ProjectPickerAdapters,
  ProjectPickerFileSystem,
  ProjectPickerResult,
} from "./project-picker";

export { applyMultiFileEdit, createMultiFileEditTool, MultiFileEditConflictError } from "./multi-file-edit";
export type { MultiFileEdit, MultiFileEditFileSystem, MultiFileEditOptions, MultiFileEditResult } from "./multi-file-edit";
