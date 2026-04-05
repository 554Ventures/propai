import { describe, it, expect, beforeEach } from "vitest";
import supertest from "supertest";
import app from "../app.js";
import { clearDatabase, createTestUser } from "../../test/test-helpers";

const request = supertest(app);

describe("Vendor API", () => {
  let token: string;
  let organizationId: string;
  let userId: string;
  let propertyId: string;
  let vendorId: string;

  beforeEach(async () => {
    await clearDatabase();
    const { token: userToken, organizationId: orgId, userId: uId } = await createTestUser();
    token = userToken;
    organizationId = orgId;
    userId = uId;

    // Create a test property for maintenance requests
    const propertyRes = await request
      .post("/properties")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Test Property",
        address: "123 Test St",
        type: "SINGLE_FAMILY"
      });

    propertyId = propertyRes.body.id;
  });

  describe("POST /vendors", () => {
    it("should create a new vendor with valid data", async () => {
      const vendorData = {
        name: "ABC Plumbing",
        email: "contact@abcplumbing.com",
        phone: "+1-555-123-4567",
        serviceCategories: ["PLUMBING", "HVAC"],
        trade: "Plumber"
      };

      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send(vendorData);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        name: "ABC Plumbing",
        email: "contact@abcplumbing.com",
        phone: "+1-555-123-4567",
        serviceCategories: ["PLUMBING", "HVAC"],
        trade: "Plumber",
        isActive: true,
        organizationId,
        maintenanceRequestCount: 0
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();

      vendorId = res.body.id;
    });

    it("should require vendor name", async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          serviceCategories: ["PLUMBING"]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Vendor name is required");
    });

    it("should require at least one service category", async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Test Vendor",
          serviceCategories: []
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("At least one service category is required");
    });

    it("should validate email format", async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Test Vendor",
          email: "invalid-email",
          serviceCategories: ["PLUMBING"]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid email format");
    });

    it("should validate phone format", async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Test Vendor",
          phone: "123", // Too short
          serviceCategories: ["PLUMBING"]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid phone format");
    });

    it("should validate service categories", async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Test Vendor",
          serviceCategories: ["INVALID_CATEGORY"]
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid service category: INVALID_CATEGORY");
    });

    it("should prevent duplicate vendor names in organization", async () => {
      // Create first vendor
      await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "ABC Plumbing",
          serviceCategories: ["PLUMBING"]
        });

      // Try to create duplicate
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "ABC Plumbing",
          serviceCategories: ["HVAC"]
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Vendor with this name already exists");
    });

    it("should prevent duplicate email in organization", async () => {
      // Create first vendor
      await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "ABC Plumbing",
          email: "contact@abc.com",
          serviceCategories: ["PLUMBING"]
        });

      // Try to create duplicate email
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "XYZ Plumbing",
          email: "contact@abc.com",
          serviceCategories: ["PLUMBING"]
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("Vendor with this email already exists");
    });
  });

  describe("GET /vendors", () => {
    beforeEach(async () => {
      // Create test vendors
      const vendor1Res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "ABC Plumbing",
          serviceCategories: ["PLUMBING"],
          isActive: true
        });

      const vendor2Res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "XYZ HVAC",
          serviceCategories: ["HVAC"],
          isActive: true
        });

      vendorId = vendor1Res.body.id;
    });

    it("should list all vendors", async () => {
      const res = await request
        .get("/vendors")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toHaveProperty("maintenanceRequestCount");
    });

    it("should filter vendors by service category", async () => {
      const res = await request
        .get("/vendors?serviceCategory=PLUMBING")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("ABC Plumbing");
    });

    it("should filter vendors by active status", async () => {
      // Deactivate one vendor
      await request
        .patch(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ isActive: false });

      const res = await request
        .get("/vendors?isActive=true")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("XYZ HVAC");
    });
  });

  describe("GET /vendors/:id", () => {
    beforeEach(async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "ABC Plumbing",
          serviceCategories: ["PLUMBING"]
        });
      vendorId = res.body.id;
    });

    it("should get vendor details", async () => {
      const res = await request
        .get(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: vendorId,
        name: "ABC Plumbing",
        serviceCategories: ["PLUMBING"]
      });
      expect(res.body.maintenanceRequests).toBeDefined();
      expect(res.body.maintenanceRequestCount).toBeDefined();
    });

    it("should return 404 for non-existent vendor", async () => {
      const res = await request
        .get("/vendors/non-existent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Vendor not found");
    });
  });

  describe("PATCH /vendors/:id", () => {
    beforeEach(async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "ABC Plumbing",
          email: "old@abc.com",
          serviceCategories: ["PLUMBING"]
        });
      vendorId = res.body.id;
    });

    it("should update vendor information", async () => {
      const updateData = {
        name: "ABC Plumbing & HVAC",
        email: "new@abc.com",
        serviceCategories: ["PLUMBING", "HVAC"]
      };

      const res = await request
        .patch(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`)
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(updateData);
    });

    it("should validate email format on update", async () => {
      const res = await request
        .patch(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "invalid-email"
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid email format");
    });

    it("should return 404 for non-existent vendor", async () => {
      const res = await request
        .patch("/vendors/non-existent-id")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Updated Name"
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Vendor not found");
    });
  });

  describe("DELETE /vendors/:id", () => {
    beforeEach(async () => {
      const res = await request
        .post("/vendors")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "ABC Plumbing",
          serviceCategories: ["PLUMBING"]
        });
      vendorId = res.body.id;
    });

    it("should soft delete vendor (set isActive to false)", async () => {
      const res = await request
        .delete(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(204);

      // Verify vendor is still in database but inactive
      const getRes = await request
        .get(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(getRes.body.isActive).toBe(false);
    });

    it("should prevent deletion of vendor with active maintenance requests", async () => {
      // Create maintenance request
      const maintenanceRes = await request
        .post("/maintenance")
        .set("Authorization", `Bearer ${token}`)
        .send({
          propertyId,
          title: "Pipe Repair",
          status: "PENDING"
        });

      // Assign vendor
      await request
        .patch(`/maintenance/${maintenanceRes.body.id}/assign-vendor`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          vendorId
        });

      // Try to delete vendor
      const res = await request
        .delete(`/vendors/${vendorId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe(
        "Cannot delete vendor with active maintenance requests. Please complete or reassign them first."
      );
    });

    it("should return 404 for non-existent vendor", async () => {
      const res = await request
        .delete("/vendors/non-existent-id")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Vendor not found");
    });
  });
});