import { Router } from "express";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendError } from "../utils/api-error.js";
import { Prisma, MaintenanceStatus, ServiceCategory } from "@prisma/client";

const router: Router = Router();

const parseMaintenanceCost = (value: number | string | undefined) => {
  if (value === undefined || value === null || value === "") return { ok: true as const, cost: null as number | null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false as const, cost: null as number | null };
  }
  return { ok: true as const, cost: parsed };
};

// GET /maintenance?propertyId={id} - Fetch maintenance requests for a property
router.get(
  "/maintenance",
  asyncHandler(async (req, res) => {
    const { propertyId } = req.query;

    if (!propertyId || typeof propertyId !== "string") {
      sendError(res, 400, "VALIDATION_ERROR", "propertyId query parameter is required");
      return;
    }

    // Verify property belongs to organization
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        organizationId: req.auth?.organizationId
      }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    const maintenance = await prisma.maintenanceRequest.findMany({
      where: {
        propertyId,
        organizationId: req.auth?.organizationId
      },
      include: {
        unit: true,
        tenant: true,
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            serviceCategories: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(maintenance);
  })
);

// POST /maintenance - Create a maintenance request
router.post(
  "/maintenance",
  asyncHandler(async (req, res) => {
    const {
      propertyId,
      unitId,
      tenantId,
      title,
      description,
      cost
    } = req.body as {
      propertyId?: string;
      unitId?: string | null;
      tenantId?: string | null;
      title?: string;
      description?: string;
      cost?: number | string;
    };

    if (!propertyId || !title) {
      sendError(res, 400, "VALIDATION_ERROR", "propertyId and title are required");
      return;
    }

    // Verify property belongs to organization
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        organizationId: req.auth?.organizationId
      }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    const parsedCost = parseMaintenanceCost(cost);
    if (!parsedCost.ok) {
      sendError(res, 400, "VALIDATION_ERROR", "cost must be a non-negative number");
      return;
    }

    // If unitId provided, verify unit belongs to property
    if (unitId) {
      const unit = await prisma.unit.findFirst({
        where: {
          id: unitId,
          propertyId,
          organizationId: req.auth?.organizationId,
          archivedAt: null
        }
      });

      if (!unit) {
        sendError(res, 400, "VALIDATION_ERROR", "Unit does not belong to property");
        return;
      }
    }

    // If tenantId provided, verify tenant belongs to organization
    if (tenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: tenantId,
          organizationId: req.auth?.organizationId
        }
      });

      if (!tenant) {
        sendError(res, 400, "VALIDATION_ERROR", "Tenant not found");
        return;
      }
    }

    const maintenanceRequest = await prisma.maintenanceRequest.create({
      data: {
        userId: req.auth!.userId,
        organizationId: req.auth!.organizationId,
        propertyId,
        unitId: unitId || null,
        tenantId: tenantId || null,
        title,
        description: description || null,
        cost: parsedCost.cost,
        status: "PENDING"
      },
      include: {
        unit: true,
        tenant: true,
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            serviceCategories: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.status(201).json(maintenanceRequest);
  })
);

// PATCH /maintenance/:id - Update maintenance request
router.patch(
  "/maintenance/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, status, cost } = req.body as {
      title?: string;
      description?: string;
      status?: "PENDING" | "IN_PROGRESS" | "COMPLETED";
      cost?: number | string;
    };

    const maintenanceRequest = await prisma.maintenanceRequest.findFirst({
      where: {
        id,
        organizationId: req.auth?.organizationId
      }
    });

    if (!maintenanceRequest) {
      sendError(res, 404, "MAINTENANCE_NOT_FOUND", "Maintenance request not found");
      return;
    }

    if (status && !["PENDING", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid status");
      return;
    }

    const parsedCost = parseMaintenanceCost(cost);
    if (!parsedCost.ok) {
      sendError(res, 400, "VALIDATION_ERROR", "cost must be a non-negative number");
      return;
    }

    const updated = await prisma.maintenanceRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(status !== undefined && { status }),
        ...(cost !== undefined && { cost: parsedCost.cost })
      },
      include: {
        unit: true,
        tenant: true,
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            serviceCategories: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    res.json(updated);
  })
);

