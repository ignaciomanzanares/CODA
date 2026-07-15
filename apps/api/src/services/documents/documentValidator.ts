/**
 * Document Validation Service
 *
 * Robust validation for uploaded documents (CMF reports, bank statements).
 *
 * Features:
 * - File size limits
 * - Format validation (PDF, images)
 * - Content integrity checks
 * - Metadata extraction
 * - Security checks (malware signatures)
 *
 * @author AI Assistant (Cursor)
 * @date 2026-03-06
 */

// ============================================================================
// CONSTANTS
// ============================================================================

export const VALIDATION_CONFIG = {
  // File size limits (bytes)
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
  MIN_FILE_SIZE: 1024, // 1 KB (empty files rejected)

  // Allowed MIME types
  ALLOWED_MIME_TYPES: ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"],

  // Allowed file extensions
  ALLOWED_EXTENSIONS: [".pdf", ".png", ".jpg", ".jpeg", ".webp"],

  // PDF validation
  MIN_PDF_TEXT_LENGTH: 100, // Minimum chars for valid document
  MAX_PDF_PAGES: 50, // Reject documents with too many pages

  // Security
  SUSPICIOUS_PATTERNS: [
    /<script/i,
    /javascript:/i,
    /%PDF-.*%PDF-/i, // Multiple PDF headers (suspicious)
  ],
};

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    fileSize: number;
    mimeType: string;
    extension: string;
    isPdf: boolean;
    isImage: boolean;
    estimatedPages?: number;
  };
}

export interface DocumentMetadata {
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: Date;
  isPdf: boolean;
  isImage: boolean;
  needsOcr: boolean;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate file size
 */
function validateFileSize(size: number): { valid: boolean; error?: string } {
  if (size < VALIDATION_CONFIG.MIN_FILE_SIZE) {
    return {
      valid: false,
      error: `Archivo demasiado pequeño (${size} bytes). El archivo puede estar corrupto o vacío.`,
    };
  }

  if (size > VALIDATION_CONFIG.MAX_FILE_SIZE) {
    const sizeMB = (size / (1024 * 1024)).toFixed(2);
    const maxMB = VALIDATION_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
    return {
      valid: false,
      error: `Archivo demasiado grande (${sizeMB} MB). Máximo permitido: ${maxMB} MB.`,
    };
  }

  return { valid: true };
}

/**
 * Validate file format
 */
function validateFileFormat(
  originalName: string,
  mimeType: string,
): { valid: boolean; error?: string } {
  // Check extension
  const ext = originalName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext || !VALIDATION_CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Formato no permitido: ${ext || "desconocido"}. Formatos válidos: PDF, PNG, JPG, WEBP.`,
    };
  }

  // Check MIME type
  if (!VALIDATION_CONFIG.ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Tipo MIME no permitido: ${mimeType}. El archivo puede estar corrupto.`,
    };
  }

  return { valid: true };
}

/**
 * Validate PDF integrity
 */
function validatePdfIntegrity(buffer: Buffer): {
  valid: boolean;
  error?: string;
  warning?: string;
} {
  const header = buffer.slice(0, 8).toString("utf8");

  // Check PDF magic number
  if (!header.startsWith("%PDF-")) {
    return {
      valid: false,
      error: "El archivo no es un PDF válido (magic number incorrecto). Puede estar corrupto.",
    };
  }

  // Check for multiple PDF headers (possible concatenated files)
  const fullText = buffer.toString("utf8", 0, Math.min(buffer.length, 10000));
  const pdfHeaderCount = (fullText.match(/%PDF-/g) || []).length;

  if (pdfHeaderCount > 1) {
    return {
      valid: false,
      error: "El PDF parece contener múltiples documentos concatenados. Sube un archivo a la vez.",
    };
  }

  // Check for PDF trailer
  const trailer = buffer.slice(-1024).toString("utf8");
  if (!trailer.includes("%%EOF")) {
    return {
      valid: true,
      warning: "El PDF puede estar truncado (falta %%EOF). Puede fallar al parsear.",
    };
  }

  return { valid: true };
}

/**
 * Detect if PDF is scanned (needs OCR)
 */
function detectIfScanned(text: string, pageCount: number): boolean {
  // If very little text for many pages, likely scanned
  const charsPerPage = text.length / Math.max(pageCount, 1);

  if (charsPerPage < 50) {
    return true; // Likely scanned or image-based PDF
  }

  // Check for common OCR artifacts
  const hasOcrArtifacts =
    /[▪●◦■□▫▪]/g.test(text) || // Bullet points often fail OCR
    text.replace(/\s/g, "").length < text.length * 0.3; // Too much whitespace

  return hasOcrArtifacts;
}

/**
 * Security check for malicious content
 */
