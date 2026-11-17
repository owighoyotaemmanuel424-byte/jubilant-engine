import { describe, expect, it } from "vitest";
import { ToolStreamAccumulator, parseToolCall } from "../packages/agent-runtime/src/tool-parser";
describe("deterministic tool parsing", () => {
  it("rejects malformed and truncated JSON", () => { expect(() => parseToolCall("1", "write_file", '{"path":')).toThrow("Malformed"); expect(() => parseToolCall("1", "write_file", '{"path":"x"')).toThrow("Malformed"); });
  it("rejects non-object JSON, unsafe keys, and invalid tool names", () => { expect(() => parseToolCall("1", "write_file", "[]")).toThrow("object"); expect(() => parseToolCall("1", "write_file", '{"__proto__":{"polluted":true}}')).toThrow("Unsafe"); expect(() => parseToolCall("1", "bad name", "{}")).toThrow("identity"); });
  it("keeps interleaved text and fragmented tool arguments deterministic", () => {
    const stream = new ToolStreamAccumulator(); stream.pushText("I will "); stream.pushToolDelta(0, { id: "call-a", name: "write_file", arguments: '{"path":' }); stream.pushText("write a file."); stream.pushToolDelta(0, { arguments: '"a.ts","content":"ok"}' }); stream.pushToolDelta(1, { id: "call-b", name: "read_file", arguments: '{"path":"b.ts"}' });
    const result = stream.finish(); expect(result.text).toBe("I will write a file."); expect(result.toolCalls.map((call) => call.name)).toEqual(["write_file", "read_file"]); expect(result.toolCalls[0]?.arguments["path"]).toBe("a.ts");
  });
});
