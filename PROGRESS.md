# Engineering Progress

## Current phase: Phase 0 — Foundation (pre-flight refresh)

### Workspace inventory
Applications:
- [x] `apps/cli` — stub and README
- [x] `apps/desktop` — stub and README
- [x] `apps/web` — stub and README
- [x] `apps/cloud` — stub and README

Packages (10):
- [x] `packages/agent-runtime` — stub and README
- [x] `packages/llm-providers` — stub and README
- [x] `packages/code-map` — stub and README
- [x] `packages/sandbox-orchestrator` — stub and README
- [x] `packages/db` — stub and README
- [x] `packages/auth` — stub and README
- [x] `packages/quota` — stub and README
- [x] `packages/ads` — stub and README
- [x] `packages/sdk` — stub and README
- [x] `packages/shared` — contracts and README

### Phase 0 gate checklist
- [ ] Bun workspace installation completed
- [ ] bun run lint passes
- [ ] bun run typecheck passes
- [ ] bun run test passes
- [ ] bun run build passes
- [ ] bun run check passes
- [ ] CI quality job passes on `phase-0/foundation`
- [ ] CI sandbox image build and /health probe pass

### Known gaps
- Bun is not installed in the current execution environment; local gate has not been run here.
- Generate and commit the initial Bun lockfile with `bun install`.
- OAuth, database migrations, and production sandbox isolation are later-phase work.

### Phase 1 status
Not started. Awaiting Phase 0 branch CI green and pre-flight review.
