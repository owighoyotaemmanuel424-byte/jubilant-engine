import { describe, expect, it } from "vitest";
import type { AdCreative } from "../packages/ads/src";
const validCreative: AdCreative = { id: "ad-1", sponsorName: "Example", label: "Sponsored", headline: "Build faster", destinationUrl: "https://example.com", contextualCategory: "developer-tools" };
// @ts-expect-error AdCreative.label must be the literal "Sponsored".
const invalidCreative: AdCreative = { ...validCreative, label: "Advertisement" };
describe("ad creative disclosure contract", () => {
  it("accepts only the Sponsored disclosure label at type level", () => {
    expect(validCreative.label).toBe("Sponsored");
    expect(invalidCreative.label).toBe("Advertisement");
  });
});
