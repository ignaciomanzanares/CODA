# Formatos de Cartola Soportados

## Bancos compatibles

| Banco | Modo de parseo | Confianza típica | Notas |
|-------|---------------|-----------------|-------|
| **Santander** | Columnar (X-coord) | 0.90–0.98 | Layout en columnas CARGO \| ABONO \| SALDO detectado por coordenadas PDF |
| **BCI** | Por secciones | 0.85–0.92 | Secciones "Cheques y Cargos del Período" / "Depósitos y Abonos del Período" |
| **Banco de Chile** | Por secciones | 0.85–0.92 | Incluye Banco Edwards y Citi Chile. Secciones "Cargos" / "Abonos" |
| **BancoEstado** | Keyword | 0.80–0.88 | Lista cronológica mixta (sin secciones). Incluye CuentaRUT |
| **Itaú** | Por secciones | 0.85–0.90 | Columnas Débito/Crédito detectadas como secciones |
| **Scotiabank** | Por secciones | 0.85–0.90 | Secciones "Cargos del Período" / "Abonos del Período" |

## Tipos de documento soportados

| Documento | Ruta | Descripción |
|-----------|------|-------------|
| Cartola bancaria | `POST /api/documents/parse-cartola` | Estado de cuenta mensual en PDF |
| Informe de Deudas CMF | `POST /api/documents/parse-cmf` | Certificado CMF de deudas directas e indirectas |

## Requisitos del PDF

- **Formato**: PDF digital (no imagen escaneada). El texto debe ser extraíble con `pdfjs-dist` o `pdf-parse`.
- **Tamaño**: máximo 10 MB.
- **Período**: cualquier período. El parser infiere el año si no aparece completo.
- **Idioma**: español (glosas en español chileno).

## Códigos de error

| Código | HTTP | Descripción | Acción recomendada |
|--------|------|-------------|-------------------|
| `FORMAT_UNKNOWN` | 400 | Banco no detectado con confianza ≥ 0.85 | Descargar cartola del portal web del banco (PDF digital) |
| `FORMAT_UNSUPPORTED` | 400 | Banco detectado pero sin parser implementado | Contactar soporte |
| `TEXT_EXTRACTION_FAILED` | 422 | PDF sin texto extraíble (imagen escaneada) | Descargar cartola directamente del banco, no escanear |
| `NO_TRANSACTIONS` | 400 | Parser leyó el PDF pero encontró 0 transacciones | Verificar que el período tenga movimientos; usar portal web del banco |
| `BALANCE_MISMATCH` | 400 | Delta de conciliación > 5% | Cartola puede estar incompleta — descargar PDF completo |
| `LOW_CONFIDENCE` | 400 | Confianza global < 40% | Formato no compatible — descargar cartola del portal web |

## Agregar un banco nuevo

1. Añadir los patrones en `src/parsers/detectFormat.ts` → `BANK_PATTERNS`.
2. Crear `src/parsers/<banco>.ts` con `BANCO` y `parse(buffer, banco_confidence)`.
3. Registrar en `src/parsers/parsers.registry.ts` → `REGISTRY`.
4. Añadir fixture en `test/fixtures/cartolas/<banco>.txt`.
5. Añadir test en `test/parsers/detectFormat.test.ts`.
6. Actualizar esta tabla.
