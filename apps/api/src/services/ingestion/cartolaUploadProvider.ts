/**
 * Adapta la salida de OCR+parser de una cartola (`CartolaExtraida`) a la interfaz `OBProvider`,
 * para ingestarla por el mismo punto único que cualquier proveedor de open banking (#18).
 *
 * Una cartola = el extracto de una cuenta. Las transacciones obtienen un `externalId`
 * determinístico (hash de fecha+descripción+montos+índice) para que re-subir la misma cartola
 * no duplique filas (la ingesta deduplica por `externalId`).
 */
import { createHash } from "node:crypto";
import type {
  OBProvider,
  OBAccount,
  OBBalance,
  OBTransaction,
} from "../../connectors/openbanking/mockProvider.js";
import type { CartolaExtraida } from "../documents/pdfAnalysis.js";

/** Parsea fechas chilenas comunes (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM). */
export function parseChileanDate(s: string | undefined): Date | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  m = t.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/); // DD/MM[/YYYY]
  if (m) {
    const day = +m[1];
    const month = +m[2];
    let year = m[3] ? +m[3] : new Date().getUTCFullYear();
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month - 1, day));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

export class CartolaUploadProvider implements OBProvider {
  private readonly providerAccountId: string;

  constructor(
    private readonly banco: string | null,
    private readonly cartolas: CartolaExtraida[],
  ) {
    const slug = (banco || "desconocido")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    this.providerAccountId = `cartola:${slug}`;
  }

  async listAccounts(_userId: string): Promise<OBAccount[]> {
    return [
      {
        providerAccountId: this.providerAccountId,
        name: this.banco || "Cartola",
        type: "checking",
        currency: "CLP",
      },
    ];
  }

  async getBalance(_providerAccountId: string): Promise<OBBalance> {
    // Último saldo conocido entre las cartolas (la más reciente con saldo).
    let current = 0;
    for (const c of this.cartolas) {
      if (c.saldoFinal != null) current = c.saldoFinal;
      else if (c.saldoInicial != null) current = c.saldoInicial;
    }
    return { current, currency: "CLP", asOf: new Date() };
  }

  async listTransactions(
    _providerAccountId: string,
    _from: Date,
    _to: Date,
  ): Promise<OBTransaction[]> {
    const out: OBTransaction[] = [];
    for (const cartola of this.cartolas) {
      cartola.transacciones.forEach((t, i) => {
        const postedAt = parseChileanDate(t.fecha) ?? new Date();
        const amount = t.abono > 0 ? t.abono : -t.cargo;
        const externalId = createHash("sha1")
          .update(
            `${this.providerAccountId}|${t.fecha}|${t.descripcion}|${t.cargo}|${t.abono}|${i}`,
          )
          .digest("hex");
        out.push({
          externalId,
          postedAt,
          description: t.descripcion,
          amount,
          currency: "CLP",
          category: t.categoria,
          pending: false,
          raw: t,
        });
      });
    }
    return out;
  }
}
