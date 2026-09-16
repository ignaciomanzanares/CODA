/**
 * RUTs SINTÉTICOS para tests, fixtures y seeds (D8 — "pruebas con RUTs de test").
 *
 * Usar SIEMPRE estos en vez de un RUT copiado de un documento real. El repo es PÚBLICO y todo
 * lo que se commitea queda en el historial para siempre: ya pasó con un informe CMF (nombre
 * completo + RUT) y con nombres de terceros sacados de cartolas reales.
 *
 * Son RUTs de dígito repetido (11.111.111-1, 22.222.222-2…): tienen dígito verificador VÁLIDO
 * —pasan cualquier validación del código— y son la convención de prueba en Chile.
 */
export const TEST_RUTS = {
  persona: "11.111.111-1",
  persona2: "22.222.222-2",
  persona3: "33.333.333-3",
  persona4: "44.444.444-4",
  /** RUT de empresa (≥ 50.000.000 = persona jurídica). */
  empresa: "76.000.000-0",
} as const;

/**
 * Cuerpos de RUT de persona (< 50.000.000) con dígito verificador válido que la guarda
 * `noPersonalRuts` acepta porque son sintéticos conocidos. Agregar uno acá exige estar seguro
 * de que NO es de una persona real — dejar el motivo en un comentario.
 */
export const ALLOWED_SYNTHETIC_PERSON_RUT_BODIES: ReadonlySet<string> = new Set([
  "11111111",
  "22222222",
  "33333333",
  "44444444",
  "12345678", // el ejemplo de manual (12.345.678-5)
  "00000000", // placeholder de "sin RUT"
]);

/** Dígito verificador módulo 11 de un cuerpo de RUT ("12345678" → "5"). */
export function rutCheckDigit(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
