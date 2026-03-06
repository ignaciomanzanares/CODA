/**
 * Image to PDF Converter
 * 
 * Converts image uploads (PNG, JPG, WEBP) to PDF format
 * for unified processing pipeline.
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-06
 */

import { createCanvas, loadImage } from 'canvas';
import type { Buffer } from 'buffer';

// ============================================================================
// CONVERSION
// ============================================================================

/**
 * Convert image buffer to PDF
 * 
 * Creates a single-page PDF with the image embedded.
 * The PDF will be compatible with pdfjs for text extraction (if OCR applied).
 */
export async function convertImageToPdf(imageBuffer: Buffer): Promise<Buffer> {
  try {
    // Load image
    const img = await loadImage(imageBuffer);
    
    // Create canvas with image dimensions
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    
    // Draw image
    ctx.drawImage(img, 0, 0);
    
    // Convert to PDF
    // Note: canvas.toBuffer('application/pdf') creates a PDF with the image embedded
    const pdfBuffer = canvas.toBuffer('application/pdf');
    
    return pdfBuffer;
  } catch (error) {
    console.error('[ImageConverter] Error converting image to PDF:', error);
    throw new Error('Error al convertir imagen a PDF. Verifica que la imagen sea válida.');
  }
}

/**
 * Check if file is an image
 */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Get optimal dimensions for PDF conversion
 * (scales down very large images to reduce PDF size)
 */
export function getOptimalDimensions(
  width: number,
  height: number,
  maxWidth: number = 2480, // A4 at 300dpi
  maxHeight: number = 3508
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }
  
  const aspectRatio = width / height;
  
  if (width > height) {
    // Landscape
    return {
      width: maxWidth,
      height: Math.round(maxWidth / aspectRatio),
    };
  } else {
    // Portrait
    return {
      width: Math.round(maxHeight * aspectRatio),
      height: maxHeight,
    };
  }
}

/**
 * Convert and optimize image to PDF
 */
export async function convertImageToPdfOptimized(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const img = await loadImage(imageBuffer);
    
    // Get optimal dimensions
    const { width, height } = getOptimalDimensions(img.width, img.height);
    
    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // White background (for transparent PNGs)
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    
    // Draw image with smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, width, height);
    
    // Convert to PDF
    const pdfBuffer = canvas.toBuffer('application/pdf');
    
    console.log(
      `[ImageConverter] Converted ${img.width}x${img.height} → ${width}x${height} PDF (${pdfBuffer.length} bytes)`
    );
    
    return pdfBuffer;
  } catch (error) {
    console.error('[ImageConverter] Error in optimized conversion:', error);
    // Fallback to basic conversion
    return convertImageToPdf(imageBuffer);
  }
}
