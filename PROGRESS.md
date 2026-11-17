# Engineering Progress

## Phase 0 — Foundation
CI PASSED on branch `phase-0/foundation`, commit `25ac1d369c6c56395b787e7fc27a6ed081d3c956`.
- [x] Bun install, lint, typecheck, tests, and build passed in GitHub Actions.
- [x] Docker sandbox image built and /health probe passed in GitHub Actions.
- [x] Four app stubs and ten package stubs have READMEs.
- [x] Workspace inventory documented.

Draft review: https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/pull/1
Successful Phase 0 run: https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/actions/runs/44035465991

## Phase 1 — Agent Runtime
Implemented on `phase-1/agent-runtime`.

### Expanded Phase 1 gate — VERIFIED
- [x] 5/5 scripted fixture tasks produce expected file diffs.
- [x] Recorded-HTTP tests pass for DeepSeek, OpenAI, and Anthropic; each provider exercises success, HTTP 429, HTTP 503, timeout, and caller-abort paths.
- [x] Deterministic adversarial tool parsing passes malformed JSON, truncated JSON, unsafe keys, fragmented arguments, and interleaved text/tool events.
- [x] Mid-stream cancellation passes: SSE reader cancellation, in-flight provider request abort, and real OS subprocess termination/drain.
- [x] Parallel subagent edits pass: disjoint file locks execute concurrently; overlapping edits are rejected.
- [x] Static model-selection test proves model IDs occur only in the catalogue/resolver and tier selection is performed through `resolveModelForTier`.
- [x] Full `bun run check` passes: ESLint, TypeScript, Vitest, and all workspace builds. The same CI run also builds the sandbox image and probes `/health` successfully.

CI evidence (latest commit `cb6d32598eecc310f1ae4b647d773747aa4c1378`):
https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/actions/runs/44037058644

Test evidence: 12 test files passed, 47 tests passed. No provider credentials or live model calls were used; provider behavior is covered with recorded HTTP/SSE fixtures.

### Remaining constraints
- Production sandbox isolation, deployment infrastructure, and live-provider credential configuration are intentionally deferred to later phases.
- No paid infrastructure or model API calls were provisioned.

Phase 2 has not started. Awaiting approval before proceeding.
