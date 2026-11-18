import type { ProviderToolCall } from "../../llm-providers/src/provider-types";
const SAFE_NAME = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;
export function parseToolCall(id: string, name: string, rawArguments: string): ProviderToolCall {
  if (!SAFE_NAME.test(name) || id.length === 0 || id.length > 128) throw new Error("Invalid tool call identity");
  if (rawArguments.length > 256_000) throw new Error("Tool arguments exceed size limit");
  let parsed: unknown;
  try { parsed = JSON.parse(rawArguments); } catch { throw new Error("Malformed or truncated tool arguments"); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Tool arguments must be a JSON object");
  const args = parsed as Record<string, unknown>;
  for (const key of Object.keys(args)) if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Unsafe tool argument key");
  return { id, name, arguments: args };
}
export class ToolStreamAccumulator {
  private readonly textParts: string[] = [];
  private readonly toolParts = new Map<number, { id: string; name: string; arguments: string }>();
  pushText(delta: string): void { this.textParts.push(delta); }
  pushToolDelta(index: number, delta: { id?: string; name?: string; arguments?: string }): void {
    const current = this.toolParts.get(index) ?? { id: `stream-${index}`, name: "", arguments: "" };
    this.toolParts.set(index, { id: delta.id ?? current.id, name: delta.name ?? current.name, arguments: current.arguments + (delta.arguments ?? "") });
  }
  finish(): { readonly text: string; readonly toolCalls: readonly ProviderToolCall[] } {
    const toolCalls = [...this.toolParts.entries()].sort(([a], [b]) => a - b).map(([, part]) => parseToolCall(part.id, part.name, part.arguments));
    return { text: this.textParts.join(""), toolCalls };
  }
}
