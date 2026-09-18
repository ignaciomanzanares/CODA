/**
 * El doble evaluador NO vuelve a depender de una variable de entorno en la API.
 *
 * Historia: `/api/risk/evaluation` respondía 404 en producción salvo que
 * RISK_DUAL_SCORE_ENABLED estuviera en "true". Esa variable vivía SÓLO en el panel de Render,
 * fuera del repo, así que se perdía al recrear el servicio — y la tarjeta de score desaparecía
 * del panel sin dejar rastro, indistinguible de tener el flag del front apagado. Encontrar eso
 * costó una sesión entera de depuración.
 *
 * Decisión de producto: el doble score se muestra siempre. El único interruptor que queda es
 * `VITE_ENABLE_RISK_DUAL_SCORE`, que vive versionado en apps/web/.env.production y por lo tanto
 * no se puede perder.
 *
 * No hay harness HTTP en este repo, así que la guarda es sobre el código fuente: alcanza para
 * impedir que el gate vuelva por descuido.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ruta = fileURLToPath(new URL("../../src/routes-scoring-risk.ts", import.meta.url));
const fuente = readFileSync(ruta, "utf8");

describe("GET /api/risk/evaluation — sin gate de entorno", () => {
  it("el archivo de rutas no referencia RISK_DUAL_SCORE_ENABLED", () => {
    expect(
      fuente.includes("RISK_DUAL_SCORE_ENABLED"),
      "Volvió el gate por variable de entorno: vive fuera del repo y su pérdida hace " +
        "desaparecer la tarjeta de score en producción. El interruptor es el flag del front.",
    ).toBe(false);
  });

  it("el handler del doble evaluador no responde 404 'No disponible'", () => {
    const inicio = fuente.indexOf('app.get("/api/risk/evaluation"');
    expect(inicio).toBeGreaterThan(-1);
    const handler = fuente.slice(inicio, inicio + 2500);
    expect(handler).not.toMatch(/status\(404\)[\s\S]{0,60}No disponible/);
  });
});
