import { describe, expect, it } from "vitest";
import type { Ad, Agent, QuotaPolicy, Session } from "../packages/shared/src/index";
describe("shared platform contracts",()=>{
it("keeps the agent contract structurally usable",()=>{const agent:Agent={id:"agent-1",name:"Freebuff Agent",version:"0.1.0"};expect(agent.id).toBe("agent-1");});
it("requires sponsored labeling on ads",()=>{const ad:Ad={id:"ad-1",sponsorName:"Example Sponsor",label:"Sponsored",headline:"Example offer",destinationUrl:"https://example.com",contextualCategory:"developer-tools"};expect(ad.label).toBe("Sponsored");});
it("represents country-aware quota policy",()=>{const policy:QuotaPolicy={countryCode:"NG",freeHoursPerDay:5,paidHoursPerDay:30,timezone:"Africa/Lagos"};expect(policy.freeHoursPerDay).toBeGreaterThan(0);});
it("represents persistent sessions",()=>{const session:Session={id:"session-1",userId:"user-1",projectId:"project-1",status:"idle",messages:[],createdAt:"2026-11-17T00:00:00.000Z",updatedAt:"2026-11-17T00:00:00.000Z"};expect(session.messages).toHaveLength(0);});
});
