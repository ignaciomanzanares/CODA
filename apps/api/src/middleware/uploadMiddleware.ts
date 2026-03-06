/**
 * Enhanced Upload Middleware
 * 
 * Multer configuration with robust validation and error handling.
 * 
 * Features:
 * - File size limits
 * - MIME type validation
 * - Memory storage (for processing)
 * - Clear error messages
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-06
 */

import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { VALIDATION_CONFIG } from '../services/documents/documentValidator.js';

// ============================================================================
// MULTER CONFIGURATION
// ============================================================================

/**
 * File filter with validation
 */
function fileFilter(
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  // Check MIME type
  if (!VALIDATION_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(
      new Error(
        `Formato no permitido: ${file.mimetype}. ` +
        `Formatos válidos: PDF, PNG, JPG, WEBP.`
      )
    );
  }
  
  // Check extension
  const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext || !VALIDATION_CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(
      new Error(
        `Extensión no permitida: ${ext || 'ninguna'}. ` +
        `Extensiones válidas: .pdf, .png, .jpg, .jpeg, .webp.`
      )
    );
  }
  
  cb(null, true);
}

/**
 * Enhanced Multer instance for document uploads
 */
export const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: VALIDATION_CONFIG.MAX_FILE_SIZE,
    files: 1, // Only one file at a time
  },
  fileFilter,
});

/**
 * Error handler for multer errors
 */
export function handleMulterError(error: any): string {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        const maxMB = VALIDATION_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
        return `Archivo demasiado grande. Máximo permitido: ${maxMB} MB.`;
      
      case 'LIMIT_FILE_COUNT':
        return 'Solo se puede subir un archivo a la vez.';
      
      case 'LIMIT_UNEXPECTED_FILE':
        return 'Campo de archivo inesperado. Usa el campo "document".';
      
      default:
        return `Error al subir archivo: ${error.message}`;
    }
  }
  
  if (error.message) {
    return error.message;
  }
  
  return 'Error desconocido al subir archivo.';
}

/**
 * Middleware to validate uploaded file exists
 */
export function requireFile(req: Request, res: any, next: any): void {
  if (!req.file) {
    return res.status(400).json({
      error: 'No se recibió ningún archivo',
      message: 'Debes subir un archivo PDF, PNG, JPG o WEBP.',
    });
  }
  
  next();
}
