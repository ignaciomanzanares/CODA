/**
 * PART B — la rasterización de PDF escaneado debe correr en Render (node nativo,
 * sin paquetes de sistema) y alimentar al OCR.
 *
 * Construye un PDF SÓLO-IMAGEN (texto rasterizado, sin capa de texto) — el mismo
 * caso del escaneo del depto-306 — y verifica que:
 *   1) rasterizePdfPageToPng devuelve un PNG no vacío, y
 *   2) tesseract.js extrae el texto esperado de ese PNG.
 *
 * El path viejo (pdfjs sobre node-canvas) producía una página en blanco en este
 * runtime; el nuevo (mupdf WASM) rasteriza la imagen embebida correctamente.
 */
import { describe, it, expect } from "vitest";
import {
  rasterizePdfPageToPng,
  performOcrOnImage,
} from "../../src/services/documents/ocrService.js";

const EXPECTED = "HIPOTECA 123456";

/** PDF de una página cuyo ÚNICO contenido es una imagen PNG con texto (sin capa de texto). */
async function makeImageOnlyPdf(text: string): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const FONT = "bold 96px sans-serif";
  // Medir ANTES de dimensionar: qué fuente resuelve 'sans-serif' depende del
  // sistema (runner de CI ≠ dev). Con un ancho fijo de 1000px y una fuente más
  // ancha, el último dígito quedaba cortado y el OCR leía '12345' (CI rojo
  // desde que GitHub actualizó las fuentes del runner).
  const probe = createCanvas(10, 10).getContext("2d");
  probe.font = FONT;
  const W = Math.ceil(probe.measureText(text).width) + 120;
  const H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.font = FONT;
  ctx.fillText(text, 60, 160);
  const pngImage = canvas.toBuffer("image/png");

  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const embedded = await pdf.embedPng(pngImage);
  page.drawImage(embedded, { x: 0, y: 0, width: W, height: H });
  return Buffer.from(await pdf.save());
}

describe("rasterización de PDF escaneado → OCR (Render-safe)", () => {
  it("rasteriza un PDF sólo-imagen a PNG y tesseract lee el texto", async () => {
    const pdf = await makeImageOnlyPdf(EXPECTED);

    const png = await rasterizePdfPageToPng(pdf, 1);
    expect(png.length).toBeGreaterThan(0);
    // Cabecera PNG (\x89PNG) — confirma que es realmente un PNG.
    expect(png.subarray(0, 4).toString("latin1")).toBe("\x89PNG");

    const ocr = await performOcrOnImage(png, "eng");
    const got = ocr.text.replace(/\s+/g, " ").trim().toUpperCase();
    expect(got).toContain("HIPOTECA");
    expect(got).toContain("123456");
  }, 120_000); // tesseract baja el modelo de idioma la primera vez
});
