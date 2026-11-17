export type Identifier = string;
export type ISODateTime = string;
export type AgentRole = "user" | "assistant" | "system" | "tool";
export type AgentStatus = "idle" | "running" | "waiting_for_tool" | "cancelled" | "failed" | "completed";
export interface Agent { readonly id: Identifier; readonly name: string; readonly version: string; }
export interface ToolInput { readonly [key: string]: string | number | boolean | null | readonly string[]; }
export interface Tool { readonly id: Identifier; readonly name: string; readonly description: string; readonly inputSchema: Readonly<Record<string, unknown>>; }
export interface SessionMessage { readonly id: Identifier; readonly role: AgentRole; readonly content: string; readonly createdAt: ISODateTime; }
export interface Session { readonly id: Identifier; readonly userId: Identifier; readonly projectId: Identifier; readonly status: AgentStatus; readonly messages: readonly SessionMessage[]; readonly createdAt: ISODateTime; readonly updatedAt: ISODateTime; }
export interface QuotaPolicy { readonly countryCode: string; readonly freeHoursPerDay: number; readonly paidHoursPerDay: number; readonly timezone: string; }
export interface QuotaUsage { readonly userId: Identifier; readonly localDate: string; readonly activeSeconds: number; readonly limitSeconds: number; readonly remainingSeconds: number; }
export interface Ad { readonly id: Identifier; readonly sponsorName: string; readonly label: "Sponsored"; readonly headline: string; readonly destinationUrl: string; readonly contextualCategory: string; }
export interface ProviderConfig { readonly provider: "deepseek" | "openai" | "anthropic"; readonly model: string; readonly tier: "free" | "paid" | "internal"; }
export interface AgentEvent { readonly sessionId: Identifier; readonly sequence: number; readonly type: "text_delta" | "tool_call" | "tool_result" | "status" | "error"; readonly timestamp: ISODateTime; readonly payload: Readonly<Record<string, string | number | boolean | null>>; }
export * from "./redaction";
