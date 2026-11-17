# Engineering Progress

## Phase 0 — Foundation
CI PASSED on branch `phase-0/foundation`, commit `25ac1d369c6c56395b787e7fc27a6ed081d3c956`.
- [x] Bun install, lint, typecheck, tests, and build passed in GitHub Actions.
- [x] Docker sandbox image built and /health probe passed in GitHub Actions.
- [x] Four app stubs and ten package stubs have READMEs.
- [x] Workspace inventory documented.

Draft review: https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/pull/1
Successful Phase 0 run: https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/actions/runs/44035465991

## Workspace inventory (all stubs documented)

Applications:
- [x] `apps/cli` — README and source stub
- [x] `apps/desktop` — README and source stub
- [x] `apps/web` — README and source stub
- [x] `apps/cloud` — README and source stub

Packages (10):
- [x] `packages/agent-runtime` — README and runtime source
- [x] `packages/llm-providers` — README and provider source
- [x] `packages/code-map` — README and source stub
- [x] `packages/sandbox-orchestrator` — README and sandbox source
- [x] `packages/db` — README and source stub
- [x] `packages/auth` — README and source stub
- [x] `packages/quota` — README and quota source
- [x] `packages/ads` — README and ads source
- [x] `packages/sdk` — README and source stub
- [x] `packages/shared` — README and shared contracts

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

CI evidence (latest commit `36a025553bbd264945bb96b1daa00eff864f4628`):
https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/actions/runs/44037397441

Test evidence: 12 test files passed, 47 tests passed. No provider credentials or live model calls were used; provider behavior is covered with recorded HTTP/SSE fixtures.

### Remaining constraints
- Production sandbox isolation, deployment infrastructure, and live-provider credential configuration are intentionally deferred to later phases.
- No paid infrastructure or model API calls were provisioned.

Phase 2 has not started. Awaiting approval before proceeding.


## Phase 1 baseline correction and coverage map (2026-11-18)

The earlier Phase 0 report's "66 tests in 11 files" figure was inaccurate: it was measured against an uncommitted working tree and cannot be reproduced from the committed Phase 0 tree. The committed Phase 0 tree at `25ac1d3` has one test file. Phase 0 → Phase 1 added 11 test files and deleted none. Accept Phase 1's **47/47 tests across 12 files** as the baseline. No filler tests will be added to chase 66.

### Coverage mapping — 47 runtime tests to Phase 1 gate requirements

| Test file | Runtime cases | Gate requirement covered |
|---|---:|---|
| `ad-creative.types.test.ts` | 1 | Sponsored-ad disclosure contract: label is exactly `Sponsored` |
| `fixture-agent-tasks.test.ts` | 5 | Scripted agent tool execution and expected file diffs across README, source, route, test fixture, and environment-example tasks |
| `local-midnight.test.ts` | 2 | Timezone-aware quota calendar reset, including 23-hour and 25-hour DST days |
| `model-selection.test.ts` | 2 | Provider/tier resolver coverage and static guard against hardcoded model IDs outside catalogue/resolver |
| `provider-http.test.ts` | 15 | DeepSeek/OpenAI/Anthropic recorded HTTP success, retryable 429/503, timeout, and caller cancellation (5 cases per provider) |
| `provider-streaming.test.ts` | 4 | OpenAI-compatible fragmented/interleaved streaming for DeepSeek and OpenAI; Anthropic event normalization; active SSE cancellation and reader cleanup |
| `redaction-adversarial.test.ts` | 3 | Bearer/API/GitHub/private-key redaction, multiline PEM redaction, mixed-case/nested-looking secret redaction |
| `retry-circuit-breaker.test.ts` | 4 | Retry jitter bounds and exponential cap; circuit-breaker closed/open/half-open transitions and failed probe |
| `shared-contracts.test.ts` | 4 | Agent, sponsored-ad, country-aware quota, and persistent-session shared contracts |
| `subagent-cancellation.test.ts` | 3 | Concurrent disjoint file locks, rejection of overlapping edits, managed subprocess cancellation/cleanup |
| `subprocess-cancellation.integration.test.ts` | 1 | Real OS subprocess termination and drain on cancellation |
| `tool-parser.test.ts` | 3 | Malformed/truncated JSON rejection, non-object/unsafe-key/invalid-name rejection, deterministic fragmented/interleaved tool parsing |
| **Total** | **47** | **Phase 1 expanded gate coverage** |

These are the committed Phase 1 suite's 47 runtime test cases (parameterized cases expanded). The coverage map describes what the tests exercise; it does not claim Phase 2 production features are already implemented.

### Phase 1 tool inventory — one line per specified tool

- **read:** Not implemented as a production runtime tool; Phase 1 exposes only the generic injected `RuntimeTool` execution interface.
- **write:** Not implemented as a production runtime tool; the fixture test injects a test-only `write_file` tool to verify agent-loop dispatch.
- **edit:** Not implemented as a production runtime tool; no patch/diff application tool exists in Phase 1.
- **multi-file coordinated edit:** Partial foundation only — `FileEditCoordinator` provides sorted per-file locking and conflict rejection; it does not itself read, patch, or write files atomically.
- **ripgrep:** Not implemented; no repository search tool or ripgrep subprocess wrapper exists in Phase 1.
- **terminal exec (sandboxed):** Not implemented; `ManagedProcessRegistry` manages cancellation/cleanup for an abstract process, but Phase 1 has no sandboxed command-execution broker.
- **web fetch:** Not implemented; no outbound web-fetch tool or policy wrapper exists in Phase 1.
- **code-map:** Foundation stub only at `packages/code-map/src/index.ts`; no indexing/query implementation or tests. Deferred by DECISIONS.md entry 0009 into the Phase 2 gate.

### Phase 1 closeout status

- [x] Phase 0 test-count discrepancy classified as a reporting error; 47/47 across 12 files accepted as Phase 1 baseline.
- [x] Coverage map published.
- [x] Tool inventory published with implementation status, distinguishing generic infrastructure from actual tools.
- [x] Code-map explicitly deferred into Phase 2 gate by dated decision.
- [ ] Phase 2 remains blocked until the remaining Phase 1 approval/branch-management steps are completed and the expanded Phase 2 gate is implemented and verified.
