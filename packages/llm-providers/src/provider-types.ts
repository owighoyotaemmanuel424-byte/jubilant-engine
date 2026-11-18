import type { ModelDescriptor, ProviderId } from "./model-catalog";
export interface ProviderMessage { readonly role: "system" | "user" | "assistant"; readonly content: string; }
export interface ProviderToolCall { readonly id: string; readonly name: string; readonly arguments: Readonly<Record<string, unknown>>; }
export interface ProviderRequest { readonly model: ModelDescriptor; readonly messages: readonly ProviderMessage[]; readonly maxOutputTokens?: number; readonly temperature?: number; }
export interface ProviderResponse { readonly provider: ProviderId; readonly model: string; readonly text: string; readonly toolCalls: readonly ProviderToolCall[]; readonly inputTokens?: number; readonly outputTokens?: number; }
export type ProviderStreamEvent = { readonly type: "text_delta"; readonly text: string } | { readonly type: "tool_delta"; readonly index: number; readonly id?: string; readonly name?: string; readonly arguments?: string } | { readonly type: "done" };
export interface ProviderClient { complete(request: ProviderRequest, signal?: AbortSignal): Promise<ProviderResponse>; }
export interface StreamingProviderClient extends ProviderClient { stream(request: ProviderRequest, signal?: AbortSignal): AsyncIterable<ProviderStreamEvent>; }
