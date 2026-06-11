# OCR for scanned inscriptions — deploy notes (Render)

The property-inscription extractor (`apps/api/src/parsers/inscripcionExtractor.ts`)
falls back to OCR when an uploaded CBR "copia autorizada" PDF is image-only (no
text layer) — the typical depto-306-with-hipoteca case.

## Toolchain (already in `apps/api` deps — no system `tesseract-ocr` needed)
- **`tesseract.js`** (`^7`): OCR engine as WASM, bundled in `node_modules`. It does
  **not** require the `tesseract-ocr` system package.
- **`canvas`** (`^3`): rasterizes PDF pages (via `pdfjs`) to images for OCR.
  `canvas@3` ships prebuilt binaries for common Linux/Node targets, so a normal
  `npm install` works on Render's native Node runtime.

## How it's wired (safe by construction)
- OCR is **lazy-loaded** (`await import(...)`) only when a scanned inscription is
  uploaded via `POST /api/assets/extract-inscripcion`. It never runs on startup,
  nor on cartola/CMF uploads.
- If OCR is unavailable or yields garbage, `extractInscripcionFromBuffer` returns
  `{ manualFallback: true, message }` — the asset form asks the user to enter the
  data manually. **It never 500s and never blocks the asset flow.**

## What to (re)deploy on Render
- Only the **`coda-api`** web service (`render.yaml`). The existing
  `buildCommand` (`npm install --include=dev && npm run build`) already installs
  `tesseract.js` + `canvas`. **No new env vars.**
- If a future `canvas` build ever fails for lack of native libs on the native
  runtime, either:
  1. switch `coda-api` to a Docker runtime and `apt-get install -y libcairo2-dev
     libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev`, or
  2. do nothing — OCR simply degrades to the manual-entry fallback above.
- `apps/web` (Vercel) only needs a redeploy for the new asset-form upload UI.
