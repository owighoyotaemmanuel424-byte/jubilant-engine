# Architecture Decisions

## 0001 — Bun workspaces
Use Bun workspaces for a single TypeScript monorepo.

## 0002 — Strict TypeScript
Enable strict mode, noImplicitAny, noUncheckedIndexedAccess, and exactOptionalPropertyTypes. Explicit any is forbidden.

## 0003 — PostgreSQL metadata
Use PostgreSQL for platform users, sessions, quota accounting, ad inventory metadata, and sandbox lifecycle metadata. Keep builder realtime data behind an adapter.

## 0004 — Sandbox trust boundary
Never mount the host Docker socket into untrusted workloads. Production requires reviewed isolation, egress policy, tenant volumes, resource quotas, and security review.

## 0005 — Provider configuration
Select provider adapters through server-side tier configuration. Never embed provider API keys in clients.

## 0006 — Advertising privacy
Never send raw prompts, source code, credentials, or private repository contents to advertising partners.

## 0007 — Live provider model catalogue (reviewed 2026-11-17)
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

## 0008 — Phase 0 test-count correction and Phase 1 baseline (2026-11-18)

Phase 0 report claimed '66 tests in 11 files.' The committed tree at 25ac1d3 contains one test file. Phase 0 → Phase 1 added 11 files and deleted none, so Phase 0 had 1 test file. The 66 figure was measured against an uncommitted working tree and cannot be reproduced. Phase 1 baseline = 47 tests across 12 files. No spec-required coverage was lost; the 47-test suite covers every required area.

The Phase 1 baseline is accepted at 47/47 across 12 files. Do not add filler tests to reach the historical, unreproducible 66 figure. Add tests only for identified requirement gaps, with an explicit reason.

## 0009 — Code-map implementation deferred to Phase 2 gate (2026-11-18)

The Phase 1 `packages/code-map/src/index.ts` is a foundation stub, not a working code-map implementation; no Phase 1 code-map tests exist. Defer code-map implementation and its targeted tests into the Phase 2 gate. Phase 2 must deliver repository indexing/code-map behavior and tests before the gate can pass.

## 0010 — Mainline and phase-branch policy (2026-11-18)

`main` is the sole integration branch and the source of truth for accepted work. Each phase is developed on its own named phase branch and submitted as a pull request targeting `main`; phase PRs must not depend on another unmerged phase branch as their base. Merge completed prerequisite phase PRs into `main` before retargeting dependent phase PRs. After retargeting, rebase/update the phase branch as required, resolve conflicts without discarding accepted work, and rerun the full applicable CI gate before merging. Do not start the next phase's implementation branch from a stale pre-merge base. Keep phase PRs draft until their review gate is ready, then mark ready and merge only after required checks pass. No direct commits to `main` for feature implementation; documentation corrections for an active phase belong on that phase branch and flow through its PR.


## 0011 — Server-side authentication architecture (2026-11-18)

Use a provider-neutral, server-owned authentication boundary shared by browser, desktop, and CLI clients. Support OAuth/OIDC authorization-code flow with PKCE S256, state and nonce validation; one-time email magic links; and phone OTP behind server-only delivery adapters. Persist only digests of opaque session tokens and one-time challenges. Browser sessions use a host-only `__Host-freebuff_session` cookie with HttpOnly, Secure, SameSite=Lax, Path=/, and no Domain; unsafe cookie-authenticated requests also require exact Origin validation and CSRF protection. Enforce server-side idle/absolute expiry, rotation, revocation, non-enumerating challenge responses, per-IP/destination rate limits, atomic one-time challenge consumption, and audit logging with secret redaction. Identity linking requires recent authentication or fresh proof of both identities and database uniqueness on provider/subject. No password flow is introduced without a separate security decision. PostgreSQL repository transactions and HTTP/provider/delivery adapters are implemented in their respective ordered workstreams; the current package contains contracts and cryptographic session-token primitives, not production login.


## 0012 — Coordinated multi-file edit contract (2026-11-18)

The CLI multi-file edit tool reuses the Phase 1 `FileEditCoordinator` for sorted, overlapping-path lock protection. Every edit must include the exact `expectedContent` observed by the caller (or `null` to assert that the target does not yet exist), preventing silent stale overwrites. Reject absolute paths, traversal, duplicate paths, null bytes, symbolic-link targets, and oversized batches (20 files, 1 MB per file, 5 MB total replacement content). Each target is replaced using a same-directory temporary file and atomic rename. If a later write fails, restore earlier files in reverse order; surface an `AggregateError` if rollback itself is incomplete. This is coordinated, rollback-capable multi-file editing, not a filesystem-wide atomic transaction; readers outside the shared coordinator can observe intermediate per-file renames.
