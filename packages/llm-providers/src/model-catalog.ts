export type ProviderId = "deepseek" | "openai" | "anthropic";
export type AccountTier = "free" | "paid" | "internal";
export interface ModelPricing {
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly notes?: string;
}
export interface ModelDescriptor {
  readonly id: string;
  readonly provider: ProviderId;
  readonly displayName: string;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly pricing: ModelPricing;
  readonly capabilities: readonly ("text" | "image" | "tools" | "reasoning")[];
}
export const MODEL_CATALOGUE_AS_OF = "2026-11-17" as const;
export const MODEL_CATALOGUE: readonly ModelDescriptor[] = [
  { id: "deepseek-flash", provider: "deepseek", displayName: "DeepSeek V4.1 Flash", contextWindow: 1_000_000, maxOutputTokens: 393_216, pricing: { inputUsdPerMillion: 0.30, outputUsdPerMillion: 1.20, notes: "Peak cache-miss input and peak output; off-peak rates are half; cached input is separately priced." }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "deepseek-v4-pro", provider: "deepseek", displayName: "DeepSeek V4 Pro", contextWindow: 1_000_000, maxOutputTokens: 393_216, pricing: { inputUsdPerMillion: 1.32, outputUsdPerMillion: 3.96, notes: "Peak cache-miss input and peak output; off-peak rates are half; cached input is separately priced." }, capabilities: ["text", "tools", "reasoning"] },
  { id: "gpt-6-luna", provider: "openai", displayName: "GPT-6 Luna", contextWindow: 1_050_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 0.10, outputUsdPerMillion: 0.50 }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "gpt-6.1-terra", provider: "openai", displayName: "GPT-6.1 Terra", contextWindow: 1_050_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 1.00, outputUsdPerMillion: 5.00 }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "gpt-6.1-sol", provider: "openai", displayName: "GPT-6.1 Sol", contextWindow: 1_050_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 2.00, outputUsdPerMillion: 10.00 }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "gpt-6-astra", provider: "openai", displayName: "GPT-6 Astra", contextWindow: 1_050_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 10.00, outputUsdPerMillion: 50.00 }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "claude-haiku-5-5", provider: "anthropic", displayName: "Claude Haiku 5.5", contextWindow: 1_000_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 0.10, outputUsdPerMillion: 0.50, notes: "Base rate for prompts up to 100K input tokens; higher-input tier costs more." }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "claude-sonnet-5-5", provider: "anthropic", displayName: "Claude Sonnet 5.5", contextWindow: 1_000_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 2.00, outputUsdPerMillion: 10.00 }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "claude-opus-5-5", provider: "anthropic", displayName: "Claude Opus 5.5", contextWindow: 1_000_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 4.00, outputUsdPerMillion: 20.00 }, capabilities: ["text", "image", "tools", "reasoning"] },
  { id: "claude-fable-5-2", provider: "anthropic", displayName: "Claude Fable 5.2", contextWindow: 1_000_000, maxOutputTokens: 131_072, pricing: { inputUsdPerMillion: 8.00, outputUsdPerMillion: 40.00 }, capabilities: ["text", "image", "tools", "reasoning"] }
] as const;

export function findModel(provider: ProviderId, modelId: string): ModelDescriptor | undefined {
  return MODEL_CATALOGUE.find((model) => model.provider === provider && model.id === modelId);
}
