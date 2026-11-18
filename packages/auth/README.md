# Authentication

Server-side, provider-neutral authentication contracts and security primitives for Freebuff.

## Gate 1 status

- [x] Provider-neutral user, identity, session, challenge, OAuth, repository, and delivery-adapter contracts.
- [x] Cryptographically random opaque session-token generator (256-bit default minimum).
- [x] SHA-256 token digest helper; persist only the digest, never the raw token.
- [x] Secure host-only browser cookie defaults.
- [x] Architecture and threat-control document in [ARCHITECTURE.md](./ARCHITECTURE.md).
- [x] Auth service and HTTP adapter E2E flows: OAuth test IdP, magic links, expiry, revocation, and session endpoint.\n- [x] CLI shared HTTP session resolver and credential-store abstraction.\n- [ ] PostgreSQL repository and transactional identity/challenge operations (gate item 5).
- [ ] Production OAuth/OIDC provider adapters and live provider configuration; test-IdP callback validation is covered.
- [ ] Production email/SMS delivery adapters; magic-link delivery contract is exercised with a test adapter.
- [x] Framework-neutral HTTP routes with exact Origin checks for mutating requests and E2E flow tests.\n- [ ] Rate-limit adapter, phone OTP flow, CSRF token strategy, and replay/abuse hardening.

No password flow is included. Do not interpret this package foundation as production-ready login until all unchecked controls are implemented and tested.
