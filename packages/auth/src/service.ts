import {
  createOpaqueToken,
  hashOpaqueToken,
  type AuthChallenge,
  type AuthIdentity,
  type AuthRepository,
  type AuthSession,
  type AuthUser,
  type ChallengeDeliveryAdapter,
  type OAuthAuthorizationRequest,
  type OAuthIdentityProvider,
  type OAuthProfile,
} from "./index";

export interface OAuthAttempt extends OAuthAuthorizationRequest {
  readonly provider: "google" | "github" | "apple";
  readonly expiresAt: string;
}

export interface AuthStore extends AuthRepository {
  createOAuthAttempt(attempt: OAuthAttempt): Promise<void>;
  consumeOAuthAttempt(state: string): Promise<OAuthAttempt | null>;
  createChallenge(challenge: Omit<AuthChallenge, "id" | "consumedAt" | "failedAttempts">): Promise<void>;
  findUserById(userId: string): Promise<AuthUser | null>;
}

export interface OAuthProviderConfig {
  readonly provider: OAuthIdentityProvider;
  readonly issuer: string;
  readonly audience: string;
  readonly allowedRedirectUris: readonly string[];
}

export interface AuthenticatedSession {
  readonly user: Pick<AuthUser, "id" | "email">;
  readonly session: Pick<AuthSession, "id" | "userId" | "expiresAt">;
}

export interface SessionResolver {
  resolve(token: string): Promise<AuthenticatedSession | null>;
}

export class InvalidAuthenticationError extends Error {
  constructor() {
    super("Authentication could not be completed.");
    this.name = "InvalidAuthenticationError";
  }
}

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

async function digestText(value: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(bytes));
}

export class AuthService implements SessionResolver {
  constructor(
    private readonly store: AuthStore,
    private readonly providers: ReadonlyMap<"google" | "github" | "apple", OAuthProviderConfig>,
    private readonly delivery: Pick<ChallengeDeliveryAdapter, "sendEmailMagicLink">,
    private readonly publicOrigin: URL,
    private readonly now: () => Date = () => new Date(),
    private readonly sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  ) {
    if (publicOrigin.protocol !== "https:" && publicOrigin.hostname !== "localhost") {
      throw new TypeError("Authentication public origin must use HTTPS.");
    }
  }

  async startOAuth(providerName: "google" | "github" | "apple", redirectUri: string): Promise<URL> {
    const config = this.providers.get(providerName);
    if (!config || config.provider.provider !== providerName) throw new InvalidAuthenticationError();
    const redirect = new URL(redirectUri);
    if (redirect.origin !== this.publicOrigin.origin || !config.allowedRedirectUris.includes(redirect.toString())) throw new InvalidAuthenticationError();

    const state = createOpaqueToken();
    const nonce = createOpaqueToken();
    const codeVerifier = createOpaqueToken();
    const request: OAuthAuthorizationRequest = {
      state,
      nonce,
      codeVerifier,
      codeChallenge: await pkceChallenge(codeVerifier),
      redirectUri: redirect.toString(),
    };
    await this.store.createOAuthAttempt({
      ...request,
      provider: providerName,
      expiresAt: new Date(this.now().getTime() + OAUTH_STATE_TTL_MS).toISOString(),
    });
    return config.provider.createAuthorizationUrl(request);
  }

  async completeOAuth(providerName: "google" | "github" | "apple", state: string, code: string): Promise<string> {
    const attempt = await this.store.consumeOAuthAttempt(state);
    if (!attempt || attempt.provider !== providerName || Date.parse(attempt.expiresAt) <= this.now().getTime()) {
      throw new InvalidAuthenticationError();
    }
    const config = this.providers.get(providerName);
    if (!config || config.provider.provider !== providerName || !code) throw new InvalidAuthenticationError();

    let profile: OAuthProfile;
    try {
      profile = await config.provider.exchangeCode(code, attempt.codeVerifier, attempt.redirectUri);
    } catch {
      throw new InvalidAuthenticationError();
    }
    const claims = profile as OAuthProfile & { nonce?: string; issuer?: string; audience?: string };
    if (
      claims.nonce !== attempt.nonce ||
      claims.issuer !== config.issuer ||
      claims.audience !== config.audience ||
      !profile.subject
    ) throw new InvalidAuthenticationError();

    const identity: AuthIdentity | null = await this.store.findIdentity(providerName, profile.subject);
    let user: AuthUser | null = identity ? await this.store.findUserById(identity.userId) : null;
    if (identity && !user) throw new InvalidAuthenticationError();
    if (!user) {
      const verifiedEmail = profile.emailVerified ? profile.email?.trim().toLowerCase() ?? null : null;
      user = await this.store.createUser({ email: verifiedEmail, phone: null });
      if (verifiedEmail) user = (await this.store.verifyUserEmail(user.id, this.now().toISOString())) ?? user;
      await this.store.linkIdentity(user.id, providerName, profile.subject);
    }
    return this.issueSession(user);
  }

