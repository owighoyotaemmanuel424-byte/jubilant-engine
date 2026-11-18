import type { ProviderClient, ProviderMessage, ProviderToolCall } from "../../llm-providers/src/provider-types";
import type { ModelDescriptor } from "../../llm-providers/src/model-catalog";
export interface RuntimeTool { readonly name: string; execute(input: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown>; }
export interface AgentRunInput { readonly model: ModelDescriptor; readonly messages: readonly ProviderMessage[]; readonly tools: readonly RuntimeTool[]; readonly maxTurns?: number; readonly signal?: AbortSignal; }
export interface AgentRunResult { readonly text: string; readonly turns: number; readonly toolCalls: number; }
function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError"); }
export async function runAgentTurn(provider: ProviderClient, input: AgentRunInput): Promise<AgentRunResult> {
  const messages: ProviderMessage[] = [...input.messages];
  const tools = new Map(input.tools.map((tool) => [tool.name, tool]));
  const maxTurns = input.maxTurns ?? 8;
  let toolCallCount = 0;
  let finalText = "";
  for (let turn = 0; turn < maxTurns; turn += 1) {
    throwIfAborted(input.signal);
    const response = await provider.complete({ model: input.model, messages }, input.signal);
    finalText += response.text;
    if (response.toolCalls.length === 0) return { text: finalText, turns: turn + 1, toolCalls: toolCallCount };
    messages.push({ role: "assistant", content: response.text });
    for (const call of response.toolCalls) {
      throwIfAborted(input.signal);
      const tool = tools.get(call.name);
      if (!tool) throw new Error(`Unknown tool: ${call.name}`);
      const result = await tool.execute(call.arguments, input.signal);
      toolCallCount += 1;
      messages.push({ role: "user", content: `Tool result ${call.id}: ${JSON.stringify(result)}` });
    }
  }
  throw new Error("Agent exceeded maximum turns");
}
export function isToolCall(value: ProviderToolCall): boolean { return value.name.length > 0 && value.id.length > 0; }