// GET /properties/:id/maintenance - S3 property-scoped endpoint with filtering
router.get(
  "/properties/:id/maintenance",
  asyncHandler(async (req, res) => {
    const { id: propertyId } = req.params;
    const { unit, status } = req.query as {
      unit?: string; // 'all' | 'property' | unitId
      status?: string; // 'all' | 'pending' | 'in_progress' | 'completed'
    };

    // Verify property belongs to organization
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        organizationId: req.auth?.organizationId
      }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    // Build maintenance query filters
    const whereClause: Prisma.MaintenanceRequestWhereInput = {
      propertyId,
      organizationId: req.auth!.organizationId
    };

    // Unit filtering
    if (unit && unit !== 'all') {
      if (unit === 'property') {
        // Property-level maintenance only (no unit assigned)
        whereClause.unitId = null;
      } else {
        // Specific unit maintenance
        whereClause.unitId = unit;
      }
    }

    // Status filtering
    if (status && status !== 'all') {
      const statusMap: Record<string, MaintenanceStatus> = {
        'pending': MaintenanceStatus.PENDING,
        'in_progress': MaintenanceStatus.IN_PROGRESS, 
        'completed': MaintenanceStatus.COMPLETED
      };
      
      const mappedStatus = statusMap[status.toLowerCase()];
      if (mappedStatus) {
        whereClause.status = mappedStatus;
      }
    }

    const maintenance = await prisma.maintenanceRequest.findMany({
      where: whereClause,
      include: {
        unit: {
          select: {
            id: true,
            label: true,
            archivedAt: true // Include archived status for historical context
          }
        },
        tenant: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    // Mark maintenance for archived units as historical
    const enhancedMaintenance = maintenance.map(request => ({
      ...request,
      isHistorical: request.unit?.archivedAt ? true : false
    }));

    res.json(enhancedMaintenance);
  })
);

// POST /properties/:id/maintenance - S3 property-scoped maintenance creation
router.post(
  "/properties/:id/maintenance",
  asyncHandler(async (req, res) => {
    const { id: propertyId } = req.params;
    const {
      unitId,
      tenantId,
      title,
      description,
      cost
    } = req.body as {
      unitId?: string | null;
      tenantId?: string | null;
      title?: string;
      description?: string;
      cost?: number | string;
    };

    if (!title) {
      sendError(res, 400, "VALIDATION_ERROR", "title is required");
      return;
    }

    // Verify property belongs to organization
    const property = await prisma.property.findFirst({
      where: {
        id: propertyId,
        organizationId: req.auth?.organizationId
      }
    });

    if (!property) {
      sendError(res, 404, "PROPERTY_NOT_FOUND", "Property not found");
      return;
    }

    const parsedCost = parseMaintenanceCost(cost);
    if (!parsedCost.ok) {
      sendError(res, 400, "VALIDATION_ERROR", "cost must be a non-negative number");
      return;
    }

    // If unitId provided, verify unit belongs to property (including archived units)
    if (unitId) {
      const unit = await prisma.unit.findFirst({
        where: {
          id: unitId,
          propertyId,
          organizationId: req.auth?.organizationId
          // Note: Not filtering archivedAt to allow maintenance on archived units
        }
      });

      if (!unit) {
        sendError(res, 400, "VALIDATION_ERROR", "Unit does not belong to property");
        return;
      }
    }

    // If tenantId provided, verify tenant belongs to organization  
    if (tenantId) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: tenantId,
          organizationId: req.auth?.organizationId
        }
      });

      if (!tenant) {
        sendError(res, 400, "VALIDATION_ERROR", "Tenant not found");
        return;
      }
    }

    const maintenanceRequest = await prisma.maintenanceRequest.create({
      data: {
        userId: req.auth!.userId,
        organizationId: req.auth!.organizationId,
        propertyId,
        unitId: unitId || null,
        tenantId: tenantId || null,
        title,
        description: description || null,
        cost: parsedCost.cost,
        status: "PENDING"
      },
      include: {
        unit: {
          select: {
            id: true,
            label: true,
            archivedAt: true
          }
        },
        tenant: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Mark as historical if unit is archived
    const enhancedRequest = {
      ...maintenanceRequest,
      isHistorical: maintenanceRequest.unit?.archivedAt ? true : false
    };

    res.status(201).json(enhancedRequest);
  })
);

// PATCH /maintenance/:id/assign-vendor - Assign vendor to maintenance request
router.patch(
  "/maintenance/:id/assign-vendor",
  asyncHandler(async (req, res) => {
    const { id } = req.params;    
    const { vendorId } = req.body as { vendorId?: string };

    if (!vendorId) {
      sendError(res, 400, "VALIDATION_ERROR", "vendorId is required");
      return;
    }

    // Check if maintenance request exists and belongs to organization
    const maintenanceRequest = await prisma.maintenanceRequest.findFirst({
      where: {
        id,
        organizationId: req.auth!.organizationId
      },
      include: {
        vendor: true,
        property: {
          select: { name: true }
        },
        unit: {
          select: { label: true }
        }
      }
    });

    if (!maintenanceRequest) {
      sendError(res, 404, "MAINTENANCE_NOT_FOUND", "Maintenance request not found");
      return;
    }

    // Check if vendor exists and belongs to organization
    const vendor = await prisma.vendor.findFirst({
      where: {
        id: vendorId,
        organizationId: req.auth!.organizationId,
        isActive: true
      }
    });

    if (!vendor) {
      sendError(res, 404, "VENDOR_NOT_FOUND", "Vendor not found");
      return;
    }

    // Update maintenance request with vendor assignment
    const updatedRequest = await prisma.maintenanceRequest.update({
      where: { id },
      data: {
        vendorId,
        vendorAssignedAt: new Date(),
        // Automatically move status to IN_PROGRESS when vendor is assigned
        status: maintenanceRequest.status === "PENDING" ? "IN_PROGRESS" : maintenanceRequest.status
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            serviceCategories: true
          }
        },
        unit: true,
        tenant: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        property: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Log the vendor assignment action
    await prisma.aiActionLog.create({
      data: {
        userId: req.auth!.userId,
        organizationId: req.auth!.organizationId,
        actionType: "vendor_assignment",
        payload: {
          maintenanceRequestId: id,
          vendorId,
          previousVendorId: maintenanceRequest.vendorId,
          property: maintenanceRequest.property.name,
          unit: maintenanceRequest.unit?.label,
          assignedBy: req.auth!.email
        },
        status: "success"
      }
    });

    res.json(updatedRequest);
  })
);

// PATCH /maintenance/:id/unassign-vendor - Remove vendor assignment
router.patch(
  "/maintenance/:id/unassign-vendor",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Check if maintenance request exists and belongs to organization
    const maintenanceRequest = await prisma.maintenanceRequest.findFirst({
      where: {
        id,
        organizationId: req.auth!.organizationId
      },
      include: {
        vendor: true
      }
    });

    if (!maintenanceRequest) {
      sendError(res, 404, "MAINTENANCE_NOT_FOUND", "Maintenance request not found");
      return;
    }

    if (!maintenanceRequest.vendorId) {
      sendError(res, 400, "VALIDATION_ERROR", "No vendor assigned to this maintenance request");
      return;
    }

    // Update maintenance request to remove vendor assignment
    const updatedRequest = await prisma.maintenanceRequest.update({
      where: { id },
      data: {
        vendorId: null,
        vendorAssignedAt: null,
        // Reset status to PENDING when vendor is unassigned, unless it's already completed
        status: maintenanceRequest.status === "COMPLETED" ? "COMPLETED" : "PENDING"
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            serviceCategories: true
          }
        },
        unit: true,
        tenant: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        property: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Log the vendor unassignment action
    await prisma.aiActionLog.create({
      data: {
        userId: req.auth!.userId,
        organizationId: req.auth!.organizationId,
        actionType: "vendor_unassignment",
        payload: {
          maintenanceRequestId: id,
          previousVendorId: maintenanceRequest.vendorId,
          unassignedBy: req.auth!.email
        },
        status: "success"
      }
    });

    res.json(updatedRequest);
  })
);

export default router;