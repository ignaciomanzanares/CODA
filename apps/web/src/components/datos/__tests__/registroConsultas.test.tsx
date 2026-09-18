import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { RegistroConsultasView } from "../RegistroConsultas";

/**
 * Smoke de render con la forma REAL que devuelve `GET /api/data-sources/access-log` (copiada de
 * una corrida local). No hay testing-library en el repo: esto renderiza a string, que alcanza
 * para lo que importa acá — que la traza se lea como algo que una persona entiende y que un
 * intento bloqueado NO se muestre como consulta hecha.
 */
const ENTRADAS = {
  entries: [
    {
      accessId: "73a96232-00a8-48a0-a354-14beb3f2cab8",
      resourceType: "sii_tax_data",
      connectorId: "sii-carpeta",
      trigger: "user",
      institution: null,
      jobId: null,
      outcome: "failed" as const,
      consentGrantId: 234,
      startedAt: "2026-09-18T14:38:13.195Z",
      finishedAt: "2026-09-18T14:38:13.199Z",
      durationMs: 4,
      errorCode: "pending_fetch",
    },
    {
      accessId: "fd5a39c8-1652-4422-97ae-4cc7f0424ec8",
      resourceType: "sii_tax_data",
      connectorId: "sii-carpeta",
      trigger: "user",
      institution: null,
      jobId: null,
      outcome: "denied" as const,
      consentGrantId: null,
      startedAt: "2026-09-18T14:33:10.000Z",
      finishedAt: "2026-09-18T14:33:10.000Z",
      durationMs: null,
      errorCode: null,
    },
    {
      accessId: "aa11bb22-0000-4444-8888-cccccccccccc",
      resourceType: "account_information",
      connectorId: "scraper:bancoestado",
      trigger: "user",
      institution: "bancoestado",
      jobId: null,
      outcome: "succeeded" as const,
      consentGrantId: 12,
      startedAt: "2026-09-18T12:00:00.000Z",
      finishedAt: "2026-09-18T12:00:02.500Z",
      durationMs: 2500,
      errorCode: null,
    },
  ],
};

function render(datos: { entries: typeof ENTRADAS.entries }, isError = false): string {
  const html = renderToString(<RegistroConsultasView entries={datos.entries} isError={isError} />);
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("Registro de consultas", () => {
  it("muestra cada consulta con la fuente en castellano y su desenlace", () => {
    const texto = render(ENTRADAS);

    expect(texto).toContain("Datos tributarios (SII)");
    expect(texto).toContain("Cuentas y movimientos");
    // El desenlace, no el código interno.
    expect(texto).toContain("Consultada");
    expect(texto).toContain("Bloqueada");
    expect(texto).toContain("No se pudo");
    expect(texto).not.toContain("succeeded");
    expect(texto).not.toContain("sii_tax_data");
  });

  it("un intento bloqueado dice que NO se consultó, y traduce el motivo de la falla", () => {
    const texto = render(ENTRADAS);
    expect(texto).toContain("Se intentó consultar sin tu permiso y no se hizo.");
    expect(texto).toContain("esa conexión todavía no está disponible");
    expect(texto).not.toContain("pending_fetch");
  });

  it("enlaza cada consulta con el permiso que la autorizó y cuánto tardó", () => {
    const texto = render(ENTRADAS);
    expect(texto).toContain("Permiso n.º 234");
    expect(texto).toContain("Tardó 4 ms");
    expect(texto).toContain("Tardó 2.5 s");
  });

  it("sin consultas todavía, lo dice en vez de mostrar una tabla vacía", () => {
    const texto = render({ entries: [] });
    expect(texto).toContain("Todavía no hemos consultado ninguna fuente con tus datos.");
  });

  it("si el registro no se pudo cargar, NO dice que no haya consultas", () => {
    const texto = render({ entries: [] }, true);
    expect(texto).toContain("No pudimos cargar tu registro ahora");
    expect(texto).not.toContain("Todavía no hemos consultado ninguna fuente");
  });

  it("un código de error nuevo se muestra tal cual en vez de romper", () => {
    const texto = render({
      entries: [{ ...ENTRADAS.entries[0], errorCode: "E_SII_503", consentGrantId: null }],
    });
    expect(texto).toContain("E_SII_503");
  });
});
