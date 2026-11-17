import type { ProviderRequest, ProviderResponse, ProviderToolCall, ProviderStreamEvent, StreamingProviderClient } from "./provider-types";
import { asRecord, asString, postJson, type HttpClientOptions } from "./http";
import { openSse, readSseJson } from "./streaming-http";
export class OpenAICompatibleClient implements StreamingProviderClient {
  constructor(private readonly provider: "openai" | "deepseek", private readonly options: HttpClientOptions) {}
  async complete(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    if (request.model.provider !== this.provider) throw new Error("Model provider does not match client");
    const raw = asRecord(await postJson(this.options, "/chat/completions", {}, { model: request.model.id, messages: request.messages, max_tokens: request.maxOutputTokens ?? request.model.maxOutputTokens, ...(request.temperature === undefined ? {} : { temperature: request.temperature }) }, signal));
    const choices = raw["choices"]; if (!Array.isArray(choices) || choices.length === 0) throw new Error("Provider response has no choices");
    const message = asRecord(asRecord(choices[0])["message"]); const callsRaw = message["tool_calls"];
    const toolCalls: ProviderToolCall[] = Array.isArray(callsRaw) ? callsRaw.map((item, index) => { const call = asRecord(item); const fn = asRecord(call["function"]); return { id: asString(call["id"], `call-${index}`), name: asString(fn["name"]), arguments: asRecord(JSON.parse(asString(fn["arguments"], "{}")) as unknown) }; }) : [];
    const usage = typeof raw["usage"] === "object" && raw["usage"] !== null ? asRecord(raw["usage"]) : {};
    return { provider: this.provider, model: request.model.id, text: asString(message["content"]), toolCalls, ...(typeof usage["prompt_tokens"] === "number" ? { inputTokens: usage["prompt_tokens"] } : {}), ...(typeof usage["completion_tokens"] === "number" ? { outputTokens: usage["completion_tokens"] } : {}) };
  }
  async *stream(request: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent> {
    if (request.model.provider !== this.provider) throw new Error("Model provider does not match client");
    const opened = await openSse(this.options, "/chat/completions", {}, { model: request.model.id, messages: request.messages, max_tokens: request.maxOutputTokens ?? request.model.maxOutputTokens }, signal);
    try {
      for await (const event of readSseJson(opened.response, signal)) {
        const root = asRecord(event); const choices = Array.isArray(root["choices"]) ? root["choices"] : [];
        for (const choiceValue of choices) {
          const choice = asRecord(choiceValue); const delta = asRecord(choice["delta"]);
          if (typeof delta["content"] === "string" && delta["content"].length > 0) yield { type: "text_delta", text: delta["content"] };
          if (Array.isArray(delta["tool_calls"])) for (const callValue of delta["tool_calls"]) {
            const call = asRecord(callValue); const fn = typeof call["function"] === "object" && call["function"] !== null ? asRecord(call["function"]) : {};
            yield { type: "tool_delta", index: typeof call["index"] === "number" ? call["index"] : 0, ...(typeof call["id"] === "string" ? { id: call["id"] } : {}), ...(typeof fn["name"] === "string" ? { name: fn["name"] } : {}), ...(typeof fn["arguments"] === "string" ? { arguments: fn["arguments"] } : {}) };
          }
          if (choice["finish_reason"] !== null && choice["finish_reason"] !== undefined) yield { type: "done" };
        }
      }
    } finally { opened.dispose(); }
  }
}
