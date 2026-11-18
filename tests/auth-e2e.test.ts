import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AuthService,
  CliSessionProvider,
  InvalidAuthenticationError,
  type AuthStore,
  type OAuthAttempt,
  type OAuthIdentityProvider,
} from "../packages/auth/src/index";\nimport { createCliSessionProvider } from "../apps/cli/src/session";
import type {
  AuthChallenge, AuthIdentity, AuthSession, AuthUser, OAuthAuthorizationRequest, OAuthProfile,
} from "../packages/auth/src/index";

class TestStore implements AuthStore {
  users = new Map<string, AuthUser>();
  identities = new Map<string, AuthIdentity>();
  sessions = new Map<string, AuthSession>();
  challenges = new Map<string, AuthChallenge>();
  oauth = new Map<string, OAuthAttempt>();
  destinations = new Map<string, AuthUser>();
  async findIdentity(provider: AuthIdentity["provider"], subject: string) {
    return this.identities.get(provider + ":" + subject) ?? null;
  }
  async createUser(input: Pick<AuthUser, "email" | "phone">) {
    const user: AuthUser = { id: "user-" + (this.users.size + 1), email: input.email,
      emailVerifiedAt: input.email ? new Date().toISOString() : null, phone: input.phone,
      phoneVerifiedAt: null, createdAt: new Date().toISOString() };
    this.users.set(user.id, user);
    return user;
  }
  async linkIdentity(userId: string, provider: AuthIdentity["provider"], subject: string) {
    const identity: AuthIdentity = { id: "identity-" + this.identities.size, userId, provider, subject, createdAt: new Date().toISOString() };
    this.identities.set(provider + ":" + subject, identity);
    return identity;
  }
  async createSession(input: Omit<AuthSession, "id" | "createdAt" | "lastSeenAt" | "revokedAt">) {
    const now = new Date().toISOString();
    const session: AuthSession = { ...input, id: "session-" + this.sessions.size, createdAt: now, lastSeenAt: now, revokedAt: null };
    this.sessions.set(session.id, session);
    return session;
  }
  async findSessionByTokenHash(hash: string) {
    return [...this.sessions.values()].find((session) => session.tokenHash === hash) ?? null;
  }
  async findUserById(id: string) { return this.users.get(id) ?? null; }
  async findUserByVerifiedEmailDigest(hash: string) { return this.destinations.get(hash) ?? null; }
  async revokeSession(id: string, at: string) {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, revokedAt: at });
  }
  async revokeAllSessions(userId: string, at: string) {
    for (const [id, session] of this.sessions) if (session.userId === userId) this.sessions.set(id, { ...session, revokedAt: at });
  }
  async createChallenge(input: Omit<AuthChallenge, "id" | "consumedAt" | "failedAttempts">) {
    this.challenges.set(input.secretHash, { ...input, id: "challenge-" + this.challenges.size, consumedAt: null, failedAttempts: 0 });
  }
  async consumeChallengeAtomically(hash: string, now: string) {
    const challenge = this.challenges.get(hash);
    if (!challenge || challenge.consumedAt || Date.parse(challenge.expiresAt) <= Date.parse(now)) return null;
    this.challenges.set(hash, { ...challenge, consumedAt: now });
    return challenge;
  }
  async createOAuthAttempt(attempt: OAuthAttempt) { this.oauth.set(attempt.state, attempt); }
  async consumeOAuthAttempt(state: string) {
    const attempt = this.oauth.get(state) ?? null;
    this.oauth.delete(state);
    return attempt;
  }
}

class TestIdP implements OAuthIdentityProvider {
  readonly provider = "google" as const;
  lastRequest: OAuthAuthorizationRequest | null = null;
  async createAuthorizationUrlNotUsed() {}
  createAuthorizationUrl(request: OAuthAuthorizationRequest) {
    this.lastRequest = request;
    const url = new URL("https://idp.test/authorize");
    url.searchParams.set("state", request.state);
    url.searchParams.set("nonce", request.nonce);
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("redirect_uri", request.redirectUri);
    return url;
  }
  async exchangeCode(code: string, verifier: string, redirectUri: string): Promise<OAuthProfile> {
    if (code !== "valid-test-code" || !this.lastRequest || redirectUri !== this.lastRequest.redirectUri) throw new Error("bad code");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (challenge !== this.lastRequest.codeChallenge) throw new Error("bad PKCE verifier");
    return {
      subject: "test-idp-subject", email: "user@example.test", emailVerified: true, displayName: "Test User",
      nonce: this.lastRequest.nonce, issuer: "https://idp.test", audience: "freebuff-test-client",
    } as OAuthProfile;
  }
}

