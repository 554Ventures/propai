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
