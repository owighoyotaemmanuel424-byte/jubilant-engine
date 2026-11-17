import { describe, expect, it } from "vitest";
import { AnthropicClient, OpenAICompatibleClient, ProviderTimeoutError, resolveModelForTier, type ProviderHttpError, type ProviderId } from "../packages/llm-providers/src";
import type { ProviderClient } from "../packages/llm-providers/src/provider-types";
import type { FetchLike } from "../packages/llm-providers/src/http";
function makeClient(provider: ProviderId, fetcher: FetchLike, timeoutMs = 100): ProviderClient {
  const options = { apiKey: "test-key-never-real", baseUrl: provider === "deepseek" ? "https://api.deepseek.com" : provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com", fetcher, timeoutMs };
  return provider === "anthropic" ? new AnthropicClient(options) : new OpenAICompatibleClient(provider, options);
}
const providers: readonly ProviderId[] = ["deepseek", "openai", "anthropic"];
describe.each(providers)("recorded HTTP adapter: %s", (provider) => {
  it("parses a recorded successful response", async () => {
    const payload = provider === "anthropic" ? { content: [{ type: "text", text: "recorded response" }], usage: { input_tokens: 12, output_tokens: 4 } } : { choices: [{ message: { content: "recorded response", tool_calls: [] } }], usage: { prompt_tokens: 12, completion_tokens: 4 } };
    const fetcher: FetchLike = async () => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    const result = await makeClient(provider, fetcher).complete({ model: resolveModelForTier(provider, "free"), messages: [{ role: "user", content: "hello" }] });
    expect(result.text).toBe("recorded response"); expect(result.provider).toBe(provider); expect(result.inputTokens).toBe(12);
  });
  it.each([429, 503])("classifies HTTP %s as retryable", async (status) => {
    const fetcher: FetchLike = async () => new Response("{}", { status });
    await expect(makeClient(provider, fetcher).complete({ model: resolveModelForTier(provider, "free"), messages: [] })).rejects.toMatchObject({ status, retryable: true } satisfies Partial<ProviderHttpError>);
  });
  it("times out a stalled request", async () => {
    const fetcher: FetchLike = async (_input, init) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }); });
    await expect(makeClient(provider, fetcher, 2).complete({ model: resolveModelForTier(provider, "free"), messages: [] })).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
  it("propagates caller cancellation to the in-flight HTTP connection", async () => {
    let aborted = false;
    const fetcher: FetchLike = async (_input, init) => new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); }, { once: true }); });
    const controller = new AbortController(); const pending = makeClient(provider, fetcher).complete({ model: resolveModelForTier(provider, "free"), messages: [] }, controller.signal);
    controller.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(aborted).toBe(true);
  });
});
