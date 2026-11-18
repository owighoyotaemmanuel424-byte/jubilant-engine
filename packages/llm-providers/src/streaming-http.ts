import { ProviderHttpError, ProviderTimeoutError, type HttpClientOptions } from "./http";
export interface OpenStreamResult { readonly response: Response; dispose(): void; }
export async function openSse(options: HttpClientOptions, path: string, headers: Readonly<Record<string, string>>, body: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<OpenStreamResult> {
  const controller = new AbortController(); let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 30_000);
  const relayAbort = (): void => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });
  const dispose = (): void => { clearTimeout(timeout); signal?.removeEventListener("abort", relayAbort); };
  try {
    const response = await (options.fetcher ?? fetch)(new URL(path, options.baseUrl), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${options.apiKey}`, ...headers }, body: JSON.stringify({ ...body, stream: true }), signal: controller.signal });
    if (!response.ok) throw new ProviderHttpError(response.status, `Provider returned HTTP ${response.status}`);
    return { response, dispose };
  } catch (error) { dispose(); if (timedOut) throw new ProviderTimeoutError(); throw error; }
}
export async function* readSseJson(response: Response, signal?: AbortSignal): AsyncGenerator<unknown> {
  if (!response.body) throw new Error("Provider streaming response has no body");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let dataLines: string[] = [];
  const consumeLine = (line: string): unknown | undefined => {
    if (line.length === 0) { if (dataLines.length === 0) return undefined; const data = dataLines.join("\n"); dataLines = []; if (data === "[DONE]") return "[DONE]"; return JSON.parse(data) as unknown; }
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    return undefined;
  };
  const abort = (): void => { void reader.cancel(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Stream cancelled", "AbortError");
      const result = await reader.read(); if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines) { const event = consumeLine(line.replace(/\r$/, "")); if (event === "[DONE]") return; if (event !== undefined) yield event; }
    }
    if (signal?.aborted) throw new DOMException("Stream cancelled", "AbortError");
    buffer += decoder.decode();
    if (buffer.length > 0) { const event = consumeLine(buffer.replace(/\r$/, "")); if (event !== undefined && event !== "[DONE]") yield event; }
    const finalEvent = consumeLine(""); if (finalEvent !== undefined && finalEvent !== "[DONE]") yield finalEvent;
  } finally { signal?.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}
