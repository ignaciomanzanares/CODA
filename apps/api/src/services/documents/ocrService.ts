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

import { createWorker, createScheduler } from 'tesseract.js';
import { Buffer } from 'buffer';
import * as os from 'node:os';
// Carga diferida del módulo nativo `canvas`: solo se importa al usarse (preprocesamiento de
// imagen para OCR), no al importar este archivo. Así tests/CI sin el binario nativo compilado
// (build/Release/canvas.node) pueden importar este módulo sin romperse. La rasterización de
// PDF usa @napi-rs/canvas (prebuilt) por separado.
let _canvasMod: typeof import('canvas') | null = null;
async function getCanvas(): Promise<typeof import('canvas')> {
  if (!_canvasMod) _canvasMod = await import('canvas');
  return _canvasMod;
}
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

// ============================================================================
// POOL DE WORKERS TESSERACT REUTILIZABLES (#19)
// ============================================================================
//
// Antes se hacía createWorker()/terminate() por CADA documento: cargar el modelo de
// idioma (~varios MB) y arrancar el worker en cada OCR es caro y serializa el trabajo.
// Ahora mantenemos un pool de N workers (un `Scheduler` de tesseract.js) que se inicializa
// una vez y se reutiliza; los jobs se reparten entre los workers en paralelo. N se liga a los
// cores disponibles (cap razonable para no agotar memoria con los modelos cargados).

const OCR_POOL_LANGUAGE = 'spa';
const OCR_POOL_SIZE = Math.max(1, Math.min(Number(process.env.OCR_POOL_SIZE) || os.cpus().length, 4));

let _schedulerPromise: Promise<ReturnType<typeof createScheduler>> | null = null;

async function getOcrScheduler(): Promise<ReturnType<typeof createScheduler>> {
  if (!_schedulerPromise) {
    _schedulerPromise = (async () => {
      const scheduler = createScheduler();
      for (let i = 0; i < OCR_POOL_SIZE; i++) {
        const worker = await createWorker(OCR_POOL_LANGUAGE);
        scheduler.addWorker(worker);
      }
      return scheduler;
    })().catch((err) => {
      // Si la init falla, limpiar para permitir un reintento en la próxima llamada.
      _schedulerPromise = null;
      throw err;
    });
  }
  return _schedulerPromise;
}

/** Cierra el pool (workers) — para apagado limpio del proceso/worker. */
export async function shutdownOcrPool(): Promise<void> {
  if (!_schedulerPromise) return;
  const p = _schedulerPromise;
  _schedulerPromise = null;
  try {
    const scheduler = await p;
    await scheduler.terminate();
  } catch {
    /* best-effort */
  }
}

/**
 * Perform OCR on image buffer. Usa el pool de workers reutilizables para el idioma por defecto
 * ('spa'); para otros idiomas (raro) cae a un worker one-off para no contaminar el pool.
 */
export async function performOcrOnImage(
  imageBuffer: Buffer,
  language: string = 'spa' // Spanish
): Promise<OcrResult> {
  const startTime = Date.now();

  const toResult = (data: { text: string; confidence: number }): OcrResult => {
    const confidence = data.confidence / 100; // Normalize to 0-1
    return {
      text: data.text,
      confidence,
      processingTimeMs: Date.now() - startTime,
      needsManualReview: confidence < 0.7, // Low confidence = manual review
    };
  };

  try {
    if (language !== OCR_POOL_LANGUAGE) {
      // Idioma no-default: worker one-off (no entra al pool 'spa').
      const worker = await createWorker(language);
      try {
        const { data } = await worker.recognize(imageBuffer);
        return toResult(data);
      } finally {
        await worker.terminate();
      }
    }

    const scheduler = await getOcrScheduler();
    const { data } = await scheduler.addJob('recognize', imageBuffer);
    return toResult(data);
  } catch (error) {
    console.error('[OCR] Error performing OCR:', error);
    throw new Error('Error al procesar OCR. Intenta con un archivo más claro.');
  }
}

