import { describe, expect, it } from "vitest";
import { evaluateAiWriteActionPolicy, evaluateAiWritePlanPolicy } from "../security/ai-policy-engine.js";

describe("ai-policy-engine", () => {
  it("allows owner to execute high-risk actions", () => {
    const decision = evaluateAiWriteActionPolicy({
      role: "OWNER",
      toolName: "deleteProperty",
      phase: "execute"
    });

    expect(decision.allowed).toBe(true);
    expect(decision.risk).toBe("high");
  });

  it("blocks member from high-risk write actions", () => {
    const decision = evaluateAiWriteActionPolicy({
      role: "MEMBER",
      toolName: "updateProperty",
      phase: "plan"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("not allowed");
  });

  it("allows member for medium-risk create flows", () => {
    const result = evaluateAiWritePlanPolicy({
      role: "MEMBER",
      phase: "plan",
      toolCalls: [
        {
          toolName: "createCashflowTransaction",
          args: { type: "expense", amount: 20, date: "2026-01-01", category: "Utilities" }
        },
        {
          toolName: "createMaintenanceRequest",
          args: { propertyId: "p1", title: "No hot water" }
        }
      ]
    });

    expect(result.allowed).toBe(true);
  });

  it("blocks mixed plans when one action is not permitted", () => {
    const result = evaluateAiWritePlanPolicy({
      role: "MEMBER",
      phase: "plan",
      toolCalls: [
        {
          toolName: "createTenant",
          args: { firstName: "Jane", lastName: "Doe" }
        },
        {
          toolName: "deleteTenant",
          args: { id: "t1" }
        }
      ]
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.denied.toolName).toBe("deleteTenant");
      expect(result.denied.phase).toBe("plan");
    }
  });

  it("blocks member from high-cost maintenance create above $500", () => {
    const decision = evaluateAiWriteActionPolicy({
      role: "MEMBER",
      toolName: "createMaintenanceRequest",
      args: { propertyId: "p1", title: "Emergency plumbing", cost: 750 },
      phase: "plan"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("$500");
  });

  it("allows admin for high-cost maintenance create above $500", () => {
    const decision = evaluateAiWriteActionPolicy({
      role: "ADMIN",
      toolName: "createMaintenanceRequest",
      args: { propertyId: "p1", title: "Roof fix", cost: 1200 },
      phase: "execute"
    });

    expect(decision.allowed).toBe(true);
  });

  it("blocks member from high-cost maintenance update above $500", () => {
    const decision = evaluateAiWriteActionPolicy({
      role: "MEMBER",
      toolName: "updateMaintenanceRequest",
      args: { id: "m1", patch: { cost: 650 } },
      phase: "execute"
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("OWNER or ADMIN");
  });

  it("allows member maintenance update at or below $500", () => {
    const decision = evaluateAiWriteActionPolicy({
      role: "MEMBER",
      toolName: "updateMaintenanceRequest",
      args: { id: "m1", patch: { cost: 500 } },
      phase: "execute"
    });

    expect(decision.allowed).toBe(true);
  });
});
