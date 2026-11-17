import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "../packages/shared/src/redaction";
describe("adversarial secret redaction", () => {
  it("redacts bearer tokens, API keys, GitHub tokens and private keys", () => {
    const input = "Authorization: Bearer demo api_key=sk-abcdefghijklmnopqrstuvwxyz123456 ghp_abcdefghijklmnopqrstuvwxyz1234567890";
    const output = redactSensitiveText(input);
    expect(output).not.toContain("demo");
    expect(output).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(output).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
  });
  it("redacts PEM blocks spanning newlines", () => {
    const output = redactSensitiveText("-----BEGIN RSA PRIVATE KEY-----\nsecret-material\n-----END RSA PRIVATE KEY-----");
    expect(output).toBe("[REDACTED]");
  });
  it("handles mixed casing and nested-looking text without throwing", () => {
    const output = redactSensitiveText('{"client_secret":"top-secret","note":"password=hunter2"}');
    expect(output).not.toContain("top-secret");
    expect(output).not.toContain("hunter2");
  });
});
