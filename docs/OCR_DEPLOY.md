# OCR for scanned inscriptions — deploy notes (Render)

The property-inscription extractor (`apps/api/src/parsers/inscripcionExtractor.ts`)
falls back to OCR when an uploaded CBR "copia autorizada" PDF is image-only (no
text layer) — the typical depto-306-with-hipoteca case.

## Toolchain (all in `apps/api` deps — no system packages needed)
- **`tesseract.js`** (`^7`): OCR engine as WASM, bundled in `node_modules`. It does
  **not** require the `tesseract-ocr` system package.
- **`mupdf`** (`^1.27`, **WASM**): rasterizes a PDF page to a PNG
  (`Document.openDocument` → `page.toPixmap` → `asPNG`). Pure WASM, so a plain
  `npm install` works on Render's native Node runtime — **no poppler / pdftoppm /
  ghostscript / imagemagick, no `apt`.** This is the primary rasterizer.
- **`@napi-rs/canvas`** (`^0.1`): prebuilt-native canvas used as a *fallback*
  rasterizer (pdfjs backend) and to build OCR test fixtures. Ships prebuilt
  binaries for common Linux/Node targets → installs under plain `npm install`.

> The legacy `canvas` (`^3`) dep is still present (used by `enhanceImageForOcr`),
> but the PDF→image rasterization no longer goes through `canvas`/`pdfjs`.

## Why mupdf is first (the bug this fixes)
`pdfjs-dist` rendering a full-page scanned image onto a canvas backend
(`node-canvas` **or** `@napi-rs/canvas`) does **not** reliably draw the embedded
image: on Render's runtime it threw `Image or Canvas expected`, and even where it
doesn't throw it can silently produce a **blank** page — so OCR got nothing and the
hipoteca never extracted. `mupdf` (WASM) rasterizes the embedded image correctly
with no canvas/pdfjs interop involved. Verified with an image-only PDF: mupdf →
non-empty PNG → tesseract reads the text (see
`test/services/ocrRasterize.test.ts`). The rasterizer order is therefore:

1. **mupdf** (WASM) — deterministic for scans;
2. **pdfjs + @napi-rs/canvas** — only if mupdf throws (rare, non-scanned PDFs).

Both are **lazy-loaded** (`await import(...)`) inside `rasterizePdfPageToPng`, so
they never slow cold start. If both fail, the error propagates and the caller
returns the clean **manual-entry fallback** — it never throws, so
`/extract-inscripcion` never 500s.

## How it's wired (unchanged shape — only the rasterizer changed)
- OCR is lazy-loaded only when a scanned inscription is uploaded via
  `POST /api/assets/extract-inscripcion`. It never runs on startup, nor on
  cartola/CMF uploads.
- The extractor's OCR path (`extractInscripcionFromBuffer` → `performOcrOnFullPdf`)
  and the endpoint response shape are the same; only `performOcrOnPdfPage`'s
  rasterization step was swapped to `rasterizePdfPageToPng`.
- If OCR is unavailable or yields garbage, the extractor returns
  `{ manualFallback: true, message }` — the asset form asks the user to enter the
  data manually. **It never 500s and never blocks the asset flow.**

## What to (re)deploy on Render
- Only the **`coda-api`** web service (`render.yaml`). The existing
  `buildCommand` (`npm install --include=dev && npm run build`) installs
  `tesseract.js` + `mupdf` + `@napi-rs/canvas` from npm. **No system package, no
  Docker runtime, no new env vars.**
- `apps/web` (Vercel) is unaffected by this change.
