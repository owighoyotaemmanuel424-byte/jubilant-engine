export interface AdCreative {
  readonly id: string;
  readonly sponsorName: string;
  readonly label: "Sponsored";
  readonly headline: string;
  readonly destinationUrl: string;
  readonly contextualCategory: string;
}
export function validateAdCreative(value: AdCreative): AdCreative {
  const url = new URL(value.destinationUrl);
  if (url.protocol !== "https:") throw new Error("Ad destination must use HTTPS");
  if (value.label !== "Sponsored") throw new Error("Ad creative must be labeled Sponsored");
  return value;
}
