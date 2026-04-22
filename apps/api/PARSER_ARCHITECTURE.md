# Arquitectura del Parser de Cartolas

## Flujo de parseo

```
Buffer (PDF)
    │
    ▼
extractPdfText (pdfjs-dist/legacy)
    │  falla → pdf-parse fallback
    ▼
text (string) + lines (PdfLine[])
    │
    ▼  si text.length < 40
ParseError('TEXT_EXTRACTION_FAILED')
    │
    ▼
detectFormat(text)
    → banco: string, confidence: 0–1, markers: string[]
    │
    ▼  si confidence < 0.85
ParseError('FORMAT_UNKNOWN')
    │
    ▼
parsers.registry.getParser(banco)
    │  no existe
    ▼  ParseError('FORMAT_UNSUPPORTED')
    │
    ▼
bankParser.runBankParser(buffer, { banco, banco_confidence, mode })
    │
    ├─ parseCartolaPdfBuffer(buffer) → CartolaParseResult  [motor existente]
    │     │  pdfjs column-based (Santander)
    │     │  section-based (BCI, Banco de Chile, Itaú, Scotiabank)
    │     │  keyword-inferred (BancoEstado)
    │
    ├─ annotateTransaction(tx, mode) → ParsedTransaction + TransactionConfidence
    │     date × 0.20 + amount × 0.30 + type × 0.30 + description × 0.20
    │
    ├─ computeReconciliation(saldo_inicial, saldo_final, cargos, abonos)
    │     → { passed, delta_pct, skipped }
    │
    ├─ computeOverallConfidence(transacciones) → parse_confidence
    │
    ├─ logParserAttempt(...)   [observabilidad pino]
    │
    ├─ si parse_confidence < 0.40  → ParseError('LOW_CONFIDENCE')
    └─ si delta_pct > 5.0%         → ParseError('BALANCE_MISMATCH')
    │
    ▼
ParseResult
    { banco, banco_confidence, titular, cuenta, periodo,
      saldo_inicial, saldo_final, total_cargos, total_abonos,
      transacciones: ParsedTransaction[],  ← incluye confidence por transacción
      saldos_diarios, reconciliation, parse_confidence, warnings }
```

## Archivos principales

| Archivo | Responsabilidad |
|---------|----------------|
| `src/parsers/base.ts` | Tipos compartidos: `ParseError`, `ParseResult`, `TransactionConfidence`, helpers |
| `src/parsers/detectFormat.ts` | Detección de banco + umbral de confianza |
| `src/parsers/bankParser.ts` | Motor compartido: anotación de confianza, conciliación, observabilidad |
| `src/parsers/parsers.registry.ts` | Registro `banco → parserFn` |
| `src/parsers/index.ts` | API pública: `parseCartolaBuffer(buffer)` |
| `src/parsers/{banco}.ts` | Parsers por banco (thin wrappers con modo de parseo) |
| `src/parsers/cartola-parser.ts` | Motor de extracción original (no modificado) |
| `src/services/documents/pdfAnalysis.ts` | Extracción de texto + coordenadas X (pdfjs) |

## Confidence scoring por modo

| Modo | `type` confidence | Cuándo se usa |
|------|------------------|---------------|
| `column_based` | 0.95 | Santander — coordenadas X detectan columna CARGO/ABONO |
| `section_based` | 0.88 | BCI, Banco de Chile, Itaú, Scotiabank — headers de sección |
| `keyword_inferred` | 0.75 | BancoEstado — glosa de la transacción inferida |

## Conciliación de saldos

```
expected_final = saldo_inicial + total_abonos − total_cargos
delta_pct = |expected_final − saldo_final| / max(|saldo_final|, 1) × 100
```

- `delta_pct ≤ 1%` → `passed: true`
- `1% < delta_pct ≤ 5%` → advertencia incluida en `warnings[]`
- `delta_pct > 5%` → `ParseError('BALANCE_MISMATCH')`
- Si `saldo_inicial = saldo_final = 0` → `skipped: true` (saldos desconocidos)

## Tests

```bash
cd apps/api
npm run test:run -- test/parsers/
```

Los tests usan fixtures de texto sintético (`test/fixtures/cartolas/*.txt`) que
imitan la salida de `pdf-parse` sobre cartolas reales. No requieren PDFs reales
ni carga de `pdfjs-dist`.
