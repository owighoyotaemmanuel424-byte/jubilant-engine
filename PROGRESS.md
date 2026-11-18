# Engineering Progress

## Phase 0 — Foundation
CI PASSED on branch `phase-0/foundation`, commit `25ac1d369c6c56395b787e7fc27a6ed081d3c956`.
- [x] Bun install, lint, typecheck, tests, and build passed in GitHub Actions.
- [x] Docker sandbox image built and /health probe passed in GitHub Actions.
- [x] Four app stubs and ten package stubs have READMEs.
- [x] Workspace inventory documented.

Merged to `main` through PR #1; merge commit: `cd03d6d63766f9c6b03cbf3204294c2575b6e145`.
PR #1: https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/pull/1
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

Implemented on `phase-1/agent-runtime`. PR #2 is now retargeted to `main`:
https://github.com/owighoyotaemmanuel424-byte/jubilant-engine/pull/2

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
- **code-map:** Deferred to Phase 2 by Decision 0009; Phase 1 contains only the foundation stub at `packages/code-map/src/index.ts`, with no indexing/query implementation or tests.

### Phase 1 closeout status

- [x] Phase 0 test-count discrepancy classified as a reporting error; 47/47 across 12 files accepted as Phase 1 baseline.
- [x] Coverage map published.
- [x] Tool inventory published with implementation status, distinguishing generic infrastructure from actual tools.
- [x] Code-map explicitly deferred into Phase 2 gate by dated decision.

## Phase 2 — Implementation report (authorized 2026-11-18)

### Ordered execution log

1. **Branch management — completed and verified.** PR #1 is merged into `main` at `cd03d6d63766f9c6b03cbf3204294c2575b6e145`. After its latest PR and push CI runs both passed, PR #2 was marked ready and squash-merged into `main` at `24aa660ab705f7d2f8a4a7ba706e2eb4c2286a2f`; the squash commit message references the Phase 1 gate. Post-merge `main` CI run 44204292599 passed. PR #4 merged `main` into `phase-2/auth-architecture` at `e3e7528169d2d8b5b19764b7feca5f117bf85123`, preserving merge ancestry and importing the accepted `FileEditCoordinator`. Phase 2 sync CI run 44204402857 passed. PR #3 remains the Phase 2 review PR; keep its current scope distinct from Phase 1.
2. **Authentication architecture (gate item 1) — architecture decision complete; implementation foundation verified.** Decision 0011 and `packages/auth/ARCHITECTURE.md` define OAuth/OIDC PKCE, magic links, phone OTP, verified account linking, opaque digest-at-rest sessions, secure host-only cookies, CSRF/origin checks, server-side expiry/revocation, abuse throttles, and secret-safe audit events. Provider-neutral contracts, 256-bit opaque session-token generation, SHA-256 token-digest helper, and secure cookie defaults are implemented with four targeted tests in draft PR #3. GitHub Actions passed quality, sandbox-image, and GitGuardian checks. Production login is not claimed: PostgreSQL transactions, concrete OAuth/OIDC and delivery adapters, HTTP routes, CSRF/origin enforcement, rate limits, and replay/abuse end-to-end tests remain in their ordered implementation workstreams.
3. **Project picker (gate item 2) — implementation and CI VERIFIED.** `apps/cli/src/project-picker.ts` recognizes a selected Git repository or enumerates immediate child repositories in stable order. It returns explicit states for empty directories, populated non-Git directories, non-directory paths, and permission-denied root/child paths. Git is invoked with an argument array and no shell interpolation. Six targeted tests cover repository enumeration and the required edge cases. GitHub Actions quality, sandbox-image, and GitGuardian checks passed for PR #3 head `c3b88e714ff01909b3824d0ae4c64bcf2e4bd5bb` (run 44202313562).
4. **CLI multi-file edit (gate item 3) — implementation and CI VERIFIED.** `apps/cli/src/multi-file-edit.ts` exports `createMultiFileEditTool` as the `multi_file_edit` runtime tool and uses the Phase 1 `FileEditCoordinator` imported from `packages/agent-runtime/src/file-edit-coordinator`; it does not duplicate the lock implementation. Each file requires an exact `expectedContent` precondition (or `null` for creation), rejects traversal/absolute/duplicate paths and symlink targets, enforces 20-file / 1 MB per-file / 5 MB total bounds, stages each write to a same-directory temp file and renames atomically, and rolls back prior writes if a later write fails. Six focused safety tests plus one agent-loop dispatch test verify multi-file writes, stale-content rejection, path validation, rollback, overlapping-lock conflict, runtime-tool exposure, and end-to-end agent dispatch. Latest branch head `8dcfcc849c5687d477e9687cc1433a47e2b8a1af` passed GitHub Actions run 44204828181 (quality `bun run check`, sandbox image and `/health`). This is rollback-capable coordinated editing, not a filesystem-wide atomic transaction; external readers may observe intermediate per-file renames.
5. **Terminal broker (gate item 4) — next; pending.** Cancellation must terminate the entire process tree, not only the direct parent. Required integration test starts a shell with a child process, cancels the command, and asserts both parent and child are dead.
6. **Persistence (gate item 5) — pending.**
7. **Server-authoritative quota (gate item 6) — pending.** Test the endpoint directly while bypassing the client, using a forged/exhausted token, and prove the server rejects over-quota work. Exercise the DST boundary through the CLI path, not only a unit helper.
8. **Sponsored slot (gate item 7) — pending.** Add a runtime test proving a sponsored placement cannot render without its visible "Sponsored" label; the Phase 0 type-level guarantee alone is insufficient.
9. **OpenTUI headless smoke (gate item 8) — pending.**
10. **CLI output-sink audit (gate item 9) — pending.** Confirm the logger is the only CLI output sink and there are no `console.*` calls in CLI paths before OpenTUI grows.
11. **PTY E2E (gate item 10) — pending.** Add pseudo-terminal end-to-end coverage for the real CLI interaction path.
12. **Code-map (gate item 11) — pending.** Implement repository indexing/query behavior and targeted tests, as required by Decision 0009.