// ============================================================================
// RASTERIZACIÓN PDF → PNG (Render-safe, sin paquetes de sistema)
// ============================================================================
//
// El path viejo (pdfjs renderizando sobre `node-canvas`) lanza
// "Image or Canvas expected" en el runtime de Render (escaneos como el depto-306),
// por lo que el OCR no obtenía nada. Reemplazamos SÓLO la rasterización con una
// cadena npm-only (sin apt/poppler/ghostscript), perezosa para no penalizar el
// cold start.
//
// ORDEN (verificado empíricamente con un PDF SÓLO-IMAGEN, que es justo el caso
// de un escaneo):
//   1) mupdf (WASM) → pixmap → PNG. No usa canvas ni pdfjs, así que es inmune al
//      problema de interop y rasteriza bien las imágenes embebidas. Es el camino
//      determinista para escaneos.
//   2) Fallback: pdfjs con backend @napi-rs/canvas (prebuilt nativo). OJO: para
//      PDFs sólo-imagen pdfjs+canvas NO lanza, sino que produce una página EN
//      BLANCO (de ahí que mupdf vaya primero); este fallback sólo aporta para PDFs
//      raros que mupdf no logre abrir.
// Si ambas fallan, se propaga el error y el llamador cae al fallback manual.

/** (1) pdfjs sobre @napi-rs/canvas. Lazy: el backend nativo se carga al usarse. */
async function rasterizeWithNapiCanvas(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number,
): Promise<Buffer> {
  const { createCanvas: createNapiCanvas } = await import('@napi-rs/canvas');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  if (pageNumber > pdf.numPages) {
    throw new Error(`El PDF solo tiene ${pdf.numPages} página(s)`);
  }
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = createNapiCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  await page.render({ canvasContext: context as unknown as object, viewport } as any).promise;
  const png = canvas.toBuffer('image/png');
  if (!png || png.length === 0) throw new Error('@napi-rs/canvas devolvió un PNG vacío');
  return png;
}

/** (2) Fallback mupdf (WASM): página → pixmap → PNG. Sin canvas ni pdfjs. */
async function rasterizeWithMupdf(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number,
): Promise<Buffer> {
  // Specifier indirecto: mupdf trae sus tipos pero no resuelven bajo el
  // moduleResolution actual del proyecto. En runtime sí resuelve (lo cubre el
  // test). Evita tocar tsconfig globalmente.
  const mupdfSpecifier = 'mupdf';
  const mupdfMod = await import(mupdfSpecifier);
  const mupdf: any = (mupdfMod as any).default ?? mupdfMod;
  const doc = mupdf.Document.openDocument(new Uint8Array(pdfBuffer), 'application/pdf');
  const pageCount = doc.countPages();
  if (pageNumber > pageCount) {
    throw new Error(`El PDF solo tiene ${pageCount} página(s)`);
  }
  const page = doc.loadPage(pageNumber - 1); // mupdf es 0-indexed
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
  const png = Buffer.from(pixmap.asPNG());
  if (!png || png.length === 0) throw new Error('mupdf devolvió un PNG vacío');
  return png;
}

/**
 * Rasteriza una página de un PDF a un buffer PNG. Usa mupdf (WASM) y, si falla,
 * pdfjs+@napi-rs/canvas. Lanza si ambas fallan (→ fallback manual aguas arriba).
 */
export async function rasterizePdfPageToPng(
  pdfBuffer: Buffer,
  pageNumber: number = 1,
  scale: number = 2.0, // 2x para mejor calidad de OCR
): Promise<Buffer> {
  try {
    return await rasterizeWithMupdf(pdfBuffer, pageNumber, scale);
  } catch (mupdfErr) {
    console.warn(
      '[OCR] mupdf falló, reintentando con pdfjs+@napi-rs/canvas:',
      mupdfErr instanceof Error ? mupdfErr.message : mupdfErr,
    );
    return await rasterizeWithNapiCanvas(pdfBuffer, pageNumber, scale);
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
    const imageBuffer = await rasterizePdfPageToPng(pdfBuffer, pageNumber);
    // Perform OCR on the rasterized page
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
    const { createCanvas, loadImage } = await getCanvas();
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
