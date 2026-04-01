import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

const testUser = {
  email: "property@example.com",
  password: "Password123!",
  name: "Property User"
};

const cleanupUserData = async () => {
  const user = await prisma.user.findUnique({ where: { email: testUser.email } });
  if (!user) {
    return;
  }

  const userId = user.id;
  const organizationId = user.defaultOrgId;

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
  await request(app).post("/auth/signup").send({ ...testUser, organizationName: "Test Org" });
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

describe("properties", () => {
  it("creates and lists properties", async () => {
    const token = await createUserAndToken();

    const createRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Oak Street Duplex",
        addressLine1: "123 Oak St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe("Oak Street Duplex");

    const listRes = await request(app)
      .get("/properties")
      .set("Authorization", `Bearer ${token}`);

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBeGreaterThan(0);
  });

  it("denies cross-organization access", async () => {
    const token1 = await createUserAndToken();

    const createRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        name: "Org1 Property",
        addressLine1: "1 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });

    expect(createRes.status).toBe(201);
    const propertyId = createRes.body.id as string;

    // Create a second user/org
    const other = {
      email: "other-org@example.com",
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

    const getRes = await request(app)
      .get(`/properties/${propertyId}`)
      .set("Authorization", `Bearer ${token2}`);

    // We return 404 to avoid leaking existence across orgs
    expect(getRes.status).toBe(404);

    // cleanup other user/org
    const otherUser = await prisma.user.findUnique({ where: { email: other.email } });
    if (otherUser) {
      const orgId = otherUser.defaultOrgId;
      await prisma.membership.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  it("returns 409 with friendly message when deleting a property with units", async () => {
    const token = await createUserAndToken();

    const createProperty = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Delete Conflict Property",
        addressLine1: "9 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });

    expect(createProperty.status).toBe(201);

    const createUnit = await request(app)
      .post(`/properties/${createProperty.body.id}/units`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "C1" });

    expect(createUnit.status).toBe(201);

    const deleteRes = await request(app)
      .delete(`/properties/${createProperty.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body).toMatchObject({
      code: "PROPERTY_DELETE_CONFLICT"
    });
  });
});
