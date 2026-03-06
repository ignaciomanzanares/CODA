# Document Services

## Overview

Robust document processing pipeline for CMF reports and bank statements (cartolas).

## Services

### `pdfAnalysis.ts`

Core PDF parsing logic for CMF and Cartola documents.

**Exports:**
- `analyzePdfBuffer()` - Extract and parse PDF content
- `parseCmfInformeDeudas()` - Parse CMF debt report
- `parseCartolaPdf()` - Parse bank statement
- `cartolaToSfaTransactions()` - Convert to SFA format

### `documentValidator.ts` ✨ NEW

Comprehensive document validation.

**Exports:**
- `validateDocument()` - Basic validation (size, format, integrity)
- `validateDocumentWithContent()` - Content-aware validation
- `validateDocumentType()` - Type-specific validation (CMF vs Cartola)

**Features:**
- ✅ File size limits (1KB - 10MB)
- ✅ MIME type validation
- ✅ PDF integrity checks (magic number, %%EOF)
- ✅ Security checks (malicious patterns)
- ✅ Content length validation
- ✅ Document type detection

### `ocrService.ts` ✨ NEW

OCR (Optical Character Recognition) for scanned documents.

**Exports:**
- `performOcrOnImage()` - OCR on image buffer
- `performOcrOnPdfPage()` - OCR on specific PDF page
- `performOcrOnFullPdf()` - OCR on entire PDF
- `smartOcr()` - Automatic OCR if text extraction fails
- `enhanceImageForOcr()` - Pre-processing for better OCR

**Features:**
- ✅ Tesseract.js with Spanish language support
- ✅ Confidence scoring
- ✅ Automatic fallback to OCR if text extraction fails
- ✅ Image enhancement (contrast, resolution)
- ✅ Multi-page PDF support

### `imageConverter.ts` ✨ NEW

Image to PDF conversion for unified processing.

**Exports:**
- `convertImageToPdf()` - Basic conversion
- `convertImageToPdfOptimized()` - Optimized with resizing
- `isImage()` - Check if MIME type is image
- `getOptimalDimensions()` - Calculate optimal PDF size

**Features:**
- ✅ PNG, JPG, WEBP → PDF
- ✅ Automatic resizing for large images
- ✅ White background for transparent PNGs
- ✅ High-quality image smoothing

### `enhancedDocumentUpload.ts` ✨ NEW

Enhanced upload pipeline with retry logic.

**Exports:**
- `processDocumentRobust()` - Multi-stage processing pipeline
- `processDocumentWithRetry()` - Automatic retries with backoff
- `getErrorMessage()` - User-friendly error messages
- `isRetryableError()` - Determine if error should retry

**Pipeline:**
1. Validation (size, format, integrity)
2. Text extraction (native PDF parsing)
3. OCR (if text extraction fails)
4. Document type detection (CMF vs Cartola)
5. Score calculation

**Features:**
- ✅ Retry logic (up to 3 attempts)
- ✅ Exponential backoff (2s, 4s, 8s)
- ✅ Skip retry for validation errors
- ✅ Clear error messages for users

### `documentUploadService.ts`

Orchestrates document processing and score updates.

**Exports:**
- `processDocumentUpload()` - Main entry point

**Flow:**
1. Parse PDF with `analyzePdfBuffer()`
2. Validate document type
3. Compute scores (CMF → credit, Cartola → transactional)
4. Update database
5. Return result

## Middleware

### `uploadMiddleware.ts` ✨ NEW

Enhanced Multer configuration.

**Exports:**
- `documentUpload` - Configured Multer instance
- `handleMulterError()` - User-friendly error messages
- `requireFile()` - Middleware to ensure file exists

**Features:**
- ✅ Memory storage (for processing)
- ✅ 10MB size limit
- ✅ MIME type filtering (PDF, PNG, JPG, WEBP)
- ✅ Extension validation
- ✅ Clear error messages

## Usage

### Basic Upload

```typescript
import { documentUpload } from './middleware/uploadMiddleware.js';
import { processDocumentUpload } from './services/documents/index.js';

app.post('/api/documents/upload', 
  authenticate,
  documentUpload.single('document'),
  async (req, res) => {
    const result = await processDocumentUpload(userId, req.file.buffer);
    res.json(result);
  }
);
```

### Enhanced Upload with Validation

```typescript
import { validateDocument } from './services/documents/documentValidator.js';
import { processDocumentWithRetry } from './services/documents/enhancedDocumentUpload.js';

const validation = validateDocument(req.file);
if (!validation.valid) {
  return res.status(400).json({ errors: validation.errors });
}

const result = await processDocumentWithRetry(req.file, {
  enableOcr: true,
  maxRetries: 3
});
```

### OCR for Scanned PDFs

```typescript
import { performOcrOnPdfPage } from './services/documents/ocrService.js';

const ocrResult = await performOcrOnPdfPage(pdfBuffer, 1);
console.log(`OCR confidence: ${ocrResult.confidence}`);
console.log(`Extracted text: ${ocrResult.text}`);
```

## Error Handling

### User-Facing Errors

All errors return structured JSON:

```json
{
  "message": "Archivo demasiado grande. Máximo permitido: 10 MB.",
  "errors": ["..."],
  "warnings": ["..."],
  "step": "validation"
}
```

### Error Steps

- `validation` - File size, format, integrity
- `extraction` - PDF text extraction
- `ocr` - OCR processing (if used)
- `parsing` - CMF/Cartola parsing
- `scoring` - Score calculation
- `database` - DB persistence

## Testing

```bash
# Unit tests
npm test -- documentValidator.test.ts
npm test -- ocrService.test.ts

# Integration tests
npm test -- integration/documentUpload.test.ts
```

## Dependencies

- `multer` - File upload handling
- `pdfjs-dist` - PDF text extraction
- `tesseract.js` - OCR
- `canvas` - Image manipulation & PDF generation

## Configuration

Environment variables:

```bash
# Maximum upload size (bytes)
MAX_FILE_SIZE=10485760

# Enable OCR for scanned documents
ENABLE_OCR=true

# OCR language
OCR_LANGUAGE=spa

# Max PDF pages to process
MAX_PDF_PAGES=50
```

## TODO

- [ ] Implement full OCR integration in main pipeline
- [ ] Add image preprocessing (deskew, denoise)
- [ ] Support for multiple file uploads
- [ ] Progress tracking (websockets)
- [ ] Cloud storage (S3) for uploaded documents
- [ ] Virus scanning (ClamAV integration)
- [ ] Document expiration (GDPR compliance)
