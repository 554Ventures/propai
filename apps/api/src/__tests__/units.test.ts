import { beforeAll, afterAll, describe, expect, it } from "vitest";
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

  it("lists active vs deactivated units via GET /units?status=...", async () => {
    const token = await createUserAndToken();

    const propertyRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "List Property",
        addressLine1: "3 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });
    expect(propertyRes.status).toBe(201);

    const unitRes = await request(app)
      .post(`/properties/${propertyRes.body.id}/units`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "C1" });
    expect(unitRes.status).toBe(201);

    const activeListRes = await request(app)
      .get("/units?status=active")
      .set("Authorization", `Bearer ${token}`);
    expect(activeListRes.status).toBe(200);
    expect(activeListRes.body.some((u: any) => u.id === unitRes.body.id)).toBe(true);

    const deactivateRes = await request(app)
      .patch(`/units/${unitRes.body.id}/deactivate`)
      .set("Authorization", `Bearer ${token}`);
    expect(deactivateRes.status).toBe(200);

    const deactivatedListRes = await request(app)
      .get("/units?status=deactivated")
      .set("Authorization", `Bearer ${token}`);
    expect(deactivatedListRes.status).toBe(200);
    expect(deactivatedListRes.body.some((u: any) => u.id === unitRes.body.id)).toBe(true);

    const activeListResAfter = await request(app)
      .get("/units?status=active")
      .set("Authorization", `Bearer ${token}`);
    expect(activeListResAfter.status).toBe(200);
    expect(activeListResAfter.body.some((u: any) => u.id === unitRes.body.id)).toBe(false);
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

describe("PATCH /units/:id allow-list", () => {
  it("silently drops rogue fields e.g. organizationId", async () => {
    const token = await createUserAndToken();

    const propertyRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Allow-list Property",
        addressLine1: "10 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });
    expect(propertyRes.status).toBe(201);

    const unitRes = await request(app)
      .post(`/properties/${propertyRes.body.id}/units`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "AL1", bedrooms: 1, bathrooms: 1, rent: 1000 });
    expect(unitRes.status).toBe(201);

    const originalOrgId = unitRes.body.organizationId as string;

    const patchRes = await request(app)
      .patch(`/units/${unitRes.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: "evil-org-id" });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.organizationId).toBe(originalOrgId);
  });

  it("updates rent only, leaves other fields unchanged", async () => {
    const token = await createUserAndToken();

    const propertyRes = await request(app)
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Rent Update Property",
        addressLine1: "11 Main St",
        city: "Austin",
        state: "TX",
        postalCode: "78701"
      });
    expect(propertyRes.status).toBe(201);

    const unitRes = await request(app)
      .post(`/properties/${propertyRes.body.id}/units`)
      .set("Authorization", `Bearer ${token}`)
      .send({ label: "RU1", bedrooms: 2, bathrooms: 1, squareFeet: 900, rent: 1000 });
    expect(unitRes.status).toBe(201);

    const patchRes = await request(app)
      .patch(`/units/${unitRes.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rent: 2500 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.rent).toBe(2500);
    expect(patchRes.body.label).toBe("RU1");
    expect(patchRes.body.bedrooms).toBe(2);
    expect(patchRes.body.bathrooms).toBe(1);
    expect(patchRes.body.squareFeet).toBe(900);
  });
});
