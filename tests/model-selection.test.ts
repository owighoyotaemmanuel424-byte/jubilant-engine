import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { MODEL_CATALOGUE } from "../packages/llm-providers/src/model-catalog";
import { resolveModelForTier } from "../packages/llm-providers/src/resolve-model";
import type { AccountTier, ProviderId } from "../packages/llm-providers/src/model-catalog";
async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) files.push(path);
  }
  return files;
}
describe("tier model selection policy", () => {
  it("resolves every supported provider and tier through the single resolver", () => {
    const providers: readonly ProviderId[] = ["deepseek", "openai", "anthropic"];
    const tiers: readonly AccountTier[] = ["free", "paid", "internal"];
    for (const provider of providers) for (const tier of tiers) {
      const resolved = resolveModelForTier(provider, tier);
      expect(resolved.provider).toBe(provider);
      expect(MODEL_CATALOGUE).toContain(resolved);
    }
  });
  it("keeps literal model IDs out of application and runtime code", async () => {
    const modelIds = MODEL_CATALOGUE.map((model) => model.id);
    for (const root of ["packages", "apps"]) for (const path of await sourceFiles(join(process.cwd(), root))) {
      if (path.endsWith("model-catalog.ts") || path.endsWith("resolve-model.ts")) continue;
      const source = await readFile(path, "utf8");
      for (const modelId of modelIds) expect(source, `hardcoded model ID in ${path}`).not.toContain(modelId);
      expect(source, `tier map outside resolver in ${path}`).not.toContain("TIER_MODEL");
    }
  });
});
