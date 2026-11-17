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
