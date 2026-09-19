import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UploadDrawerProvider } from "@/contexts/UploadDrawerContext";
import { VinculacionBancaria } from "../VinculacionBancaria";

/**
 * Hoy el catálogo no trae NINGÚN banco disponible, así que ese camino no lo ejercita nadie: el
 * día que el primer adaptador funcione, la fila "disponible" se estrena en producción. Esto la
 * prueba antes, incluida la regla de que el botón "Vincular" sólo existe si hay a quién llamar.
 */
const CATALOGO = {
  instituciones: [
    {
      bankId: "bancoestado",
      bankName: "BancoEstado",
      estado: "disponible" as const,
      mensaje: "Cuenta RUT y cuenta corriente.",
    },
    {
      bankId: "santander",
      bankName: "Santander",
      estado: "pendiente" as const,
      mensaje: "Todavía no está conectado.",
    },
  ],
};

function render(catalogo: typeof CATALOGO, onVincular?: (bankId: string) => void): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["/api/bank-connections/instituciones"], catalogo);
  return renderToString(
    <QueryClientProvider client={qc}>
      <UploadDrawerProvider>
        <VinculacionBancaria onVincular={onVincular} />
      </UploadDrawerProvider>
    </QueryClientProvider>,
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("Vinculación bancaria", () => {
  it("un banco disponible se muestra como tal, y el pendiente NO promete fecha", () => {
    const html = render(CATALOGO);
    expect(html).toContain("BancoEstado");
    expect(html).toContain("Disponible");
    expect(html).toContain("Santander");
    expect(html).toContain("No disponible");
    expect(html).not.toContain("Próximamente");
  });

  it("sin callback no se dibuja 'Vincular': un botón que no hace nada es peor que ninguno", () => {
    expect(render(CATALOGO)).not.toContain("Vincular");
  });

  it("con callback, el botón aparece sólo en el banco disponible", () => {
    const html = render(CATALOGO, () => {});
    expect(html).toContain("Vincular");
    // Un solo botón: el pendiente no lo tiene.
    expect(html.match(/Vincular/g)).toHaveLength(1);
  });

  it("con todos pendientes, explica que ninguno está listo y ofrece la cartola", () => {
    const html = render({
      instituciones: CATALOGO.instituciones.map((i) => ({ ...i, estado: "pendiente" as const })),
    });
    expect(html).toContain("Todavía no tenemos ningún banco conectado");
    expect(html).toContain("Subir mi cartola");
    expect(html).not.toContain("Disponible");
  });
});
