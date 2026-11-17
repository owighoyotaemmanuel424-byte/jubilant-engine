import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken, sessionCookieOptions } from "../packages/auth/src/index";

describe("authentication security primitives", () => {
  it("creates a high-entropy opaque token without separators", () => {
    const token = createOpaqueToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(createOpaqueToken()).not.toBe(token);
  });

  it("hashes a token deterministically without returning the raw token", async () => {
    const token = createOpaqueToken();
    const digest = await hashOpaqueToken(token);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(token);
    expect(await hashOpaqueToken(token)).toBe(digest);
  });

  it("rejects weak or invalid entropy requests", () => {
    expect(() => createOpaqueToken(16)).toThrow(RangeError);
    expect(() => createOpaqueToken(65)).toThrow(RangeError);
    expect(() => createOpaqueToken(32.5)).toThrow(RangeError);
  });

  it("sets host-only, HTTP-only, secure, same-site session cookie defaults", () => {
    expect(sessionCookieOptions.name).toBe("__Host-freebuff_session");
    expect(sessionCookieOptions.httpOnly).toBe(true);
    expect(sessionCookieOptions.secure).toBe(true);
    expect(sessionCookieOptions.sameSite).toBe("lax");
    expect(sessionCookieOptions.path).toBe("/");
    expect("domain" in sessionCookieOptions).toBe(false);
  });
});
