# CLI

Terminal-first coding assistant. Phase 2 adds provider-neutral project discovery for the CLI.

## Project picker

`discoverProjects(path)`:
- Recognizes the selected directory itself when it is a Git repository.
- Otherwise enumerates immediate child Git repositories in deterministic name order.
- Returns explicit states for an empty directory, a populated non-Git directory, a non-directory path, and permission-denied paths (including inaccessible child repositories).
- Uses `git -C <path> rev-parse --show-toplevel` through argument-array process execution; it does not interpolate a shell command and does not recursively traverse the workspace.
- Accepts injected filesystem and Git-inspector adapters for deterministic tests.

The picker is a discovery primitive; interactive OpenTUI selection and project creation are separate CLI work.

## CLI multi-file edit

`createMultiFileEditTool({ projectRoot })` exposes the `multi_file_edit` runtime tool. Each batch supplies relative file paths, the exact `expectedContent` observed by the caller (or `null` for a new file), and the replacement `content`. It:

- Reuses the agent runtime's shared `FileEditCoordinator` locks, acquiring all target paths as one batch.
- Rejects absolute paths, traversal, duplicate paths, symbolic-link targets, stale expected contents, and oversized batches.
- Writes each file through a same-directory temporary file and atomic rename.
- Rolls back already-written files if a later write fails; incomplete rollback is surfaced as an `AggregateError`.
- Limits batches to 20 files, 1 MB per file, and 5 MB total replacement content.

The multi-file operation is coordinated and rollback-capable, not a filesystem-wide atomic transaction: readers outside the coordinator may observe intermediate renames during a batch.
