import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

const user = {
  email: "ai-actions@example.com",
  password: "Password123!",
  name: "AI Actions"
};

const cleanup = async () => {
  const existing = await prisma.user.findUnique({ where: { email: user.email } });
  if (!existing) return;

  const userId = existing.id;
  const organizationId = existing.defaultOrgId;

  await prisma.aiActionLog.deleteMany({ where: { organizationId } });
  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.maintenanceRequest.deleteMany({ where: { organizationId } });
  await prisma.tenant.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
};

const createToken = async () => {
  await cleanup();
  await request(app).post("/auth/signup").send({ ...user, organizationName: "AI Org" });
  const login = await request(app).post("/auth/login").send({ email: user.email, password: user.password });
  return login.body.token as string;
};

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("/ai plan/confirm/cancel", () => {
  it("plans and confirms a property create (two-step)", async () => {
    const token = await createToken();

    const planRes = await request(app)
      .post("/ai/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createProperty",
          args: {
            name: "AI Planned Property",
            addressLine1: "123 Main St",
            city: "Austin",
            state: "TX",
            postalCode: "78701"
          }
        })
      });

    expect(planRes.status).toBe(200);
    expect(planRes.body.requiresConfirm).toBe(true);
    expect(typeof planRes.body.pendingActionId).toBe("string");
    expect(planRes.body.plan.toolCalls[0].toolName).toBe("createProperty");

    const confirmRes = await request(app)
      .post("/ai/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ actionId: planRes.body.pendingActionId });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.ok).toBe(true);
    expect(confirmRes.body.status).toBe("CONFIRMED");
    expect(Array.isArray(confirmRes.body.result)).toBe(true);

    const list = await request(app).get("/properties").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.some((p: any) => p.name === "AI Planned Property")).toBe(true);

    // idempotent confirm: returns stored result
    const confirmAgain = await request(app)
      .post("/ai/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ actionId: planRes.body.pendingActionId });
    expect(confirmAgain.status).toBe(200);
    expect(confirmAgain.body.ok).toBe(true);
    expect(confirmAgain.body.status).toBe("CONFIRMED");
  });

  it("returns structured clarify payload (pendingActionId + choices) for missing fields", async () => {
    const token = await createToken();

    const planRes = await request(app)
      .post("/ai/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createCashflowTransaction",
          args: {
            type: "expense",
            amount: 42,
            date: "2026-04-01"
            // category intentionally omitted
          }
        })
      });

    expect(planRes.status).toBe(200);
    expect(planRes.body.requiresConfirm).toBe(false);
    expect(typeof planRes.body.pendingActionId).toBe("string");
    expect(planRes.body.clarify?.pendingActionId).toBe(planRes.body.pendingActionId);
    expect(Array.isArray(planRes.body.clarify?.choices)).toBe(true);
    expect(planRes.body.clarify.choices.some((c: any) => c.field === "category")).toBe(true);

    const followUp = await request(app)
      .post("/ai/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        pendingActionId: planRes.body.pendingActionId,
        message: JSON.stringify({ category: "Utilities" })
      });

    expect(followUp.status).toBe(200);
    expect(followUp.body.requiresConfirm).toBe(true);
    expect(followUp.body.pendingActionId).toBe(planRes.body.pendingActionId);
  });

  it("plans and confirms tenant + maintenance request tools", async () => {
    const token = await createToken();

    // Tenant
    const tenantPlan = await request(app)
      .post("/ai/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createTenant",
          args: { firstName: "Taylor", lastName: "Renter", email: "taylor@example.com" }
        })
      });
    expect(tenantPlan.status).toBe(200);
    expect(tenantPlan.body.requiresConfirm).toBe(true);

    const tenantConfirm = await request(app)
      .post("/ai/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ actionId: tenantPlan.body.pendingActionId });
    expect(tenantConfirm.status).toBe(200);
    expect(tenantConfirm.body.ok).toBe(true);

    // Maintenance request needs a property
    const me = await prisma.user.findUnique({ where: { email: user.email } });
    expect(me).toBeTruthy();
    const property = await prisma.property.create({
      data: {
        userId: me!.id,
        organizationId: me!.defaultOrgId,
        name: "Fixit House",
        addressLine1: "1 Repair Rd",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        country: "US"
      }
    });

    const maintPlan = await request(app)
      .post("/ai/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createMaintenanceRequest",
          args: { propertyId: property.id, title: "Leaky faucet", description: "Kitchen sink leaking" }
        })
      });
    expect(maintPlan.status).toBe(200);
    expect(maintPlan.body.requiresConfirm).toBe(true);

    const maintConfirm = await request(app)
      .post("/ai/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ actionId: maintPlan.body.pendingActionId });
    expect(maintConfirm.status).toBe(200);
    expect(maintConfirm.body.ok).toBe(true);
  });

  it("cancels a pending action", async () => {
    const token = await createToken();

    const planRes = await request(app)
      .post("/ai/plan")
      .set("Authorization", `Bearer ${token}`)
      .send({
        message: JSON.stringify({
          tool: "createTenant",
          args: { firstName: "Alicia", lastName: "Tenant" }
        })
      });

    const cancelRes = await request(app)
      .post("/ai/cancel")
      .set("Authorization", `Bearer ${token}`)
      .send({ actionId: planRes.body.pendingActionId });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.ok).toBe(true);
    expect(cancelRes.body.status).toBe("CANCELED");

    const confirmRes = await request(app)
      .post("/ai/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ actionId: planRes.body.pendingActionId });

    expect(confirmRes.status).toBe(409);
  });

  it("enforces org scoping on confirm", async () => {
    const token1 = await createToken();

    const planRes = await request(app)
      .post("/ai/plan")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        message: JSON.stringify({
          tool: "createTenant",
          args: { firstName: "Org", lastName: "Scoped" }
        })
      });

    const other = {
      email: "ai-actions-other@example.com",
      password: "Password123!",
      name: "Other"
    };
    await prisma.user.deleteMany({ where: { email: other.email } });
    await request(app).post("/auth/signup").send({ ...other, organizationName: "Other Org" });
    const login2 = await request(app).post("/auth/login").send({ email: other.email, password: other.password });
    const token2 = login2.body.token as string;

    const confirmRes = await request(app)
      .post("/ai/confirm")
      .set("Authorization", `Bearer ${token2}`)
      .send({ actionId: planRes.body.pendingActionId });

    expect(confirmRes.status).toBe(404);

    // cleanup other
    const otherUser = await prisma.user.findUnique({ where: { email: other.email } });
    if (otherUser) {
      const orgId = otherUser.defaultOrgId;
      await prisma.aiActionLog.deleteMany({ where: { organizationId: orgId } });
      await prisma.membership.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });
});
