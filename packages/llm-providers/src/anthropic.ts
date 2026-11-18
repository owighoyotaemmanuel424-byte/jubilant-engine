import type { ProviderRequest, ProviderResponse, ProviderToolCall, ProviderStreamEvent, StreamingProviderClient } from "./provider-types";
import { asRecord, asString, postJson, type HttpClientOptions } from "./http";
import { openSse, readSseJson } from "./streaming-http";
export class AnthropicClient implements StreamingProviderClient {
  constructor(private readonly options: HttpClientOptions) {}
  private requestBody(request: ProviderRequest): Readonly<Record<string, unknown>> {
    const system = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
    return { model: request.model.id, max_tokens: request.maxOutputTokens ?? request.model.maxOutputTokens, ...(system.length === 0 ? {} : { system }), messages: request.messages.filter((message) => message.role !== "system") };
  }
  private headers(): Readonly<Record<string, string>> { return { "x-api-key": this.options.apiKey, "anthropic-version": "2023-06-01" }; }
  async complete(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    if (request.model.provider !== "anthropic") throw new Error("Model provider does not match client");
    const raw = asRecord(await postJson(this.options, "/v1/messages", this.headers(), this.requestBody(request), signal));
    const content = Array.isArray(raw["content"]) ? raw["content"] : [];
    const text = content.filter((part) => typeof part === "object" && part !== null && (part as Record<string, unknown>)["type"] === "text").map((part) => asString(asRecord(part)["text"])).join("");
    const toolCalls: ProviderToolCall[] = content.filter((part) => typeof part === "object" && part !== null && (part as Record<string, unknown>)["type"] === "tool_use").map((part, index) => { const item = asRecord(part); return { id: asString(item["id"], `tool-${index}`), name: asString(item["name"]), arguments: asRecord(item["input"]) }; });
    const usage = typeof raw["usage"] === "object" && raw["usage"] !== null ? asRecord(raw["usage"]) : {};
    return { provider: "anthropic", model: request.model.id, text, toolCalls, ...(typeof usage["input_tokens"] === "number" ? { inputTokens: usage["input_tokens"] } : {}), ...(typeof usage["output_tokens"] === "number" ? { outputTokens: usage["output_tokens"] } : {}) };
  }
  async *stream(request: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    if (request.model.provider !== "anthropic") throw new Error("Model provider does not match client");
    const opened = await openSse(this.options, "/v1/messages", this.headers(), this.requestBody(request), signal);
    try {
      for await (const event of readSseJson(opened.response, signal)) {
        const root = asRecord(event);
        if (root["type"] === "content_block_start") { const block = asRecord(root["content_block"]); if (block["type"] === "tool_use") yield { type: "tool_delta", index: typeof root["index"] === "number" ? root["index"] : 0, ...(typeof block["id"] === "string" ? { id: block["id"] } : {}), ...(typeof block["name"] === "string" ? { name: block["name"] } : {}) }; }
        else if (root["type"] === "content_block_delta") { const delta = asRecord(root["delta"]); if (delta["type"] === "text_delta" && typeof delta["text"] === "string") yield { type: "text_delta", text: delta["text"] }; if (delta["type"] === "input_json_delta" && typeof delta["partial_json"] === "string") yield { type: "tool_delta", index: typeof root["index"] === "number" ? root["index"] : 0, arguments: delta["partial_json"] }; }
        else if (root["type"] === "message_stop") yield { type: "done" };
      }
    } finally { opened.dispose(); }
  }
}
