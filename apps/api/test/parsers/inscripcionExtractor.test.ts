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
  parseUf,
} from '../../src/parsers/inscripcionExtractor.js';

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

    // Prefill: no lien, UF→CLP applied when a rate is given.
    const prefill = buildAssetPrefill(r, 39000);
    // eslint-disable-next-line no-console
    console.log(`[E102] prefill=${JSON.stringify(prefill)}`);
    expect(prefill.type).toBe('property');
    expect(prefill.hasLien).toBe(false);
    expect(prefill.lienAmountClp).toBeNull();
    expect(prefill.acquisitionCostClp).toBe(2975 * 39000);
    expect(prefill.fxPending).toBe(false);
    expect(prefill.name).toContain('MIRADOR DEL BIOBIO');

    // No FX rate → never throws, stays UF-native with fxPending.
    const noFx = buildAssetPrefill(r, null);
    expect(noFx.fxPending).toBe(true);
    expect(noFx.acquisitionCostClp).toBeNull();
    expect(noFx.source.compraventaUf).toBe(2975);
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

    const prefill = buildAssetPrefill(r, 39000);
    expect(prefill.hasLien).toBe(true);
    expect(prefill.acquisitionCostClp).toBe(Math.round(2559 * 39000));
    expect(prefill.lienAmountClp).toBe(Math.round(2236.82 * 39000));
    expect(prefill.source.hipotecaUf).toBe(2236.82);
  });
});