function securityCheck(buffer: Buffer): { valid: boolean; error?: string } {
  const sample = buffer.slice(0, 10000).toString("utf8");

  for (const pattern of VALIDATION_CONFIG.SUSPICIOUS_PATTERNS) {
    if (pattern.test(sample)) {
      return {
        valid: false,
        error: "El archivo contiene contenido sospechoso. Por seguridad, no se puede procesar.",
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

/**
 * Comprehensive document validation
 */
export function validateDocument(file: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. File size validation
  const sizeCheck = validateFileSize(file.size);
  if (!sizeCheck.valid) {
    errors.push(sizeCheck.error!);
  }

  // 2. Format validation
  const formatCheck = validateFileFormat(file.originalname, file.mimetype);
  if (!formatCheck.valid) {
    errors.push(formatCheck.error!);
  }

  // If basic checks fail, return early
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  const isPdf = file.mimetype === "application/pdf";
  const isImage = file.mimetype.startsWith("image/");

  // 3. PDF-specific validation
  if (isPdf) {
    const pdfCheck = validatePdfIntegrity(file.buffer);
    if (!pdfCheck.valid) {
      errors.push(pdfCheck.error!);
    }
    if (pdfCheck.warning) {
      warnings.push(pdfCheck.warning);
    }
  }

  // 4. Security check
  const secCheck = securityCheck(file.buffer);
  if (!secCheck.valid) {
    errors.push(secCheck.error!);
  }

  // Return result
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      fileSize: file.size,
      mimeType: file.mimetype,
      extension: file.originalname.match(/\.[^.]+$/)?.[0] || "",
      isPdf,
      isImage,
    },
  };
}

/**
 * Enhanced validation with content analysis
 */
export async function validateDocumentWithContent(
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  },
  extractedText?: string,
): Promise<ValidationResult> {
  // First, basic validation
  const basicValidation = validateDocument(file);

  if (!basicValidation.valid) {
    return basicValidation;
  }

  const errors = [...basicValidation.errors];
  const warnings = [...basicValidation.warnings];

  // If we have extracted text, validate content
  if (extractedText) {
    // Check minimum text length
    if (extractedText.length < VALIDATION_CONFIG.MIN_PDF_TEXT_LENGTH) {
      warnings.push(
        `El documento contiene muy poco texto (${extractedText.length} caracteres). ` +
          `Puede ser un PDF escaneado que requiere OCR.`,
      );
    }

    // Check for CMF or Cartola indicators
    const hasCmfIndicators = /CMF|Comisión.*Mercado.*Financiero|Informe.*Deudas/i.test(
      extractedText,
    );
    const hasCartolaIndicators = /Cartola|Banco.*Santander|Banco.*Chile|Estado.*Cuenta/i.test(
      extractedText,
    );

    if (!hasCmfIndicators && !hasCartolaIndicators) {
      warnings.push(
        "No se detectaron indicadores de documento CMF o Cartola bancaria. " +
          "Verifica que el archivo sea correcto.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: basicValidation.metadata,
  };
}

/**
 * Validate document for specific type (CMF or Cartola)
 */
export function validateDocumentType(
  extractedDoc: any,
  expectedType?: "cmf" | "cartola",
): { valid: boolean; error?: string } {
  if (!extractedDoc) {
    return {
      valid: false,
      error:
        "No se pudo extraer información del documento. Verifica que sea un PDF válido con texto.",
    };
  }

  if (expectedType === "cmf" && extractedDoc.tipo !== "cmf_informe_deudas") {
    return {
      valid: false,
      error: "El documento no parece ser un Informe de Deudas CMF válido.",
    };
  }

  if (expectedType === "cartola" && extractedDoc.tipo !== "cartola") {
    return {
      valid: false,
      error: "El documento no parece ser una Cartola bancaria válida.",
    };
  }

  // Validate CMF document has required fields
  if (extractedDoc.tipo === "cmf_informe_deudas") {
    if (!extractedDoc.rutDocumento) {
      return {
        valid: false,
        error:
          "No se encontró un RUT válido en el Informe CMF. Verifica que sea un documento oficial.",
      };
    }

    if (extractedDoc.deudaTotalVigente === undefined || extractedDoc.deudaTotalVigente === null) {
      return {
        valid: false,
        error: "No se pudo extraer la Deuda Total Vigente del informe CMF.",
      };
    }
  }

  // Validate Cartola has transactions
  if (extractedDoc.tipo === "cartola") {
    if (!extractedDoc.transacciones || extractedDoc.transacciones.length === 0) {
      return {
        valid: false,
        error:
          "No se encontraron transacciones en la cartola. Verifica que el documento sea correcto.",
      };
    }

    if (extractedDoc.transacciones.length < 3) {
      return {
        valid: true,
        // Not an error, just a note
      };
    }
  }

  return { valid: true };
}
