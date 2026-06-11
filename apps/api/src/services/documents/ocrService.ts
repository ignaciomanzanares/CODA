/**
 * OCR Service for Scanned Documents
 * 
 * Handles OCR (Optical Character Recognition) for:
 * - Scanned PDFs
 * - Image-based PDFs
 * - Image uploads (PNG, JPG, WEBP)
 * 
 * Uses Tesseract.js for Spanish language OCR.
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-06
 */

import { createWorker } from 'tesseract.js';
import type { Buffer } from 'buffer';
import { createCanvas, loadImage } from 'canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// ============================================================================
// TYPES
// ============================================================================

export interface OcrResult {
  text: string;
  confidence: number;
  processingTimeMs: number;
  needsManualReview: boolean;
}

// ============================================================================
// OCR FUNCTIONS
// ============================================================================

/**
 * Perform OCR on image buffer
 */
export async function performOcrOnImage(
  imageBuffer: Buffer,
  language: string = 'spa' // Spanish
): Promise<OcrResult> {
  const startTime = Date.now();
  
  try {
    const worker = await createWorker(language);
    
    const { data } = await worker.recognize(imageBuffer);
    
    await worker.terminate();
    
    const confidence = data.confidence / 100; // Normalize to 0-1
    const needsManualReview = confidence < 0.7; // Low confidence = manual review
    
    return {
      text: data.text,
      confidence,
      processingTimeMs: Date.now() - startTime,
      needsManualReview,
    };
  } catch (error) {
    console.error('[OCR] Error performing OCR:', error);
    throw new Error('Error al procesar OCR. Intenta con un archivo más claro.');
  }
}

/**
 * Convert PDF page to image and perform OCR
 */
export async function performOcrOnPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number = 1
): Promise<OcrResult> {
  try {
    // Load PDF — pdfjs-dist requires a Uint8Array (not a Node Buffer). Copy into a
    // fresh Uint8Array so pdfjs can't detach the shared Buffer pool.
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdf = await loadingTask.promise;

    if (pageNumber > pdf.numPages) {
      throw new Error(`El PDF solo tiene ${pdf.numPages} página(s)`);
    }
    
    // Get page
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x for better OCR quality
    
    // Render to canvas
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    
    await page.render({
      canvasContext: context,
      viewport,
    } as any).promise;
    
    // Convert canvas to buffer
    const imageBuffer = canvas.toBuffer('image/png');
    
    // Perform OCR on image
    return await performOcrOnImage(imageBuffer);
  } catch (error) {
    console.error('[OCR] Error processing PDF page:', error);
    throw new Error('Error al extraer imagen del PDF para OCR.');
  }
}

/**
 * Perform OCR on all pages of a PDF
 */
export async function performOcrOnFullPdf(
  pdfBuffer: Buffer,
  maxPages: number = 10
): Promise<OcrResult> {
  const startTime = Date.now();
  
  try {
    // pdfjs-dist requires a Uint8Array (not a Node Buffer); copy to be safe.
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
    const pdf = await loadingTask.promise;

    const pagesToProcess = Math.min(pdf.numPages, maxPages);
    const texts: string[] = [];
    const confidences: number[] = [];
    
    // Resiliente por página: una página que no renderiza (incompatibilidad
    // pdfjs/canvas con ciertas imágenes) no debe abortar el OCR completo.
    for (let pageNum = 1; pageNum <= pagesToProcess; pageNum++) {
      try {
        const pageResult = await performOcrOnPdfPage(pdfBuffer, pageNum);
        texts.push(pageResult.text);
        confidences.push(pageResult.confidence);
      } catch (e) {
        console.error(`[OCR] page ${pageNum} failed, skipping:`, e);
      }
    }

    const combinedText = texts.join('\n\n');
    const avgConfidence = confidences.length
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

    return {
      text: combinedText,
      confidence: avgConfidence,
      processingTimeMs: Date.now() - startTime,
      needsManualReview: avgConfidence < 0.7,
    };
  } catch (error) {
    console.error('[OCR] Error processing full PDF:', error);
    throw new Error('Error al procesar PDF con OCR.');
  }
}

/**
 * Smart OCR: Only use OCR if needed
 */
export async function smartOcr(
  buffer: Buffer,
  extractedText: string,
  mimeType: string
): Promise<{ text: string; usedOcr: boolean; ocrResult?: OcrResult }> {
  // If it's an image, always use OCR
  if (mimeType.startsWith('image/')) {
    console.log('[OCR] Image detected, using OCR...');
    const ocrResult = await performOcrOnImage(buffer);
    return {
      text: ocrResult.text,
      usedOcr: true,
      ocrResult,
    };
  }
  
  // If extracted text is too short, try OCR
  if (extractedText.length < 100) {
    console.log('[OCR] Insufficient text extracted, attempting OCR...');
    try {
      const ocrResult = await performOcrOnPdfPage(buffer, 1);
      
      // If OCR finds more text, use it
      if (ocrResult.text.length > extractedText.length) {
        return {
          text: ocrResult.text,
          usedOcr: true,
          ocrResult,
        };
      }
    } catch (error) {
      console.error('[OCR] OCR failed, using original text:', error);
    }
  }
  
  // Use original extracted text
  return {
    text: extractedText,
    usedOcr: false,
  };
}

// ============================================================================
// PREPROCESSING
// ============================================================================

/**
 * Enhance image quality before OCR
 */
export async function enhanceImageForOcr(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const img = await loadImage(imageBuffer);
    
    // Create canvas with higher resolution
    const canvas = createCanvas(img.width * 1.5, img.height * 1.5);
    const ctx = canvas.getContext('2d');
    
    // Draw with smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Apply simple contrast enhancement
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const factor = 1.2; // Contrast multiplier
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * factor); // R
      data[i + 1] = Math.min(255, data[i + 1] * factor); // G
      data[i + 2] = Math.min(255, data[i + 2] * factor); // B
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('[OCR] Error enhancing image:', error);
    // Return original if enhancement fails
    return imageBuffer;
  }
}
