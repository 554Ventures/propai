import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

const testUser = {
  email: "cashflow@example.com",
  password: "Password123!",
  name: "Cashflow User"
};

const cleanupUserData = async () => {
  const user = await prisma.user.findUnique({ where: { email: testUser.email } });
  if (!user) {
    return;
  }

  const userId = user.id;
  const organizationId = user.defaultOrgId;

  await prisma.transaction.deleteMany({ where: { organizationId } });
  await prisma.aIInsight.deleteMany({ where: { organizationId } });
  await prisma.expense.deleteMany({ where: { organizationId } });
  await prisma.payment.deleteMany({ where: { organizationId } });
  await prisma.document.deleteMany({ where: { organizationId } });
  await prisma.maintenanceRequest.deleteMany({ where: { organizationId } });
  await prisma.lease.deleteMany({ where: { organizationId } });
  await prisma.unit.deleteMany({ where: { organizationId } });
  await prisma.tenant.deleteMany({ where: { organizationId } });
  await prisma.vendor.deleteMany({ where: { organizationId } });
  await prisma.property.deleteMany({ where: { organizationId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
};

const createUserAndToken = async () => {
  await cleanupUserData();
  await request(app).post("/auth/signup").send({ ...testUser, organizationName: "Cashflow Org" });
  const login = await request(app).post("/auth/login").send({
    email: testUser.email,
    password: testUser.password
  });
  return login.body.token as string;
};

beforeAll(async () => {
  await cleanupUserData();
});

afterAll(async () => {
  await cleanupUserData();
  await prisma.$disconnect();
});

describe("cashflow transactions", () => {
  it("creates, lists, updates, and deletes a transaction", async () => {
    const token = await createUserAndToken();

    const createRes = await request(app)
      .post("/cashflow/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type: "income",
        amount: 1234.56,
        date: "2026-04-01T00:00:00.000Z",
        category: "Rent",
        notes: "April rent"
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toMatchObject({
      type: "INCOME",
      category: "Rent"
    });

    const id = createRes.body.id as string;

    const listRes = await request(app)
      .get("/cashflow/transactions")
      .set("Authorization", `Bearer ${token}`)
      .query({ type: "income", from: "2026-03-01", to: "2026-05-01" });

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.find((t: any) => t.id === id)).toBeTruthy();

    const patchRes = await request(app)
      .patch(`/cashflow/transactions/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        amount: 1300,
        category: "Rent (Adjusted)",
        type: "income"
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.amount).toBe("1300");
    expect(patchRes.body.category).toBe("Rent (Adjusted)");

    const deleteRes = await request(app)
      .delete(`/cashflow/transactions/${id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteRes.status).toBe(204);

    const listAfter = await request(app)
      .get("/cashflow/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(listAfter.status).toBe(200);
    expect(listAfter.body.find((t: any) => t.id === id)).toBeFalsy();
  });

  it("denies cross-organization access", async () => {
    const token1 = await createUserAndToken();

    const createRes = await request(app)
      .post("/cashflow/transactions")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        type: "expense",
        amount: 10,
        date: "2026-04-01T00:00:00.000Z",
        category: "Supplies"
      });

    expect(createRes.status).toBe(201);
    const txId = createRes.body.id as string;

    const other = {
      email: "cashflow-other@example.com",
      password: "Password123!",
      name: "Other User"
    };

    await prisma.user.deleteMany({ where: { email: other.email } });
    await request(app).post("/auth/signup").send({ ...other, organizationName: "Other Org" });
    const login2 = await request(app).post("/auth/login").send({
      email: other.email,
      password: other.password
    });
    const token2 = login2.body.token as string;

    const patchRes = await request(app)
      .patch(`/cashflow/transactions/${txId}`)
      .set("Authorization", `Bearer ${token2}`)
      .send({ notes: "hacked" });

    expect(patchRes.status).toBe(404);

    const delRes = await request(app)
      .delete(`/cashflow/transactions/${txId}`)
      .set("Authorization", `Bearer ${token2}`);

    expect(delRes.status).toBe(404);

    // cleanup other user/org
    const otherUser = await prisma.user.findUnique({ where: { email: other.email } });
    if (otherUser) {
      const orgId = otherUser.defaultOrgId;
      await prisma.membership.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });
});
