import { describe, expect, it } from "vitest";
import { localDateKey, nextLocalMidnight } from "../packages/quota/src/local-midnight";
describe("DST-safe local calendar reset", () => {
  it("uses a 23-hour local day across spring-forward", () => {
    const now = new Date("2026-03-08T05:00:00.000Z");
    expect(localDateKey(now, "America/New_York")).toBe("2026-03-08");
    expect((nextLocalMidnight(now, "America/New_York").getTime() - now.getTime()) / 3_600_000).toBe(23);
  });
  it("uses a 25-hour local day across fall-back", () => {
    const now = new Date("2026-11-01T04:00:00.000Z");
    expect(localDateKey(now, "America/New_York")).toBe("2026-11-01");
    expect((nextLocalMidnight(now, "America/New_York").getTime() - now.getTime()) / 3_600_000).toBe(25);
  });
});
