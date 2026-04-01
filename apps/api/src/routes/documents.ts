import { Router } from "express";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import multer from "multer";

const router: Router = Router();

const uploadDir = process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${timestamp}-${Math.round(Math.random() * 1e9)}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

const allowedTypes = ["LEASE", "RECEIPT", "INSPECTION", "INSURANCE", "TAX", "OTHER"] as const;

type AllowedType = (typeof allowedTypes)[number];

const resolveDocType = (value?: string): AllowedType => {
  if (!value) return "OTHER";
  const normalized = value.toUpperCase();
  return (allowedTypes.find((type) => type === normalized) ?? "OTHER") as AllowedType;
};

router.post(
  "/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "File is required" });
      return;
    }

    const { propertyId, leaseId, type, name } = req.body as {
      propertyId?: string;
      leaseId?: string;
      type?: string;
      name?: string;
    };

    const document = await prisma.document.create({
      data: {
        userId: req.auth?.userId ?? "",
        organizationId: req.auth?.organizationId ?? "",
        propertyId: propertyId || undefined,
        leaseId: leaseId || undefined,
        type: resolveDocType(type),
        name: name || req.file.originalname,
        url: `/uploads/${req.file.filename}`
      }
    });

    let extractedText: string | null = null;
    if (req.file.mimetype.startsWith("text/")) {
      const buffer = await fs.promises.readFile(req.file.path);
      extractedText = buffer.toString("utf8").trim().slice(0, 5000);
    }

    let insightId: string | null = null;
    if (extractedText) {
      const insight = await prisma.aIInsight.create({
        data: {
          userId: req.auth?.userId ?? "",
          organizationId: req.auth?.organizationId ?? "",
          propertyId: propertyId || undefined,
          type: "DOCUMENT_OCR",
          input: { documentId: document.id, name: document.name },
          output: { text: extractedText },
          confidence: 0.6,
          reasoning: "Basic text extraction from uploaded document."
        }
      });
      insightId = insight.id;
    }

    res.status(201).json({
      document,
      ocr: extractedText
        ? {
            insightId,
            text: extractedText
          }
        : null
    });
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const propertyId = req.query.propertyId as string | undefined;

    const documents = await prisma.document.findMany({
      where: {
        organizationId: req.auth?.organizationId,
        ...(propertyId ? { propertyId } : {})
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(documents);
  })
);

export default router;
