import { describe, expect, it } from "vitest";
import { runAgentTurn } from "../packages/agent-runtime/src/agent-loop";
import { resolveModelForTier } from "../packages/llm-providers/src/resolve-model";
import type { ProviderClient } from "../packages/llm-providers/src/provider-types";
const fixtures = [
  { prompt: "create a readme", path: "README.md", content: "# Project\n", expected: "# Project\n" },
  { prompt: "add a greeting module", path: "src/greeting.ts", content: "export const greeting = 'hello';\n", expected: "export const greeting = 'hello';\n" },
  { prompt: "add a health route", path: "src/health.ts", content: "export const health = () => ({ ok: true });\n", expected: "export const health = () => ({ ok: true });\n" },
  { prompt: "add a test fixture", path: "tests/example.fixture.ts", content: "export const fixture = 42;\n", expected: "export const fixture = 42;\n" },
  { prompt: "add environment example", path: ".env.example", content: "APP_ENV=development\n", expected: "APP_ENV=development\n" }
] as const;
describe("scripted agent fixture tasks", () => {
  it.each(fixtures)("produces the expected diff for $prompt", async (fixture) => {
    const files = new Map<string, string>(); let turn = 0;
    const provider: ProviderClient = { async complete() {
      turn += 1;
      if (turn === 1) return { provider: "deepseek", model: "fixture", text: "Applying the requested change.", toolCalls: [{ id: "write-1", name: "write_file", arguments: { path: fixture.path, content: fixture.content } }] };
      return { provider: "deepseek", model: "fixture", text: "Done.", toolCalls: [] };
    } };
    const result = await runAgentTurn(provider, { model: resolveModelForTier("deepseek", "free"), messages: [{ role: "user", content: fixture.prompt }], tools: [{ name: "write_file", async execute(input) {
      const path = input["path"]; const content = input["content"];
      if (typeof path !== "string" || typeof content !== "string") throw new Error("invalid write_file arguments");
      files.set(path, content); return { path, written: true };
    } }] });
    expect(result.toolCalls).toBe(1); expect(files.get(fixture.path)).toBe(fixture.expected);
  });
});
