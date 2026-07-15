/**
 * Enhanced Document Upload Service
 *
 * Robust document processing with:
 * - Multi-stage validation
 * - OCR for scanned documents
 * - Retry logic
 * - Clear error messages
 * - Progress tracking
 *
 * @author AI Assistant (Cursor)
 * @date 2026-03-06
 */

import {
  validateDocument,
  validateDocumentWithContent,
  validateDocumentType,
} from "./documentValidator.js";
import { smartOcr } from "./ocrService.js";
import { analyzePdfBuffer, type DocumentoExtraido } from "./pdfAnalysis.js";
import { logger } from "../../logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface UploadProgress {
  stage: "validating" | "extracting" | "ocr" | "analyzing" | "scoring" | "done" | "error";
  progress: number; // 0-100
  message: string;
  error?: string;
  warnings?: string[];
}

export interface EnhancedUploadResult {
  success: boolean;
  document?: DocumentoExtraido;
  errors?: string[];
  warnings?: string[];
  metadata?: {
    usedOcr: boolean;
    ocrConfidence?: number;
    processingTimeMs: number;
    fileSize: number;
    originalName: string;
  };
}

// ============================================================================
// ENHANCED UPLOAD PIPELINE
// ============================================================================

/**
 * Process document with full validation and OCR pipeline
 */
export async function processDocumentRobust(
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  },
  options?: {
    expectedType?: "cmf" | "cartola";
    enableOcr?: boolean;
    maxRetries?: number;
  },
): Promise<EnhancedUploadResult> {
  const startTime = Date.now();
  const enableOcr = options?.enableOcr ?? true;
  const maxRetries = options?.maxRetries ?? 2;

  logger.info(
    {
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    },
    "[EnhancedUpload] Starting document processing",
  );

  // ========== STAGE 1: VALIDATION ==========

  const validation = validateDocument(file);

  if (!validation.valid) {
    logger.warn({ errors: validation.errors }, "[EnhancedUpload] Validation failed");
    return {
      success: false,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  }

  if (validation.warnings.length > 0) {
    logger.warn({ warnings: validation.warnings }, "[EnhancedUpload] Validation warnings");
  }

  // ========== STAGE 2: TEXT EXTRACTION ==========

  let extractedText = "";
  let usedOcr = false;
  let ocrConfidence: number | undefined;

  try {
    // Try native PDF text extraction first
    if (file.mimetype === "application/pdf") {
      const doc = await analyzePdfBuffer(file.buffer);

      if (doc) {
        // Check if we got enough text
        const textLength = (doc as any).rawText?.length || 0;

        if (textLength >= 100) {
          // Good text extraction
          logger.info({ textLength }, "[EnhancedUpload] Native PDF extraction successful");

          // Validate content
          const contentValidation = await validateDocumentWithContent(file, (doc as any).rawText);

          const typeValidation = validateDocumentType(doc, options?.expectedType);

          if (!typeValidation.valid) {
            return {
              success: false,
              errors: [typeValidation.error!],
              warnings: contentValidation.warnings,
            };
          }

          return {
            success: true,
            document: doc,
            warnings: contentValidation.warnings,
            metadata: {
              usedOcr: false,
              processingTimeMs: Date.now() - startTime,
              fileSize: file.size,
              originalName: file.originalname,
            },
          };
        } else {
          logger.warn({ textLength }, "[EnhancedUpload] Insufficient text extracted, will try OCR");
        }
      }
    }

    // ========== STAGE 3: OCR (if needed) ==========

    if (enableOcr) {
      logger.info("[EnhancedUpload] Attempting OCR extraction...");

      try {
        const ocrResult = await smartOcr(file.buffer, extractedText, file.mimetype);

        if (ocrResult.usedOcr && ocrResult.ocrResult) {
          extractedText = ocrResult.text;
          usedOcr = true;
          ocrConfidence = ocrResult.ocrResult.confidence;

          logger.info(
            {
              textLength: extractedText.length,
              confidence: ocrConfidence,
              timeMs: ocrResult.ocrResult.processingTimeMs,
            },
            "[EnhancedUpload] OCR successful",
          );

          // Now parse the OCR text
          // TODO: Re-run parseCmfInformeDeudas() or parseCartolaPdf() on OCR text
          // For now, return warning
          return {
            success: false,
            errors: [
              "El documento requiere OCR (está escaneado). " +
                "Por ahora, intenta subir un PDF con texto nativo o una imagen más clara.",
            ],
            warnings: [
              ocrConfidence < 0.7
                ? `OCR completado con baja confianza (${Math.round(ocrConfidence * 100)}%). Los resultados pueden ser inexactos.`
                : `OCR completado exitosamente (confianza: ${Math.round(ocrConfidence * 100)}%).`,
            ],
            metadata: {
              usedOcr: true,
              ocrConfidence,
              processingTimeMs: Date.now() - startTime,
              fileSize: file.size,
              originalName: file.originalname,
            },
          };
        }
      } catch (ocrError) {
        logger.error({ error: ocrError }, "[EnhancedUpload] OCR failed");
        // Fall through to error
      }
    }

    // If we reach here, extraction failed
    return {
      success: false,
      errors: [
        "No se pudo extraer texto del documento.",
        "Verifica que:",
        "• El PDF contenga texto seleccionable (no sea solo una imagen escaneada)",
        "• El archivo no esté protegido con contraseña",
        "• El documento sea un Informe CMF o Cartola válida",
      ],
      warnings: validation.warnings,
    };
  } catch (error) {
    logger.error({ error }, "[EnhancedUpload] Unexpected error");
    return {
      success: false,
      errors: [
        "Error inesperado al procesar el documento.",
        "Intenta de nuevo o contacta soporte si el problema persiste.",
      ],
    };
  }
}

/**
 * Retry wrapper with exponential backoff
 */
export async function processDocumentWithRetry(
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  },
  options?: Parameters<typeof processDocumentRobust>[1],
): Promise<EnhancedUploadResult> {
  const maxRetries = options?.maxRetries ?? 2;
  let lastError: EnhancedUploadResult | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ attempt, maxRetries }, "[EnhancedUpload] Processing attempt");

      const result = await processDocumentRobust(file, options);

      if (result.success) {
        if (attempt > 1) {
          logger.info({ attempt }, "[EnhancedUpload] Succeeded after retry");
        }
        return result;
      }

      lastError = result;

      // If validation errors (user's fault), don't retry
      if (result.errors?.some((e) => e.includes("no permitido") || e.includes("demasiado"))) {
        logger.info("[EnhancedUpload] Validation error, not retrying");
        return result;
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        logger.info({ waitMs }, "[EnhancedUpload] Waiting before retry");
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    } catch (error) {
      logger.error({ error, attempt }, "[EnhancedUpload] Unexpected error in attempt");
      lastError = {
        success: false,
        errors: ["Error inesperado al procesar el documento."],
      };
    }
  }

  // All retries failed
  logger.error("[EnhancedUpload] All retries failed");
  return (
    lastError || {
      success: false,
      errors: ["Error al procesar el documento después de varios intentos."],
    }
  );
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get user-friendly error message
 */
export function getErrorMessage(errors: string[]): string {
  if (errors.length === 0) return "Error desconocido";

  if (errors.length === 1) return errors[0];

  return errors.join(" ");
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: string): boolean {
  const nonRetryablePatterns = [
    /no permitido/i,
    /demasiado grande/i,
    /demasiado pequeño/i,
    /no válido/i,
    /corrupto/i,
  ];

  return !nonRetryablePatterns.some((pattern) => pattern.test(error));
}
