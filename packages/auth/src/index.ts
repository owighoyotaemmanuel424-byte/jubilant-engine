export const packageName = "@freebuff/auth" as const;

export type AuthMethod = "oauth" | "email_magic_link" | "phone_otp";
export type AuthProvider = "google" | "github" | "apple" | "email" | "phone";

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly emailVerifiedAt: string | null;
  readonly phone: string | null;
  readonly phoneVerifiedAt: string | null;
  readonly createdAt: string;
}

export interface AuthIdentity {
  readonly id: string;
  readonly userId: string;
  readonly provider: AuthProvider;
  readonly subject: string;
  readonly createdAt: string;
}

export interface AuthSession {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface AuthChallenge {
  readonly id: string;
  readonly method: "email_magic_link" | "phone_otp";
  readonly destinationHash: string;
  readonly secretHash: string;
  readonly expiresAt: string;
  readonly consumedAt: string | null;
  readonly failedAttempts: number;
}

export interface OAuthAuthorizationRequest {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly redirectUri: string;
}

export interface OAuthProfile {
  readonly subject: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly displayName: string | null;
}

export interface OAuthIdentityProvider {
  readonly provider: "google" | "github" | "apple";
  createAuthorizationUrl(request: OAuthAuthorizationRequest): URL;
  exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthProfile>;
}

export interface ChallengeDeliveryAdapter {
  sendEmailMagicLink(destination: string, oneTimeUrl: URL): Promise<void>;
  sendPhoneOtp(destination: string, code: string): Promise<void>;
}

export interface AuthRepository {
  findIdentity(provider: AuthProvider, subject: string): Promise<AuthIdentity | null>;
  createUser(input: Pick<AuthUser, "email" | "phone">): Promise<AuthUser>;
  linkIdentity(userId: string, provider: AuthProvider, subject: string): Promise<AuthIdentity>;
  createSession(input: Omit<AuthSession, "id" | "createdAt" | "lastSeenAt" | "revokedAt">): Promise<AuthSession>;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | null>;
  findUserByVerifiedEmailDigest(destinationHash: string): Promise<AuthUser | null>;
  revokeSession(sessionId: string, revokedAt: string): Promise<void>;
  revokeAllSessions(userId: string, revokedAt: string): Promise<void>;
  consumeChallengeAtomically(secretHash: string, now: string): Promise<AuthChallenge | null>;
}

export const sessionCookieOptions = Object.freeze({
  name: "__Host-freebuff_session",
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAgeSeconds: 60 * 60 * 24 * 30,
});

/** Creates a cryptographically random opaque token. Persist only its digest. */
export function createOpaqueToken(byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength < 32 || byteLength > 64) {
    throw new RangeError("Opaque tokens must contain between 32 and 64 random bytes.");
  }
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Returns a lowercase SHA-256 hex digest; never persist the raw session token. */
export async function hashOpaqueToken(token: string): Promise<string> {
  if (token.length < 64 || !/^[a-f0-9]+$/i.test(token)) {
    throw new TypeError("Opaque token must be a hex-encoded random secret.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export * from "./service";
