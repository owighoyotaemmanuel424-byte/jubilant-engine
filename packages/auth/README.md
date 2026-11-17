# Authentication

Server-side, provider-neutral authentication contracts and security primitives for Freebuff.

## Gate 1 status

- [x] Provider-neutral user, identity, session, challenge, OAuth, repository, and delivery-adapter contracts.
- [x] Cryptographically random opaque session-token generator (256-bit default minimum).
- [x] SHA-256 token digest helper; persist only the digest, never the raw token.
- [x] Secure host-only browser cookie defaults.
- [x] Architecture and threat-control document in [ARCHITECTURE.md](./ARCHITECTURE.md).
- [ ] PostgreSQL repository and transactional identity/challenge operations (persistence workstream).
- [ ] OAuth/OIDC provider implementations and callback validation.
- [ ] Email magic-link and phone OTP delivery adapters.
- [ ] HTTP routes, CSRF/origin checks, rate limits, and end-to-end abuse/replay tests.

No password flow is included. Do not interpret this package foundation as production-ready login until all unchecked controls are implemented and tested.
