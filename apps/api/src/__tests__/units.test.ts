import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

const testUser = {
  email: "units@example.com",
  password: "Password123!",
  name: "Units User"
};

const cleanupUserData = async () => {
  const user = await prisma.user.findUnique({ where: { email: testUser.email } });
  if (!user) {
    return;
  }

  const userId = user.id;
  const organizationId = user.defaultOrgId;

  await prisma.payment.deleteMany({ where: { organizationId } });
  await prisma.document.deleteMany({ where: { organizationId } });
  await prisma.maintenanceRequest.deleteMany({ where: { organizationId } });
  await prisma.lease.deleteMany({ where: { organizationId } });
  await prisma.unit.deleteMany({ where: { organizationId } });
  await prisma.tenant.deleteMany({ where: { organizationId } });
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

describe("units archive/reactivate", () => {
  it("deactivates and reactivates a unit", async () => {
    const token = await createUserAndToken();

    const propertyRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Test Property",
        addressLine1: "1 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });
    expect(propertyRes.status).toBe(201);

    const unitRes = await request(app)
      .post(`/properties/${propertyRes.body.id}/units`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "A1", bedrooms: 1, bathrooms: 1, rent: 1200 });
    expect(unitRes.status).toBe(201);

    const deactivateRes = await request(app)
      .patch(`/units/${unitRes.body.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.archivedAt).toBeTruthy();

    const reactivateRes = await request(app)
      .patch(`/units/${unitRes.body.id}/reactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.archivedAt).toBeNull();
  });

  it("returns 409 when deactivating a unit with an active lease", async () => {
    const token = await createUserAndToken();

    const propertyRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Lease Property",
        addressLine1: "2 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });
    expect(propertyRes.status).toBe(201);

    const unitRes = await request(app)
      .post(`/properties/${propertyRes.body.id}/units`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "B1" });
    expect(unitRes.status).toBe(201);

    const tenantRes = await request(app)
      .post("/tenants")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "T", lastName: "User", email: "t@example.com" });
    expect(tenantRes.status).toBe(201);

    const leaseRes = await request(app)
      .post(`/properties/${propertyRes.body.id}/units/${unitRes.body.id}/leases`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tenantId: tenantRes.body.id, startDate: new Date().toISOString(), rent: 1000, status: "ACTIVE" });
    expect(leaseRes.status).toBe(201);

    const deactivateRes = await request(app)
      .patch(`/units/${unitRes.body.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(deactivateRes.status).toBe(409);
    expect(deactivateRes.body).toMatchObject({
      code: "UNIT_HAS_ACTIVE_LEASE"
    });
  });
});

