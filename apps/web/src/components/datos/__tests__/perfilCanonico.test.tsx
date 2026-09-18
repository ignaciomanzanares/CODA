import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { PerfilCanonicoView, filasDelPerfil, type PerfilCanonicoData } from "../PerfilCanonico";

/** Forma real de GET /api/profile/canonical (copiada de una corrida local). */
const PERFIL: PerfilCanonicoData = {
  userId: "u1",
  identidad: {
    nombre: {
      value: "Camila Rivas",
      provenance: { source: "user_declared", asOf: null, confidence: 0.6 },
    },
  },
  renta: {
    mensualClp: {
      value: 1_250_000,
      provenance: { source: "reconciled", asOf: "2026-08-31T00:00:00.000Z", confidence: 0.8 },
    },
  },
  deuda: {
    totalClp: {
      value: 4_300_000,
      provenance: { source: "cmf", asOf: "2026-07-15T00:00:00.000Z", confidence: 0.9 },
    },
    moraActiva: {
      value: false,
      provenance: { source: "cmf", asOf: "2026-07-15T00:00:00.000Z", confidence: 0.9 },
    },
  },
  empleo: {
    cotizacionMeses: {
      value: 18,
      provenance: { source: "afp", asOf: "2026-06-30T00:00:00.000Z", confidence: 0.85 },
    },
  },
  sources: ["user_declared", "reconciled", "cmf", "afp"],
  assembledAt: "2026-09-18T20:00:00.000Z",
};

const texto = (perfil?: PerfilCanonicoData, isError = false) =>
  renderToString(<PerfilCanonicoView perfil={perfil} isError={isError} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("filasDelPerfil", () => {
  it("sólo lista lo que existe: un dominio vacío no inventa una fila", () => {
    expect(filasDelPerfil(PERFIL).map((f) => f.etiqueta)).toEqual([
      "Nombre",
      "Ingreso mensual",
      "Deuda total",
      "Deuda morosa",
      "Meses cotizados",
    ]);

    const soloNombre = { ...PERFIL, renta: {}, deuda: {}, empleo: {} };
    expect(filasDelPerfil(soloNombre).map((f) => f.etiqueta)).toEqual(["Nombre"]);
  });

  it("un booleano en false igual es un dato: 'Sin mora' no se omite", () => {
    const fila = filasDelPerfil(PERFIL).find((f) => f.etiqueta === "Deuda morosa");
    expect(fila?.valor).toBe("Sin mora");
  });
});

describe("Perfil canónico", () => {
  it("muestra cada dato con su fuente en castellano y la confianza en palabras", () => {
    const html = texto(PERFIL);
    expect(html).toContain("Informe CMF");
    expect(html).toContain("Cruce de varias fuentes");
    expect(html).toContain("Lo declaraste tú");
    expect(html).toContain("Confianza alta"); // CMF 0.9
    expect(html).toContain("Confianza media"); // reconciliado 0.8
    // Ni el código de la fuente ni el número crudo de confianza.
    expect(html).not.toContain("user_declared");
    expect(html).not.toContain("0.9");
  });

  it("sin datos lo dice, y un fallo de carga NO se disfraza de 'no tenemos datos'", () => {
    expect(texto({ ...PERFIL, identidad: {}, renta: {}, deuda: {}, empleo: {} })).toContain(
      "Todavía no tenemos datos tuyos",
    );

    const conError = texto(undefined, true);
    expect(conError).toContain("No pudimos cargar tu perfil ahora");
    expect(conError).not.toContain("Todavía no tenemos datos tuyos");
  });

  it("una fuente desconocida se muestra tal cual en vez de romper", () => {
    const html = texto({
      ...PERFIL,
      renta: {
        mensualClp: {
          value: 900_000,
          provenance: { source: "open_banking", asOf: null, confidence: 0.5 },
        },
      },
    });
    expect(html).toContain("open_banking");
    expect(html).toContain("Confianza baja");
  });
});
