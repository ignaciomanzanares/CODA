/**
 * Unit Tests for Document Validator
 * 
 * @author AI Assistant (Cursor)
 * @date 2026-03-06
 */

import { describe, it, expect } from 'vitest';
import { 
  validateDocument, 
  validateDocumentWithContent,
  validateDocumentType,
  VALIDATION_CONFIG 
} from '../documentValidator';

describe('Document Validator', () => {
  describe('File Size Validation', () => {
    it('should reject files smaller than 1KB', () => {
      const file = {
        originalname: 'tiny.pdf',
        mimetype: 'application/pdf',
        size: 500, // 500 bytes
        buffer: Buffer.alloc(500),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('demasiado pequeño');
    });
    
    it('should reject files larger than 10MB', () => {
      const file = {
        originalname: 'huge.pdf',
        mimetype: 'application/pdf',
        size: 15 * 1024 * 1024, // 15 MB
        buffer: Buffer.alloc(100),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('demasiado grande');
      expect(result.errors[0]).toContain('15');
    });
    
    it('should accept files within size limits', () => {
      const file = {
        originalname: 'valid.pdf',
        mimetype: 'application/pdf',
        size: 5 * 1024 * 1024, // 5 MB
        buffer: Buffer.from('%PDF-1.4\ntest content\n%%EOF'),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
  
  describe('Format Validation', () => {
    it('should reject invalid MIME types', () => {
      const file = {
        originalname: 'doc.docx',
        mimetype: 'application/vnd.openxmlformats',
        size: 1024 * 100,
        buffer: Buffer.alloc(100),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('no permitido');
    });
    
    it('should reject invalid extensions', () => {
      const file = {
        originalname: 'file.txt',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.alloc(100),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('.txt');
    });
    
    it('should accept PDF files', () => {
      const file = {
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.from('%PDF-1.4\ncontent\n%%EOF'),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(true);
    });
    
    it('should accept image files', () => {
      const validImages = [
        { name: 'doc.png', mime: 'image/png' },
        { name: 'doc.jpg', mime: 'image/jpeg' },
        { name: 'doc.webp', mime: 'image/webp' },
      ];
      
      for (const img of validImages) {
        const file = {
          originalname: img.name,
          mimetype: img.mime,
          size: 1024 * 100,
          buffer: Buffer.alloc(100),
        };
        
        const result = validateDocument(file);
        
        expect(result.valid).toBe(true);
      }
    });
  });
  
  describe('PDF Integrity Validation', () => {
    it('should detect invalid PDF magic number', () => {
      const file = {
        originalname: 'fake.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.from('Not a PDF\ncontent'),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('magic number');
    });
    
    it('should warn about missing EOF marker', () => {
      const file = {
        originalname: 'truncated.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.from('%PDF-1.4\ncontent without EOF'),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(true);
      expect(result.warnings[0]).toContain('truncado');
    });
    
    it('should detect concatenated PDFs', () => {
      const file = {
        originalname: 'double.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.from('%PDF-1.4\nfirst\n%%EOF\n%PDF-1.5\nsecond\n%%EOF'),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('múltiples documentos');
    });
  });
  
  describe('Content Validation', () => {
    it('should warn about short text content', async () => {
      const file = {
        originalname: 'scanned.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.from('%PDF-1.4\nshort\n%%EOF'),
      };
      
      const shortText = 'abc'; // Less than 100 chars
      
      const result = await validateDocumentWithContent(file, shortText);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('poco texto'))).toBe(true);
    });
    
    it('should warn about missing CMF/Cartola indicators', async () => {
      const file = {
        originalname: 'unknown.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.from('%PDF-1.4\nrandom content\n%%EOF'),
      };
      
      const text = [
        'This is just random text without recognizable financial document markers.',
        'It has enough extracted text to avoid the scanned-PDF short-text warning path.',
        'The validator should still warn that no expected document indicators were found.',
      ].join(' ');
      
      const result = await validateDocumentWithContent(file, text);
      
      expect(result.valid).toBe(true);
      expect(result.warnings!.some(w => w.includes('indicadores'))).toBe(true);
    });
  });
  
  describe('Document Type Validation', () => {
    it('should validate CMF documents have RUT', () => {
      const cmfDoc = {
        tipo: 'cmf_informe_deudas' as const,
        deudaTotalVigente: 0,
        deudaIndirecta: 0,
        numeroInstituciones: 0,
        // Missing: rutDocumento
      };
      
      const result = validateDocumentType(cmfDoc, 'cmf');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('RUT');
    });
    
    it('should validate Cartola has transactions', () => {
      const cartolaDoc = {
        tipo: 'cartola' as const,
        transacciones: [],
        saldoInicial: 1000,
        saldoFinal: 900,
      };
      
      const result = validateDocumentType(cartolaDoc, 'cartola');
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('transacciones');
    });
    
    it('should accept valid CMF document', () => {
      const cmfDoc = {
        tipo: 'cmf_informe_deudas' as const,
        deudaTotalVigente: 0,
        deudaIndirecta: 0,
        numeroInstituciones: 0,
        rutDocumento: '12.345.678-9',
      };
      
      const result = validateDocumentType(cmfDoc, 'cmf');
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
  
  describe('Security Checks', () => {
    it('should detect suspicious patterns', () => {
      const file = {
        originalname: 'malicious.pdf',
        mimetype: 'application/pdf',
        size: 1024 * 100,
        buffer: Buffer.from('%PDF-1.4\n<script>alert("xss")</script>\n%%EOF'),
      };
      
      const result = validateDocument(file);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('sospechoso');
    });
  });
});