  async requestMagicLink(destination: string): Promise<void> {
    const normalized = destination.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return;
    const user = await this.store.findOrCreateUserByEmail(normalized);
    const token = createOpaqueToken();
    await this.store.createChallenge({
      method: "email_magic_link",
      userId: user.id,
      destinationHash: await digestText(normalized),
      secretHash: await hashOpaqueToken(token),
      expiresAt: new Date(this.now().getTime() + MAGIC_LINK_TTL_MS).toISOString(),
    });
    const url = new URL("/auth/magic-link/consume", this.publicOrigin);
    url.searchParams.set("token", token);
    await this.delivery.sendEmailMagicLink(normalized, url);
  }

  async consumeMagicLink(token: string): Promise<string> {
    let secretHash: string;
    try {
      secretHash = await hashOpaqueToken(token);
    } catch {
      throw new InvalidAuthenticationError();
    }
    const challenge = await this.store.consumeChallengeAtomically(secretHash, this.now().toISOString());
    if (
      !challenge ||
      challenge.method !== "email_magic_link" ||
      Date.parse(challenge.expiresAt) <= this.now().getTime()
    ) throw new InvalidAuthenticationError();

    const user = await this.store.verifyUserEmail(challenge.userId, this.now().toISOString());
    if (!user) throw new InvalidAuthenticationError();
    return this.issueSession(user);
  }

  async resolve(token: string): Promise<AuthenticatedSession | null> {
    let tokenHash: string;
    try {
      tokenHash = await hashOpaqueToken(token);
    } catch {
      return null;
    }
    const session = await this.store.findSessionByTokenHash(tokenHash);
    if (!session || session.revokedAt !== null || Date.parse(session.expiresAt) <= this.now().getTime()) return null;
    const user = await this.store.findUserById(session.userId);
    return user ? { user: { id: user.id, email: user.email }, session: { id: session.id, userId: session.userId, expiresAt: session.expiresAt } } : null;
  }

  async revoke(token: string): Promise<void> {
    let tokenHash: string;
    try {
      tokenHash = await hashOpaqueToken(token);
    } catch {
      return;
    }
    const session = await this.store.findSessionByTokenHash(tokenHash);
    if (session && session.revokedAt === null) await this.store.revokeSession(session.id, this.now().toISOString());
  }

  private async issueSession(user: AuthUser): Promise<string> {
    const token = createOpaqueToken();
    const tokenHash = await hashOpaqueToken(token);
    await this.store.createSession({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(this.now().getTime() + this.sessionTtlMs).toISOString(),
    });
    return token;
  }
}

/** The CLI depends on this shared contract, not on provider-specific auth code. */
export interface CliCredentialStore {
  readSessionToken(): Promise<string | null>;
  writeSessionToken(token: string): Promise<void>;
  clearSessionToken(): Promise<void>;
}

export interface CliSession {
  readonly user: AuthUser;
  readonly session: AuthSession;
}

export class CliSessionProvider {
  constructor(
    private readonly credentials: CliCredentialStore,
    private readonly resolver: SessionResolver,
  ) {}

  async current(): Promise<CliSession | null> {
    const token = await this.credentials.readSessionToken();
    if (!token) return null;
    const session = await this.resolver.resolve(token);
    if (!session) {
      await this.credentials.clearSessionToken();
      return null;
    }
    return session;
  }

  async require(): Promise<CliSession> {
    const session = await this.current();
    if (!session) throw new InvalidAuthenticationError();
    return session;
  }

  async accept(token: string): Promise<void> {
    if (!await this.resolver.resolve(token)) throw new InvalidAuthenticationError();
    await this.credentials.writeSessionToken(token);
  }

  async signOut(): Promise<void> {
    await this.credentials.clearSessionToken();
  }
}


export interface AuthHttpOptions {
  readonly publicOrigin: URL;
  readonly cookieName?: string;
}

