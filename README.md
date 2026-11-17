# Freebuff Clone

A multi-surface AI coding platform with a shared agent runtime powering CLI, Desktop, Web App Builder, and Cloud Sandbox.

## Requirements
- Bun 1.2.22
- Docker Engine and Docker Compose
- Git

## Local setup
```bash
bun install
cp .env.example .env
docker compose up -d postgres
bun run check
```

## Workspace layout
- apps/: CLI, Desktop, Web Builder, and Cloud clients
- packages/: runtime, providers, code map, sandbox, database, auth, quota, ads, SDK
- infra/: local and production infrastructure
- tests/: cross-package tests

## Security baseline
Do not commit credentials. The example database password is local-development-only. Never mount the host Docker socket into untrusted workloads. Production sandboxing requires separately reviewed container or microVM isolation.

See PROGRESS.md and DECISIONS.md for phase gates and architecture decisions.
