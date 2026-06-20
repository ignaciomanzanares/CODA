/**
 * Tests for the CBR inscription extractor → asset-form prefill.
 *
 * Verified against the REDACTED depto-E102 Dominio fixture (real text layer,
 * PII scrubbed; raw PDF never committed — feedback_no_real_pii_fixtures):
 *   Dominio Fs 3675 Nº 3171-2024 · compraventa 2.975 UF · rol 681-231 · NO hipoteca.
 *
 * The depto-306 bundle (Fs 3748 Nº3244-2024, compraventa 2.559 UF, hipoteca
 * Coopeuch 2.236,82 UF) is an image-only scan with no text layer and no OCR
 * engine in this environment, so its hipoteca case can't be machine-verified here.
 * The hipoteca-present and UF-rounding logic is unit-tested below with synthetic
 * CBR-shaped snippets so the code path is covered for when 306 becomes readable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  extractInscripcion,
  buildAssetPrefill,
  resolveInscripcionPrefill,
  extractInscripcionFromBuffer,
  MANUAL_FALLBACK_MSG,
  parseUf,
  parseSpanishCardinal,
} from '../../src/parsers/inscripcionExtractor.js';

// UF aprox. a la fecha de escritura (junio 2024) y de hoy (2026). El costo debe
// usar la de escritura (~37k → ~110M), NO la de hoy (~39k → 116M).
const UF_ESCRITURA_2024 = 37_116;
const UF_HOY = 39_000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const fxFile = join(__dirname, '../fixtures/inscripciones/inscripcion-dominio-e102.txt');

describe('parseUf', () => {
  it('preserves comma decimals, treats dot as thousands', () => {
    expect(parseUf('2.975')).toBe(2975);
    expect(parseUf('2.236,82')).toBe(2236.82);
    expect(parseUf('2.559')).toBe(2559);
  });
});

describe('CBR inscription extractor — depto E102 (Dominio only)', () => {
  const present = existsSync(fxFile);
  (present ? it : it.skip)('extracts Dominio + compraventa and returns mortgage=null', () => {
    const r = extractInscripcion(readFileSync(fxFile, 'utf8'));

    // eslint-disable-next-line no-console
    console.log(
      `[E102] dominio=${r.dominio.referencia} compraventaUf=${r.compraventaUf} rol=${r.rolAvaluo} ` +
        `comuna=${r.comuna} hipoteca=${r.hipoteca ? 'present' : 'null'} docs=${JSON.stringify(r.documentos)}`,
    );

    expect(r.dominio).toMatchObject({ fojas: 3675, numero: 3171, anio: 2024 });
    expect(r.dominio.referencia).toBe('Fs 3675 Nº 3171-2024');
    expect(r.compraventaUf).toBe(2975);
    expect(r.rolAvaluo).toBe('681-231');
    expect(r.comuna.toUpperCase()).toContain('CONCEPCI');
    expect(r.condominio).toContain('MIRADOR DEL BIOBIO');

    // Acceptance: a Dominio-only bundle must return mortgage=null, NOT error,
    // and must NOT false-positive on the marginal "HIPOTECA." annotation.
    expect(r.documentos.hipoteca).toBe(false);
    expect(r.hipoteca).toBeNull();
    expect(r.warnings).not.toContain('Documento de Hipoteca presente pero no se pudo leer el monto UF.');

    // Prefill: no lien; COST uses the escritura-date UF (~37k → ~110M, NOT 116M).
    const prefill = buildAssetPrefill(r, UF_ESCRITURA_2024, UF_HOY);
    // eslint-disable-next-line no-console
    console.log(`[E102] prefill=${JSON.stringify(prefill)}`);
    expect(prefill.type).toBe('property');
    expect(prefill.hasLien).toBe(false);
    expect(prefill.lienAmountClp).toBeNull();
    expect(prefill.acquisitionCostClp).toBe(2975 * UF_ESCRITURA_2024);
    expect(prefill.acquisitionCostClp!).toBeGreaterThanOrEqual(110_000_000);
    expect(prefill.acquisitionCostClp!).toBeLessThan(111_000_000);
    expect(prefill.acquisitionCostClp).not.toBe(2975 * UF_HOY); // not today's UF
    // estimatedValue (optional) uses today's UF.
    expect(prefill.estimatedValueClp).toBe(2975 * UF_HOY);
    expect(prefill.fxPending).toBe(false);
    expect(prefill.name).toContain('MIRADOR DEL BIOBIO');

    // No escritura rate → never throws, stays UF-native with fxPending.
    const noFx = buildAssetPrefill(r, null);
    expect(noFx.fxPending).toBe(true);
    expect(noFx.acquisitionCostClp).toBeNull();
    expect(noFx.source.compraventaUf).toBe(2975);
  });

  (present ? it : it.skip)('resolveInscripcionPrefill fetches UF at the escritura (Dominio) date', async () => {
    const r = extractInscripcion(readFileSync(fxFile, 'utf8'));
    const calls: string[] = [];
    const getUf = async (d: Date): Promise<number | null> => {
      const iso = d.toISOString().slice(0, 10);
      calls.push(iso);
      return iso.startsWith('2024') ? UF_ESCRITURA_2024 : UF_HOY; // escritura vs hoy
    };
    const prefill = await resolveInscripcionPrefill(r, getUf);
    // eslint-disable-next-line no-console
    console.log(`[E102] resolved acquisitionCostClp=${prefill.acquisitionCostClp} (escrituraDate=${prefill.source.escrituraDate})`);

    // getUf was called with the parsed Dominio date (05/06/2024), not just today.
    expect(calls).toContain('2024-06-05');
    expect(prefill.source.escrituraDate).toBe('2024-06-05');
    expect(prefill.source.escrituraUfRate).toBe(UF_ESCRITURA_2024);
    // Cost from escritura-date UF (~110M); estimated from today's UF.
    expect(prefill.acquisitionCostClp).toBe(2975 * UF_ESCRITURA_2024);
    expect(prefill.estimatedValueClp).toBe(2975 * UF_HOY);
  });
});

describe('CBR inscription extractor — hipoteca path (synthetic CBR-shaped snippet)', () => {
  // Mirrors the depto-306 wording we cannot read from the image-only scan.
  const snippet = `
    Registro de Propiedad Fs 3748 Nro 3244-2024.-
    vendió a don COMPRADOR REDACTED, chileno, soltero, cédula de identidad 00.000.000-0,
    la UNIDAD ciento (100) que corresponde al DEPARTAMENTO tres cero seis (306) del
    Condominio EJEMPLO, ubicado en la comuna de CONCEPCIÓN. El precio de la compraventa
    fue de dos mil quinientas cincuenta y nueve (2.559) unidades de fomento. La propiedad
    rol de avalúo número 681-307, no registra deuda.
    Registro de Hipotecas Fs 3749 Nro 3245-2024.-
    constituyó hipoteca a favor de COOPEUCH, por la suma de dos mil doscientas treinta y
    seis coma ochenta y dos (2.236,82) unidades de fomento.
  `;

  it('extracts compraventa + hipoteca and maps tiene_garantia=true', () => {
    const r = extractInscripcion(snippet);
    expect(r.dominio.referencia).toBe('Fs 3748 Nº 3244-2024');
    expect(r.compraventaUf).toBe(2559);
    expect(r.rolAvaluo).toBe('681-307');
    expect(r.documentos.hipoteca).toBe(true);
    expect(r.hipoteca?.acreedor).toBe('COOPEUCH');
    expect(r.hipoteca?.montoUf).toBe(2236.82);

    const prefill = buildAssetPrefill(r, UF_ESCRITURA_2024);
    expect(prefill.hasLien).toBe(true);
    expect(prefill.acquisitionCostClp).toBe(Math.round(2559 * UF_ESCRITURA_2024));
    expect(prefill.lienAmountClp).toBe(Math.round(2236.82 * UF_ESCRITURA_2024));
    expect(prefill.source.hipotecaUf).toBe(2236.82);
  });
});

describe('parseSpanishCardinal (rescate de montos deletreados por OCR)', () => {
  it('parsea cardinales en palabras', () => {
    expect(parseSpanishCardinal('DOS MIL QUINIENTAS CINCUENTA Y NUEVE')).toBe(2559);
    expect(parseSpanishCardinal('dos mil')).toBe(2000);
    expect(parseSpanishCardinal('ciento veinte')).toBe(120);
    expect(parseSpanishCardinal('de dos mil quinientas cincuenta y nueve unidades')).toBe(2559); // ignora relleno
  });
  it('devuelve null si no es un número en palabras', () => {
    expect(parseSpanishCardinal('zzz qqq basura')).toBeNull();
    expect(parseSpanishCardinal('')).toBeNull();
    expect(parseSpanishCardinal(null)).toBeNull();
  });
});

describe('compraventa deletreada cuando el OCR mutila los dígitos', () => {
  it('rescata la compraventa desde la forma en palabras anclada a "precio"', () => {
    const snippet = 'En el precio de DOS MIL QUINIENTAS CINCUENTA Y NUEVE Unidades de Fomento, pagado al contado.';
    const r = extractInscripcion(snippet);
    expect(r.compraventaUf).toBe(2559);
  });
});

// ACEPTACIÓN — texto OCR REAL del escaneo del depto-306 (fixture redactada con los
// strings A–D verbatim del enunciado: el monto, la palabra HIPOTECA y el acreedor
// quedan REPARTIDOS, no en una línea ideal). Prueba la estructura real, no snippets.
describe('depto-306 — texto OCR real (estructura repartida; campos + prefill sin throw)', () => {
  const ocr306File = join(__dirname, '../fixtures/inscripciones/inscripcion-306-ocr.txt');
  const OCR_306 = existsSync(ocr306File) ? readFileSync(ocr306File, 'utf8') : '';
  const UF_ESCRITURA = 38_000;

  (OCR_306 ? it : it.skip)('extrae hipoteca/lender/registro/rol/dominio y arma el prefill (compraventa null tolerada)', () => {
    const r = extractInscripcion(OCR_306);

    expect(r.hipoteca?.montoUf).toBeCloseTo(2236.82, 2);
    expect(r.hipoteca?.acreedor).toContain('COOPEUCH');
    // Inscripción de la hipoteca (línea de gravámenes) — NO la del dominio.
    expect(r.hipoteca?.fojas).toBe(2894);
    expect(r.hipoteca?.numero).toBe(2352);
    expect(r.hipoteca?.anio).toBe(2024);
    expect(r.rolAvaluo).toBe('681-307');
    expect(r.dominio).toMatchObject({ fojas: 3748, numero: 3244, anio: 2024 });
    expect(r.dominio.referencia).toBe('Fs 3748 Nº 3244-2024');
    // El dominio NO se confunde con el fojas/número de la HIPOTECA (2894/2352).
    expect(r.dominio.fojas).not.toBe(2894);
    // El acreedor real (gravámenes), NO el anafórico "dicha institución" de la escritura.
    expect(r.hipoteca?.acreedor.toLowerCase()).not.toContain('dicha instituc');
    // Compraventa ausente en el escaneo → 0/null (no debe botar toda la extracción).
    expect(r.compraventaUf).toBe(0);

    // El prefill se arma igual: hasLien=true + lien calculado, acquisitionCost null.
    const prefill = buildAssetPrefill(r, UF_ESCRITURA);
    // eslint-disable-next-line no-console
    console.log(`[306-OCR] prefill=${JSON.stringify(prefill)}`);
    expect(prefill.hasLien).toBe(true);
    expect(prefill.lienAmountClp).toBe(Math.round(2236.82 * UF_ESCRITURA));
    expect(prefill.acquisitionCostClp).toBeNull(); // compraventa ilegible
    expect(prefill.estimatedValueClp).toBeNull();
    expect(prefill.source.hipotecaUf).toBeCloseTo(2236.82, 2);
  });

  (OCR_306 ? it : it.skip)('extractInscripcionFromBuffer devuelve un resultado parcial usable (no manualFallback)', async () => {
    const out = await extractInscripcionFromBuffer(Buffer.from('%PDF'), {
      extractText: async () => '',     // escaneo: sin capa de texto
      ocr: async () => OCR_306,        // OCR recupera el texto
    });
    expect(out.ok).toBe(true);
    expect(out.usedOcr).toBe(true);
    expect(out.result?.hipoteca?.acreedor).toContain('COOPEUCH');
  });
});

describe('buildAssetPrefill — null-safe, nunca lanza (fix "referencia")', () => {
  it('no lanza con un result hueco/parcial (dominio undefined)', () => {
    // Antes esto crasheaba: "Cannot read properties of undefined (reading 'referencia')".
    expect(() => buildAssetPrefill({} as any, 38_000)).not.toThrow();
    const p = buildAssetPrefill({ hipoteca: { acreedor: 'COOPEUCH', montoUf: 100 } } as any, 38_000);
    expect(p.hasLien).toBe(true);
    expect(p.lienAmountClp).toBe(Math.round(100 * 38_000));
    expect(p.acquisitionCostClp).toBeNull();
    expect(p.source.dominio).toBe('');
  });
});

describe('extractInscripcionFromBuffer — OCR fallback (injected deps, no real OCR)', () => {
  const e102Text = existsSync(fxFile) ? readFileSync(fxFile, 'utf8') : '';
  const buf = Buffer.from('%PDF-fake');

  (e102Text ? it : it.skip)('uses the text layer when present (no OCR)', async () => {
    const out = await extractInscripcionFromBuffer(buf, {
      extractText: async () => e102Text,
      ocr: async () => { throw new Error('OCR should not run'); },
    });
    expect(out.ok).toBe(true);
    expect(out.usedOcr).toBe(false);
    expect(out.result?.compraventaUf).toBe(2975);
  });

  (e102Text ? it : it.skip)('falls back to OCR when the text layer is empty (scanned bundle)', async () => {
    const out = await extractInscripcionFromBuffer(buf, {
      extractText: async () => '',          // image-only PDF, no text layer
      ocr: async () => e102Text,            // OCR recovers the text
    });
    expect(out.ok).toBe(true);
    expect(out.usedOcr).toBe(true);
    expect(out.result?.dominio.referencia).toBe('Fs 3675 Nº 3171-2024');
  });

  it('graceful manual fallback when OCR is unavailable (never a 500)', async () => {
    const out = await extractInscripcionFromBuffer(buf, {
      extractText: async () => '',
      ocr: async () => { throw new Error('tesseract not installed'); },
    });
    expect(out.ok).toBe(false);
    expect(out.manualFallback).toBe(true);
    expect(out.message).toBe(MANUAL_FALLBACK_MSG);
  });

  it('graceful manual fallback when OCR yields garbage', async () => {
    const out = await extractInscripcionFromBuffer(buf, {
      extractText: async () => '',
      ocr: async () => 'zzz qqq garbage with no inscription fields whatsoever '.repeat(10),
    });
    expect(out.ok).toBe(false);
    expect(out.manualFallback).toBe(true);
  });
});