function fixture() {
  const store = new TestStore();
  const idp = new TestIdP();
  const sent: URL[] = [];
  let now = new Date("2026-11-18T00:00:00.000Z");
  const service = new AuthService(store, new Map([["google", {
    provider: idp, issuer: "https://idp.test", audience: "freebuff-test-client",
  }]]), {
    async sendEmailMagicLink(_destination, url) { sent.push(url); },
    async sendPhoneOtp() {},
  }, new URL("https://app.example.test"), () => new Date(now));
  return { store, idp, sent, service, setNow: (value: Date) => { now = value; } };
}

describe("authentication end-to-end flows", () => {
  it("completes test-IdP redirect, callback, PKCE exchange, and session establishment", async () => {
    const { service, idp } = fixture();
    const redirect = await service.startOAuth("google", "https://app.example.test/auth/callback");
    expect(redirect.origin).toBe("https://idp.test");
    expect(redirect.searchParams.get("code_challenge")).toBeTruthy();
    const state = redirect.searchParams.get("state")!;
    const token = await service.completeOAuth("google", state, "valid-test-code");
    const session = await service.resolve(token);
    expect(session?.user.email).toBe("user@example.test");
    expect(session?.session.revokedAt).toBeNull();
    expect(idp.lastRequest?.codeVerifier).toBeTruthy();
    await expect(service.completeOAuth("google", state, "valid-test-code")).rejects.toBeInstanceOf(InvalidAuthenticationError);
  });

  it("completes magic-link request, delivery, click, and session establishment", async () => {
    const { service, store, sent } = fixture();
    await service.requestMagicLink("User@Example.Test");
    expect(sent).toHaveLength(1);
    const link = sent[0]!;
    const token = link.searchParams.get("token")!;
    const digest = createHash("sha256").update("user@example.test").digest("hex");
    const user = await store.createUser({ email: "user@example.test", phone: null });
    store.destinations.set(digest, user);
    const sessionToken = await service.consumeMagicLink(token);
    expect((await service.resolve(sessionToken))?.user.id).toBe(user.id);
    await expect(service.consumeMagicLink(token)).rejects.toBeInstanceOf(InvalidAuthenticationError);
  });

  it("rejects expired magic-link tokens with a generic error and no token leakage", async () => {
    const { service, sent, setNow } = fixture();
    await service.requestMagicLink("user@example.test");
    const token = sent[0]!.searchParams.get("token")!;
    setNow(new Date("2026-11-18T00:16:00.000Z"));
    let thrown: unknown;
    try { await service.consumeMagicLink(token); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(InvalidAuthenticationError);
    expect((thrown as Error).message).not.toContain(token);
  });

  it("rejects a revoked session when that token is used again", async () => {
    const { service, idp } = fixture();
    const url = await service.startOAuth("google", "https://app.example.test/auth/callback");
    const token = await service.completeOAuth("google", url.searchParams.get("state")!, "valid-test-code");
    expect(await service.resolve(token)).not.toBeNull();
    await service.revoke(token);
    expect(await service.resolve(token)).toBeNull();
  });

  it("makes the same server session abstraction consumable by the CLI", async () => {
    const { service, idp } = fixture();
    const url = await service.startOAuth("google", "https://app.example.test/auth/callback");
    const token = await service.completeOAuth("google", url.searchParams.get("state")!, "valid-test-code");
    let stored: string | null = null;
    const credentials = {
      async readSessionToken() { return stored; },
      async writeSessionToken(value: string) { stored = value; },
      async clearSessionToken() { stored = null; },
    };
    const cli = createCliSessionProvider(credentials, service);
    await cli.accept(token);
    expect((await cli.require()).user.email).toBe("user@example.test");
    await service.revoke(token);
    expect(await cli.current()).toBeNull();
    expect(stored).toBeNull();
  });
});