/** Framework-neutral HTTP adapter used by web and CLI-facing auth APIs. */
export function createAuthHttpHandler(service: AuthService, options: AuthHttpOptions) {
  const cookieName = options.cookieName ?? "__Host-freebuff_session";
  const json = (body: unknown, status = 200, headers?: HeadersInit) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...Object.fromEntries(new Headers(headers).entries()) } });
  const originAllowed = (request: Request) => request.headers.get("origin") === options.publicOrigin.origin;
  const readToken = (request: Request): string | null => {
    const authorization = request.headers.get("authorization");
    if (authorization?.startsWith("Bearer ")) return authorization.slice(7);
    const cookie = request.headers.get("cookie") ?? "";
    const item = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="));
    return item ? decodeURIComponent(item.slice(cookieName.length + 1)) : null;
  };
  const setCookie = (token: string) =>
    cookieName + "=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000";
  const clearCookie = () => cookieName + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.origin !== options.publicOrigin.origin) return json({ error: "not_found" }, 404);

    const oauthStart = url.pathname.match(/^\/auth\/oauth\/(google|github|apple)\/start$/);
    if (request.method === "GET" && oauthStart) {
      try {
        const redirectUri = url.searchParams.get("redirect_uri");
        if (!redirectUri) return json({ error: "invalid_request" }, 400);
        const target = await service.startOAuth(oauthStart[1] as "google" | "github" | "apple", redirectUri);
        return new Response(null, { status: 302, headers: { location: target.toString(), "cache-control": "no-store" } });
      } catch {
        return json({ error: "authentication_failed" }, 400);
      }
    }

    const oauthCallback = url.pathname.match(/^\/auth\/oauth\/(google|github|apple)\/callback$/);
    if (request.method === "GET" && oauthCallback) {
      try {
        const state = url.searchParams.get("state") ?? "";
        const code = url.searchParams.get("code") ?? "";
        const token = await service.completeOAuth(oauthCallback[1] as "google" | "github" | "apple", state, code);
        return json({ authenticated: true }, 200, { "set-cookie": setCookie(token), "cache-control": "no-store" });
      } catch {
        return json({ error: "authentication_failed" }, 401);
      }
    }

    if (request.method === "POST" && url.pathname === "/auth/magic-link/request") {
      if (!originAllowed(request)) return json({ error: "forbidden" }, 403);
      try {
        const body = await request.json() as { email?: unknown };
        await service.requestMagicLink(typeof body.email === "string" ? body.email : "");
      } catch {
        // Keep the public response non-enumerating and structurally uniform.
      }
      return json({ accepted: true }, 202, { "cache-control": "no-store" });
    }

    if (request.method === "POST" && url.pathname === "/auth/magic-link/consume") {
      if (!originAllowed(request)) return json({ error: "forbidden" }, 403);
      try {
        const body = await request.json() as { token?: unknown };
        if (typeof body.token !== "string") throw new InvalidAuthenticationError();
        const token = await service.consumeMagicLink(body.token);
        return json({ authenticated: true }, 200, { "set-cookie": setCookie(token), "cache-control": "no-store" });
      } catch {
        return json({ error: "authentication_failed" }, 401);
      }
    }

    if (request.method === "GET" && url.pathname === "/auth/session") {
      const token = readToken(request);
      const session = token ? await service.resolve(token) : null;
      if (!session) return json({ error: "unauthenticated" }, 401, { "cache-control": "no-store" });
      return json({ user: session.user, session: session.session }, 200, { "cache-control": "no-store" });
    }

    if (request.method === "POST" && url.pathname === "/auth/logout") {
      if (!originAllowed(request)) return json({ error: "forbidden" }, 403);
      const token = readToken(request);
      if (token) await service.revoke(token);
      return new Response(null, { status: 204, headers: { "set-cookie": clearCookie(), "cache-control": "no-store" } });
    }

    return json({ error: "not_found" }, 404);
  };
}


/** Resolves CLI bearer credentials through the same server session endpoint as the browser. */
export class HttpSessionResolver implements SessionResolver {
  constructor(
    private readonly apiOrigin: URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (apiOrigin.protocol !== "https:" && apiOrigin.hostname !== "localhost") {
      throw new TypeError("Authentication API origin must use HTTPS.");
    }
  }

  async resolve(token: string): Promise<AuthenticatedSession | null> {
    if (!/^[a-f0-9]{64,128}$/i.test(token)) return null;
    let response: Response;
    try {
      response = await this.fetcher(new URL("/auth/session", this.apiOrigin), {
        method: "GET",
        headers: { authorization: "Bearer " + token, accept: "application/json" },
        redirect: "error",
        cache: "no-store",
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    try {
      const value = await response.json() as {
        user?: { id?: unknown; email?: unknown };
        session?: { id?: unknown; userId?: unknown; expiresAt?: unknown };
      };
      if (
        typeof value.user?.id !== "string" ||
        !(typeof value.user.email === "string" || value.user.email === null) ||
        typeof value.session?.id !== "string" ||
        typeof value.session.userId !== "string" ||
        typeof value.session.expiresAt !== "string" ||
        Date.parse(value.session.expiresAt) <= Date.now()
      ) return null;
      return {
        user: { id: value.user.id, email: value.user.email },
        session: { id: value.session.id, userId: value.session.userId, expiresAt: value.session.expiresAt },
      };
    } catch {
      return null;
    }
  }
}
