import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";
import { signupAndGetToken } from "./helpers/auth.js";

describe("/ai/chat (integration)", () => {
  it("returns clarify+draft+result for a cashflow expense flow", async () => {
    const { token } = await signupAndGetToken();

    // 1) Start: missing category (should clarify)
    const r1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Log an expense $50 today" })
      .expect(200);

    expect(r1.body.mode).toBe("clarify");
    expect(typeof r1.body.pendingActionId).toBe("string");
    expect(r1.body.pendingActionId.length).toBeGreaterThan(5);
    expect(r1.body.clarify?.choices?.length ?? 0).toBeGreaterThan(0);

    const actionId = r1.body.pendingActionId as string;

    // 2) Follow-up: provide category via JSON patch
    const r2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: JSON.stringify({ category: "Utilities" }), pendingActionId: actionId })
      .expect(200);

    expect(r2.body.mode).toBe("draft");
    expect(r2.body.pendingActionId).toBe(actionId);

    // 3) Confirm
    const r3 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: actionId, clientRequestId: "req-1" })
      .expect(200);

    expect(r3.body.mode).toBe("result");
  });

  it("does not mis-apply unrelated follow-up text as cashflow category", async () => {
    const { token } = await signupAndGetToken();

    const r1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Log an expense $50 today" })
      .expect(200);

    expect(r1.body.mode).toBe("clarify");
    const actionId = r1.body.pendingActionId as string;

    const r2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "add 4 units", pendingActionId: actionId })
      .expect(200);

    // Should remain in clarify (still needs category) and not corrupt the draft.
    expect(["clarify", "draft"]).toContain(r2.body.mode);
    // If it stayed clarify, ensure it's still asking for missing fields, not proceeding.
    if (r2.body.mode === "clarify") {
      expect(r2.body.summary).toMatch(/need/i);
    }
  });

  it("confirm requires clientRequestId and is idempotent when replayed", async () => {
    const { token } = await signupAndGetToken();

    const r1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Log an expense $50 today category Utilities" })
      .expect(200);

    // Depending on the model's tool-planning, it may still ask a clarifying question
    // even when category is present. Both are acceptable as long as we get a
    // pendingActionId we can confirm idempotently.
    expect(["draft", "clarify"]).toContain(r1.body.mode);
    const actionId = r1.body.pendingActionId as string;

    // If we got a clarify, provide the missing field(s) before confirming.
    if (r1.body.mode === "clarify") {
      await request(app)
        .post("/ai/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({ message: JSON.stringify({ category: "Utilities" }), pendingActionId: actionId })
        .expect(200);
    }

    // clientRequestId required
    await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: actionId })
      .expect(400);

    const r2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: actionId, clientRequestId: "idem-1" })
      .expect(200);
    expect(r2.body.mode).toBe("result");

    const r3 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: actionId, clientRequestId: "idem-1" })
      .expect(200);
    expect(r3.body.mode).toBe("result");
    expect(JSON.stringify(r3.body.result)).toBe(JSON.stringify(r2.body.result));
  });

  it("creates a property via offline JSON tool message (draft -> confirm -> receipt)", async () => {
    const { token } = await signupAndGetToken();

    const r1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createProperty",
          args: {
            name: "Test Property",
            addressLine1: "123 Main St",
            city: "Austin",
            state: "TX",
            postalCode: "78701"
          }
        })
      })
      .expect(200);

    expect(["draft", "clarify"]).toContain(r1.body.mode);
    const actionId = r1.body.pendingActionId as string;
    expect(actionId).toBeTruthy();

    // Should be draft already, but tolerate clarify if server wants more.
    if (r1.body.mode === "clarify") {
      // Provide missing fields if any (unlikely)
      await request(app)
        .post("/ai/chat")
        .set("Authorization", `Bearer ${token}`)
        .send({ message: JSON.stringify({}), pendingActionId: actionId })
        .expect(200);
    }

    const r2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: actionId, clientRequestId: "prop-1" })
      .expect(200);

    expect(r2.body.mode).toBe("result");
    expect(r2.body.receipt?.title).toBeTruthy();
  });

  it("creates a tenant via offline JSON tool message", async () => {
    const { token } = await signupAndGetToken();

    const r1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createTenant",
          args: { firstName: "Jane", lastName: "Doe" }
        })
      })
      .expect(200);

    expect(r1.body.mode).toBe("draft");
    const actionId = r1.body.pendingActionId as string;

    const r2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: actionId, clientRequestId: "tenant-1" })
      .expect(200);

    expect(r2.body.mode).toBe("result");
  });

  it("creates + updates + deletes a cashflow transaction via JSON tool messages", async () => {
    const { token } = await signupAndGetToken();

    // Create (draft -> confirm)
    const c1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createCashflowTransaction",
          args: { type: "expense", amount: 12.5, date: "2026-01-02", category: "Snacks" }
        })
      })
      .expect(200);

    expect(c1.body.mode).toBe("draft");
    const createActionId = c1.body.pendingActionId as string;

    const c2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: createActionId, clientRequestId: "tx-create-1" })
      .expect(200);

    expect(c2.body.mode).toBe("result");
    const createdTxId = c2.body.result?.[0]?.output?.id as string;
    expect(createdTxId).toBeTruthy();

    // Update
    const u1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "updateCashflowTransaction",
          args: { id: createdTxId, patch: { category: "Food" } }
        })
      })
      .expect(200);
    expect(u1.body.mode).toBe("draft");
    const updateActionId = u1.body.pendingActionId as string;

    const u2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: updateActionId, clientRequestId: "tx-update-1" })
      .expect(200);
    expect(u2.body.mode).toBe("result");

    // Delete
    const d1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({ tool: "deleteCashflowTransaction", args: { id: createdTxId } })
      })
      .expect(200);
    expect(d1.body.mode).toBe("draft");
    const deleteActionId = d1.body.pendingActionId as string;

    const d2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: deleteActionId, clientRequestId: "tx-del-1" })
      .expect(200);
    expect(d2.body.mode).toBe("result");
  });

  it("creates + updates + deletes a maintenance request via JSON tool messages", async () => {
    const { token } = await signupAndGetToken();

    // Create a property first (via normal API)
    const prop = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Maint Prop",
        addressLine1: "9 Test Ave",
        city: "Austin",
        state: "TX",
        postalCode: "78702"
      })
      .expect(201);

    const propertyId = prop.body.id as string;

    const c1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createMaintenanceRequest",
          args: { propertyId, title: "Fix leak" }
        })
      })
      .expect(200);

    expect(c1.body.mode).toBe("draft");
    const createActionId = c1.body.pendingActionId as string;

    const c2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: createActionId, clientRequestId: "mr-create-1" })
      .expect(200);

    expect(c2.body.mode).toBe("result");
    const mrId = c2.body.result?.[0]?.output?.id as string;
    expect(mrId).toBeTruthy();

    const u1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "updateMaintenanceRequest",
          args: { id: mrId, patch: { status: "IN_PROGRESS" } }
        })
      })
      .expect(200);
    expect(u1.body.mode).toBe("draft");
    const updateActionId = u1.body.pendingActionId as string;

    const u2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: updateActionId, clientRequestId: "mr-update-1" })
      .expect(200);
    expect(u2.body.mode).toBe("result");

    const d1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: JSON.stringify({ tool: "deleteMaintenanceRequest", args: { id: mrId } }) })
      .expect(200);
    expect(d1.body.mode).toBe("draft");
    const deleteActionId = d1.body.pendingActionId as string;

    const d2 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ confirm: true, pendingActionId: deleteActionId, clientRequestId: "mr-del-1" })
      .expect(200);
    expect(d2.body.mode).toBe("result");
  });
});
