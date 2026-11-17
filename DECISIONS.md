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
