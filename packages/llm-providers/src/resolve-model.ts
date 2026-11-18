import { MODEL_CATALOGUE, type AccountTier, type ModelDescriptor, type ProviderId } from "./model-catalog";

const TIER_MODEL: Readonly<Record<ProviderId, Readonly<Record<AccountTier, string>>>> = {
  deepseek: { free: "deepseek-flash", paid: "deepseek-v4-pro", internal: "deepseek-v4-pro" },
  openai: { free: "gpt-6-luna", paid: "gpt-6.1-sol", internal: "gpt-6-astra" },
  anthropic: { free: "claude-haiku-5-5", paid: "claude-sonnet-5-5", internal: "claude-opus-5-5" }
};

export function resolveModelForTier(provider: ProviderId, tier: AccountTier): ModelDescriptor {
  const modelId = TIER_MODEL[provider][tier];
  const model = MODEL_CATALOGUE.find((candidate) => candidate.provider === provider && candidate.id === modelId);
  if (!model) throw new Error("No model configured for provider and tier");
  return model;
}
