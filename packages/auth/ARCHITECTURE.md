# Authentication architecture

## Scope and boundary

Authentication is server-owned. Browser, desktop, and CLI clients use the same API contracts; they never receive provider client secrets, signing keys, database credentials, or raw persisted session tokens. The auth package defines contracts and security primitives. HTTP routing, provider SDKs, delivery integrations, and PostgreSQL implementations are adapters layered around those contracts.

## Supported sign-in methods

1. **OAuth/OIDC** — authorization-code flow with PKCE S256, one-time state, OIDC nonce validation, exact redirect-URI allowlists, issuer/audience/signature/expiry validation, and provider subject as the stable external identity key.
2. **Email magic link** — random one-time challenge delivered by a server-side email adapter. Store only its SHA-256 digest; enforce a short expiry, single use, attempt limits, and per-account/IP send limits.
3. **Phone OTP** — random short numeric code delivered by a server-side SMS adapter. Store only a keyed digest (HMAC with a server-held pepper), short expiry, single use, strict attempt limits, and resend/abuse throttles. Never log codes.
4. **Account linking** — require an authenticated recent session or fresh proof of control of both identities before linking. Enforce unique (provider, subject) and normalized verified email/phone constraints in the database.

No password credential flow is introduced in this gate. Adding passwords requires a separate reviewed decision covering password hashing, reset, breach checks, and abuse controls.

## Session model

- Generate at least 256 bits of cryptographically secure random session-token entropy.
- Return the raw opaque token to the client once; persist only its SHA-256 digest.
- Resolve sessions by digest, rotate on privilege elevation, and revoke server-side on logout, account disablement, credential change, or detected compromise.
- Enforce idle and absolute expiry on the server. A client-side expiry is only a UX hint.
- Browser cookie: `__Host-freebuff_session`; `HttpOnly; Secure; SameSite=Lax; Path=/`; no `Domain` attribute. Production always requires HTTPS.
- Mutating cookie-authenticated requests must validate Origin/Referer against the configured origin and use a CSRF token where cross-site flows require it. SameSite is defense in depth, not the only CSRF control.
- CLI/desktop clients use OS-protected credential storage where available. Do not place bearer tokens in command-line arguments, URLs, shell history, or logs.

## Core interfaces and adapters

- `AuthRepository`: atomic user/identity linking, challenge consumption, session creation/lookup/revocation, and expiry cleanup. The PostgreSQL adapter belongs to the persistence workstream and must use transactions plus unique constraints.
- `OAuthIdentityProvider`: provider-specific authorization URL and code exchange; common validation remains in the auth service.
- `ChallengeDeliveryAdapter`: server-side email/SMS delivery. Provider adapters cannot read prompts, source code, or unrelated project data.
- HTTP adapter: normalizes cookies, origin checks, request validation, rate limits, and error mapping. Never disclose whether an account exists in public challenge responses.

## Required API shape

- `GET /auth/providers` — public enabled-provider metadata only.
- `GET /auth/oauth/:provider/start` — create state/nonce/PKCE and redirect.
- `GET /auth/oauth/:provider/callback` — validate state, nonce, issuer, audience, signature, expiry, and exact redirect; link or create identity; issue session.
- `POST /auth/magic-link/request` and `POST /auth/magic-link/consume`.
- `POST /auth/phone/request` and `POST /auth/phone/verify`.
- `GET /auth/session` — return minimal authenticated-user/session state.
- `POST /auth/logout` — revoke server-side and clear cookie.
- `POST /auth/logout-all` — revoke all sessions after recent re-authentication.

All challenge endpoints are rate-limited by IP and normalized destination, return non-enumerating responses, and emit security audit events without secrets.

## Threat controls

- CSRF: SameSite cookie, exact Origin allowlist, CSRF token for unsafe browser methods.
- Session theft/replay: opaque high-entropy tokens, digest-at-rest, rotation, revocation, TLS, short idle/absolute TTL.
- OAuth mix-up/login CSRF: state, nonce, PKCE S256, issuer and audience validation, exact callback URI.
- OTP brute force: low attempt ceiling, one-time atomic consumption, short TTL, per-destination/IP throttles, HMAC digest with pepper.
- Account takeover: verified identity linking, recent-auth requirement, session revocation, audit trail.
- Enumeration: uniform challenge response and timing-conscious lookup paths.
- Secret leakage: redact authorization headers, cookies, magic-link tokens, OTPs, OAuth codes, and provider credentials from logs and telemetry.

## Phase 2 implementation sequence

1. Land these provider-neutral contracts and crypto primitives.
2. Implement the PostgreSQL repository as part of persistence, including transaction/unique-constraint tests.
3. Add OAuth/OIDC and email/phone delivery adapters behind server-only configuration.
4. Add HTTP routes, origin/CSRF controls, and rate limiting.
5. Add end-to-end tests for replay, expiry, revocation, account linking, OAuth state/nonce/PKCE, challenge brute force, and secret redaction.

This architecture document does not claim that OAuth, email, SMS, HTTP routes, database persistence, or production login are implemented. Those remain explicit implementation and acceptance work.