### Phase 1 evidence carried into this report

The complete eight-tool inventory, with each implementation status, is maintained in [PROGRESS.md — Phase 1 tool inventory](#phase-1-tool-inventory--one-line-per-specified-tool). The complete 47-test coverage mapping is maintained in [PROGRESS.md — 47-test coverage mapping](#coverage-mapping--47-runtime-tests-to-phase-1-gate-requirements). Both sections are part of this same report and are the accepted Phase 1 baseline; no filler tests will be added to chase the unreproducible 66.

### Model catalogue (Decision 0007 — copied into Phase 2 report)

The provider catalogue is sourced from official provider documentation checked on 2026-11-17. Prices are USD per million tokens, standard/base token rates, before prompt-cache discounts or surcharges, regional premiums, batch/flex discounts, and taxes. Provider pricing and availability can change; refresh before release and do not treat these values as billing guarantees.

- OpenAI model IDs, context windows, output limits, and model selection: https://developers.openai.com/api/docs/models
- OpenAI API pricing: https://platform.openai.com/pricing
- Anthropic model IDs, context windows, and max output: https://platform.claude.com/docs/en/models/overview
- Anthropic API pricing: https://platform.claude.com/docs/en/about-claude/pricing
- DeepSeek current model IDs and capabilities: https://api-docs.deepseek.com/api/list-models/
- DeepSeek model context, output limits, peak/off-peak and cached-token pricing: https://api-docs.deepseek.com/quick_start/pricing/

Catalogue snapshot (2026-11-17):
- OpenAI: `gpt-6-astra`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-luna`; 1.05M context and 128K max output. Base input/output USD per MTok: Astra 10/50, Sol 2/10, Terra 1/5, Luna 0.10/0.50.
- Anthropic: `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`; 1M context and 128K max output. Base input/output USD per MTok: Fable 8/40, Opus 4/20, Sonnet 2/10, Haiku from 0.10/0.50 (higher input tier above 100K prompt tokens).
- DeepSeek: `deepseek-flash` and `deepseek-v4-pro`; 1M context and maximum 384K output. Peak cache-miss input/output USD per MTok: Flash 0.30/1.20, V4 Pro 1.32/3.96. Off-peak rates are half; cache-hit rates are separately priced.

All production model choice must pass through `resolveModelForTier`. The model catalogue is the only source of provider model identifiers and published price/context metadata.

### Phase 2 acceptance gate — not yet passed

- [ ] Auth architecture and implementation (gate item 1): architecture decision, provider-neutral contracts, session-token primitives, and four focused tests are present; PostgreSQL/provider/delivery/HTTP integration and abuse/replay E2E remain open.
- [x] Project picker (gate item 2) covers repo enumeration, empty directory, non-git directory, and permission-denied handling (six targeted tests; CI verified).
- [x] CLI multi-file edit (gate item 3) works through agent tool dispatch with coordinated locks, optimistic concurrency, path/size validation, and rollback (seven targeted tests; CI verified).
- [ ] Terminal broker (gate item 4) is sandboxed; shell-plus-child process-tree cancellation test proves both processes are dead.
- [ ] Persistence (gate item 5) survives process restart and has migration/recovery coverage.
- [ ] Server-authoritative quota (gate item 6) rejects direct endpoint requests with forged/exhausted tokens; DST boundary is tested through CLI.
- [ ] Sponsored slot (gate item 7) runtime test prevents unlabelled rendering.
- [ ] OpenTUI headless smoke (gate item 8) passes.
- [ ] CLI paths (gate item 9) have no `console.*`; logger is the only output sink.
- [ ] PTY E2E (gate item 10) passes.
- [ ] Code-map (gate item 11) indexing/query implementation and targeted tests pass (Decision 0009).

**Phase 3 remains blocked until the user reviews and explicitly approves the completed Phase 2 gate report.**
