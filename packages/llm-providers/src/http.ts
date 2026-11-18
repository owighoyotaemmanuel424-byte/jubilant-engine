export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "ProviderHttpError"; }
  get retryable(): boolean { return this.status === 408 || this.status === 409 || this.status === 425 || this.status === 429 || this.status >= 500; }
}
export class ProviderTimeoutError extends Error { constructor() { super("Provider request timed out"); this.name = "ProviderTimeoutError"; } }
export type FetchLike = (input: URL, init?: RequestInit) => Promise<Response>;
export interface HttpClientOptions { readonly apiKey: string; readonly baseUrl: string; readonly timeoutMs?: number; readonly fetcher?: FetchLike; }
export async function postJson(options: HttpClientOptions, path: string, headers: Readonly<Record<string, string>>, body: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController(); let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 30_000);
  const relayAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  try {
    const response = await (options.fetcher ?? fetch)(new URL(path, options.baseUrl), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}`, ...headers }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new ProviderHttpError(response.status, `Provider returned HTTP ${response.status}`);
    return await response.json() as unknown;
  } catch (error) { if (timedOut) throw new ProviderTimeoutError(); throw error; }
  finally { clearTimeout(timeout); signal?.removeEventListener("abort", relayAbort); }
}
export function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid provider response object");
  return value as Record<string, unknown>;
}
export function asString(value: unknown, fallback = ""): string { return typeof value === "string" ? value : fallback; }
