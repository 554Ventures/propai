import { describe, it, expect, beforeEach } from "vitest";
import supertest from "supertest";
import app from "../app.js";
import { clearDatabase, createTestUser } from "../../test/test-helpers";

const request = supertest(app);

describe("Maintenance Vendor Assignment", () => {
  let token: string;
  let organizationId: string;
  let userId: string;
  let propertyId: string;
  let vendorId: string;
  let maintenanceId: string;

  beforeEach(async () => {
    await clearDatabase();
    const { token: userToken, organizationId: orgId, userId: uId } = await createTestUser();
    token = userToken;
    organizationId = orgId;
    userId = uId;

    // Create test property
    const propertyRes = await request
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Test Property",
        address: "123 Test St",
        type: "SINGLE_FAMILY"
      });
    propertyId = propertyRes.body.id;

    // Create test vendor
    const vendorRes = await request
      .post("/vendors")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "ABC Plumbing",
        email: "contact@abcplumbing.com",
        serviceCategories: ["PLUMBING"]
      });
    vendorId = vendorRes.body.id;

    // Create test maintenance request
    const maintenanceRes = await request
      .post("/maintenance")
      .set("Authorization", `Bearer ${token}`)
      .send({
        propertyId,
        title: "Leaky Faucet",
        description: "Kitchen faucet is dripping",
        status: "PENDING"
      });
    maintenanceId = maintenanceRes.body.id;
  });

  describe("PATCH /maintenance/:id/assign-vendor", () => {
    it("should assign vendor to maintenance request", async () => {
      const res = await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });

      expect(res.status).toBe(200);
      expect(res.body.vendorId).toBe(vendorId);
      expect(res.body.vendorAssignedAt).toBeDefined();
      expect(res.body.status).toBe("IN_PROGRESS"); // Should auto-update status
      expect(res.body.vendor).toMatchObject({
        id: vendorId,
        name: "ABC Plumbing",
        email: "contact@abcplumbing.com",
        serviceCategories: ["PLUMBING"]
      });
    });

    it("should require vendorId", async () => {
      const res = await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("vendorId is required");
    });

    it("should return 404 for non-existent maintenance request", async () => {
      const res = await request
        .patch("/maintenance/non-existent-id/assign-vendor")
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Maintenance request not found");
    });

    it("should return 404 for non-existent vendor", async () => {
      const res = await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId: "non-existent-vendor-id"
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Vendor not found");
    });

    it("should not assign inactive vendor", async () => {
      // Deactivate vendor
      await request
        .patch(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          isActive: false
        });

      const res = await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Vendor not found");
    });

    it("should preserve status if already IN_PROGRESS or COMPLETED", async () => {
      // Update maintenance to IN_PROGRESS
      await request
        .patch(`/maintenance/${maintenanceId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          status: "COMPLETED"
        });

      const res = await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED"); // Should not change from COMPLETED to IN_PROGRESS
    });

    it("should allow reassigning vendor", async () => {
      // First assignment
      await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });

      // Create second vendor
      const vendor2Res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "XYZ HVAC",
          serviceCategories: ["HVAC"]
        });

      // Reassign to second vendor
      const res = await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId: vendor2Res.body.id
        });

      expect(res.status).toBe(200);
      expect(res.body.vendorId).toBe(vendor2Res.body.id);
      expect(res.body.vendor.name).toBe("XYZ HVAC");
    });
  });

  describe("PATCH /maintenance/:id/unassign-vendor", () => {
    beforeEach(async () => {
      // Assign vendor first
      await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });
    });

    it("should unassign vendor from maintenance request", async () => {
      const res = await request
        .patch(`/maintenance/${maintenanceId}/unassign-vendor`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.vendorId).toBeNull();
      expect(res.body.vendorAssignedAt).toBeNull();
      expect(res.body.status).toBe("PENDING"); // Should reset status
      expect(res.body.vendor).toBeNull();
    });

    it("should return 404 for non-existent maintenance request", async () => {
      const res = await request
        .patch("/maintenance/non-existent-id/unassign-vendor")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Maintenance request not found");
    });

    it("should return 400 if no vendor is assigned", async () => {
      // First unassign
      await request
        .patch(`/maintenance/${maintenanceId}/unassign-vendor`)
        .set("Authorization", `Bearer ${token}`);

      // Try to unassign again
      const res = await request
        .patch(`/maintenance/${maintenanceId}/unassign-vendor`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No vendor assigned to this maintenance request");
    });

    it("should preserve COMPLETED status when unassigning", async () => {
      // Set maintenance to completed
      await request
        .patch(`/maintenance/${maintenanceId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          status: "COMPLETED"
        });

      const res = await request
        .patch(`/maintenance/${maintenanceId}/unassign-vendor`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("COMPLETED"); // Should not reset completed status
    });
  });

  describe("Maintenance endpoints include vendor information", () => {
    beforeEach(async () => {
      // Assign vendor
      await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });
    });

    it("should include vendor in GET /maintenance", async () => {
      const res = await request
        .get(`/maintenance?propertyId=${propertyId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body[0].vendor).toMatchObject({
        id: vendorId,
        name: "ABC Plumbing",
        email: "contact@abcplumbing.com",
        serviceCategories: ["PLUMBING"]
      });
    });

    it("should include vendor in PATCH /maintenance/:id", async () => {
      const res = await request
        .patch(`/maintenance/${maintenanceId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          description: "Updated description"
        });

      expect(res.status).toBe(200);
      expect(res.body.vendor).toMatchObject({
        id: vendorId,
        name: "ABC Plumbing"
      });
    });

    it("should include vendor in POST /maintenance", async () => {
      const res = await request
        .post("/maintenance")
        .set("Authorization", `Bearer ${token}`)
        .send({
          propertyId,
          title: "New Request",
          description: "Another issue"
        });

      expect(res.status).toBe(201);
      expect(res.body.vendor).toBeNull(); // New requests don't have vendors assigned
    });
  });

  describe("Vendor maintenance request count", () => {
    it("should track maintenance request count for vendors", async () => {
      // Create another maintenance request and assign to same vendor
      const maintenance2Res = await request
        .post("/maintenance")
        .set("Authorization", `Bearer ${token}`)
        .send({
          propertyId,
          title: "Second Issue",
          description: "Another plumbing issue"
        });

      // Assign vendor to both requests
      await request
        .patch(`/maintenance/${maintenanceId}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({ vendorId });

      await request
        .patch(`/maintenance/${maintenance2Res.body.id}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({ vendorId });

      // Check vendor details
      const vendorRes = await request
        .get(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(vendorRes.status).toBe(200);
      expect(vendorRes.body.maintenanceRequestCount).toBe(2);
      expect(vendorRes.body.maintenanceRequests).toHaveLength(2);
    });
  });
});