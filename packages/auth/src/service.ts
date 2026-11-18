import {
  createOpaqueToken,
  hashOpaqueToken,
  type AuthChallenge,
  type AuthIdentity,
  type AuthProvider,
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
  findUserByVerifiedEmail(email: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
}

export interface OAuthProviderConfig {
  readonly provider: OAuthIdentityProvider;
  readonly issuer: string;
  readonly audience: string;
}

export interface AuthenticatedSession {
  readonly user: AuthUser;
  readonly session: AuthSession;
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
    if (redirect.origin !== this.publicOrigin.origin) throw new InvalidAuthenticationError();

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

    let identity: AuthIdentity | null = await this.store.findIdentity(providerName, profile.subject);
    let user: AuthUser | null = identity ? await this.store.findUserById(identity.userId) : null;
    if (identity && !user) throw new InvalidAuthenticationError();
    if (!user) {
      const verifiedEmail = profile.emailVerified ? profile.email?.trim().toLowerCase() ?? null : null;
      user = await this.store.createUser({ email: verifiedEmail, phone: null });
      identity = await this.store.linkIdentity(user.id, providerName, profile.subject);
    }
    return this.issueSession(user);
  }

  async requestMagicLink(destination: string): Promise<void> {
    const normalized = destination.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return;
    const token = createOpaqueToken();
    await this.store.createChallenge({
      method: "email_magic_link",
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

    // The store resolves the destination digest to a verified user atomically with challenge consumption.
    const user = await this.store.findUserByVerifiedEmailDigest(challenge.destinationHash);
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
    return user ? { user, session } : null;
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
