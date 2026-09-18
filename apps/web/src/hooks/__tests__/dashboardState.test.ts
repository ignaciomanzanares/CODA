import { describe, it, expect } from "vitest";
import { resolveDashboardState } from "../useDashboardData";

/**
 * El bug que esto evita: con la API caída, `documentCount` llega en 0 por falta de respuesta y el
 * panel mostraba "Sube tu primer documento" a un usuario que sí tiene documentos. Vacío y
 * "no pudimos cargar" son estados distintos, y el error se decide ANTES del conteo.
 */
const base = { enabled: true, isLoading: false, error: null, docCount: 3 };

describe("resolveDashboardState", () => {
  it("con datos, listo", () => {
    expect(resolveDashboardState(base)).toBe("ready");
  });

  it("mientras carga o sin sesión, cargando", () => {
    expect(resolveDashboardState({ ...base, isLoading: true })).toBe("loading");
    expect(resolveDashboardState({ ...base, enabled: false })).toBe("loading");
  });

  it("sin documentos, vacío", () => {
    expect(resolveDashboardState({ ...base, docCount: 0 })).toBe("empty");
  });

  it("API caída NO es vacío, aunque el conteo llegue en 0", () => {
    const err = new Error("Failed to fetch");
    expect(resolveDashboardState({ ...base, error: err, docCount: 0 })).toBe("error");
    // Y tampoco pisa los datos que ya había.
    expect(resolveDashboardState({ ...base, error: err })).toBe("error");
  });

  it("cargando gana al error: un reintento en curso no muestra el cartel de error", () => {
    expect(resolveDashboardState({ ...base, isLoading: true, error: new Error("x") })).toBe(
      "loading",
    );
  });
});
