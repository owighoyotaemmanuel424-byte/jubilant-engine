import { describe, expect, it } from "vitest";
import { AnthropicClient, OpenAICompatibleClient, resolveModelForTier, type ProviderId } from "../packages/llm-providers/src";
import type { FetchLike } from "../packages/llm-providers/src/http";
import { ToolStreamAccumulator } from "../packages/agent-runtime/src/tool-parser";
function clientFor(provider: ProviderId, payload: string) {
  const fetcher: FetchLike = async () => new Response(payload, { status: 200, headers: { "content-type": "text/event-stream" } });
  const options = { apiKey: "recorded-test-key", baseUrl: provider === "deepseek" ? "https://api.deepseek.com" : provider === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com", fetcher };
  return provider === "anthropic" ? new AnthropicClient(options) : new OpenAICompatibleClient(provider, options);
}
describe("provider SSE streaming", () => {
  it.each(["deepseek", "openai"] as const)("streams interleaved text and fragmented tool calls for %s", async (provider) => {
    const payload = [
      'data: {"choices":[{"delta":{"content":"hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"write_file","arguments":"{\\"path\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.ts\\",\\"content\\":\\"ok\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
      "data: [DONE]\n\n"
    ].join("");
    const accumulator = new ToolStreamAccumulator();
    for await (const event of clientFor(provider, payload).stream({ model: resolveModelForTier(provider, "free"), messages: [{ role: "user", content: "write file" }] })) {
      if (event.type === "text_delta") accumulator.pushText(event.text);
      if (event.type === "tool_delta") accumulator.pushToolDelta(event.index, event);
    }
    const result = accumulator.finish(); expect(result.text).toBe("hello "); expect(result.toolCalls[0]?.arguments["path"]).toBe("a.ts");
  });
  it("normalizes Anthropic message and tool stream events", async () => {
    const payload = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"write_file","input":{}}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"b.ts\\",\\"content\\":\\"done\\"}"}}\n\n',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"finished"}}\n\n',
      'data: {"type":"message_stop"}\n\n'
    ].join("");
    const accumulator = new ToolStreamAccumulator();
    for await (const event of clientFor("anthropic", payload).stream({ model: resolveModelForTier("anthropic", "free"), messages: [{ role: "user", content: "write file" }] })) {
      if (event.type === "text_delta") accumulator.pushText(event.text);
      if (event.type === "tool_delta") accumulator.pushToolDelta(event.index, event);
    }
    const result = accumulator.finish(); expect(result.text).toBe("finished"); expect(result.toolCalls[0]?.arguments["path"]).toBe("b.ts");
  });
  it("cancels an active SSE stream and closes its reader", async () => {
    let cancelled = false; const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n')); }, cancel() { cancelled = true; } });
    const fetcher: FetchLike = async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
    const client = new OpenAICompatibleClient("openai", { apiKey: "recorded-test-key", baseUrl: "https://api.openai.com/v1", fetcher });
    const controller = new AbortController();
    const iterator = client.stream({ model: resolveModelForTier("openai", "free"), messages: [{ role: "user", content: "stream" }] }, controller.signal)[Symbol.asyncIterator]();
    expect((await iterator.next()).value?.type).toBe("text_delta"); controller.abort();
    await expect(iterator.next()).rejects.toMatchObject({ name: "AbortError" }); expect(cancelled).toBe(true);
  });
});
