import type { Request } from "express";
import { createHash } from "crypto";
import path from "path";

// Security whitelist - strict content types
const ALLOWED_MIME_TYPES = {
  // PDFs
  'application/pdf': ['.pdf'],
  // Images  
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  // Text documents
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  // Office documents (be cautious)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
} as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.txt', '.csv', '.docx', '.xlsx'] as const;

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename: string;
  detectedMimeType?: string;
}

/**
 * Security-first file validation with MIME sniffing protection
 */
export const validateUploadedFile = async (file: Express.Multer.File): Promise<FileValidationResult> => {
  const extension = path.extname(file.originalname).toLowerCase() as typeof ALLOWED_EXTENSIONS[number];
  const declaredMimeType = file.mimetype.toLowerCase();
  
  // 1. Extension whitelist check
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `File extension ${extension} not allowed`,
      sanitizedFilename: ''
    };
  }
  
  // 2. Size check  
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${file.size} exceeds limit of ${MAX_FILE_SIZE} bytes`,
      sanitizedFilename: ''
    };
  }
  
  // 3. MIME type validation against extension
  const allowedMimes: string[] = [];
  for (const [mime, extensions] of Object.entries(ALLOWED_MIME_TYPES)) {
    if ((extensions as readonly string[]).includes(extension)) {
      allowedMimes.push(mime);
    }
  }
    
  if (!allowedMimes.includes(declaredMimeType)) {
    return {
      valid: false,
      error: `MIME type ${declaredMimeType} doesn't match extension ${extension}`,
      sanitizedFilename: ''
    };
  }
  
  // 4. Basic magic bytes validation for critical types
  let detectedMimeType: string | undefined;
  if (declaredMimeType === 'application/pdf') {
    const pdfValidation = await validatePdfMagicBytes(file.path);
    detectedMimeType = pdfValidation || undefined;
    if (detectedMimeType !== 'application/pdf') {
      return {
        valid: false,
        error: 'File claiming to be PDF has invalid magic bytes',
        sanitizedFilename: ''
      };
    }
  }
  
  // 5. Sanitize filename (prevent directory traversal)
  const sanitizedFilename = sanitizeFilename(file.originalname);
  
  return {
    valid: true,
    sanitizedFilename,
    detectedMimeType
  };
};

/**
 * Generate secure storage path with org isolation
 */
export const generateSecureStoragePath = (
  organizationId: string, 
  propertyId: string | null, 
  filename: string
): string => {
  // Validate inputs to prevent path traversal
  if (!organizationId.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new Error('Invalid organization ID format');
  }
  
  if (propertyId && !propertyId.match(/^[a-zA-Z0-9_-]+$/)) {
    throw new Error('Invalid property ID format');  
  }
  
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const hash = createHash('sha256')
    .update(`${organizationId}-${propertyId || 'global'}-${timestamp}-${random}`)
    .digest('hex')
    .substring(0, 8);
    
  const sanitizedFilename = sanitizeFilename(filename);
  const secureFilename = `${timestamp}-${hash}-${sanitizedFilename}`;
  
  // Multi-tenant isolation: /uploads/{orgId}/{propertyId}/
  const propertyPath = propertyId ? propertyId : 'global';
  return path.join('uploads', organizationId, propertyPath, secureFilename);
};

/**
 * Path traversal prevention 
 */
const sanitizeFilename = (filename: string): string => {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')  // Replace unsafe chars
    .replace(/\.{2,}/g, '_')          // Remove multiple dots
    .replace(/^[._-]/, '')            // Remove leading dots/underscores
    .substring(0, 100);               // Limit length
};

/**
 * Basic PDF magic bytes validation
 */
const validatePdfMagicBytes = async (filePath: string): Promise<string | null> => {
  try {
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(filePath, { encoding: null });
    
    // PDF files start with %PDF
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
      return 'application/pdf';
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Rate limiting for pre-signed URL generation
 */
export const documentRateLimiter = {
  max: 10,        // 10 uploads per window
  windowMs: 60 * 1000, // 1 minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many upload requests, try again later'
  },
  // Key by org + user 
  keyGenerator: (req: Request) => {
    return `${req.auth?.organizationId}-${req.auth?.userId}`;
  }
};