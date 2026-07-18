/**
 * Generador de cartolas PDF POSICIONALES sintéticas para tests multi-banco.
 *
 * A diferencia de los fixtures .txt (texto plano), estos PDFs ejercitan el
 * pipeline REAL: extracción pdfjs con coordenadas → detectFormat → motor
 * columnar/keyword de parseCartolaPdf → conciliación. Cada texto se dibuja
 * como item independiente en su X de columna (así los ve pdfjs).
 * Datos 100% sintéticos (mismos ficticios de los fixtures Santander).
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

export interface FixtureTx {
  fecha: string; // dd/mm
  glosa: string;
  cargo?: number;
  abono?: number;
}

export interface BankFixture {
  headerLines: string[]; // anclas de detección del banco (una por línea)
  periodo: { desde: string; hasta: string }; // dd/mm/yyyy
  saldoInicial: number;
  txs: FixtureTx[];
}

const fmtCLP = (n: number) => n.toLocaleString("es-CL"); // 1.234.567

/** Construye el PDF de una cartola de cuenta (layout columnar CARGO/ABONO/SALDO). */
export async function buildBankPdf(f: BankFixture): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  let y = 760;
  const draw = (text: string, x: number, size = 9) => {
    page.drawText(text, { x, y, size, font });
  };
  const newline = (dy = 16) => {
    y -= dy;
  };

  // Encabezado del banco (anclas de detectFormat) + identificación sintética.
  for (const line of f.headerLines) {
    draw(line, 40, 11);
    newline(18);
  }
  draw("CLIENTE: CASTELLANO QUINTERO BASTIAN", 40);
  newline();
  draw("RUT: 13.513.809-K", 40);
  newline();
  draw(`PERIODO: DESDE ${f.periodo.desde} HASTA ${f.periodo.hasta}`, 40);
  newline(24);

  // Fila de encabezados de columna — items SEPARADOS, como los emite el banco:
  // el motor detecta el centro de columna por la X de "CARGOS"/"ABONOS"/"SALDO".
  const CARGO_X = 330;
  const ABONO_X = 420;
  const SALDO_X = 510;
  draw("FECHA", 40);
  draw("DESCRIPCION", 100);
  draw("CHEQUES Y", CARGO_X - 22);
  draw("CARGOS", CARGO_X);
  draw("DEPOSITOS Y", ABONO_X - 28);
  draw("ABONOS", ABONO_X);
  draw("SALDO", SALDO_X);
  newline(20);

  // Movimientos: monto alineado cerca del centro de su columna; saldo corrido.
  let saldo = f.saldoInicial;
  for (const tx of f.txs) {
    saldo += (tx.abono ?? 0) - (tx.cargo ?? 0);
    draw(tx.fecha, 40);
    draw(tx.glosa, 100);
    if (tx.cargo) draw(fmtCLP(tx.cargo), CARGO_X);
    if (tx.abono) draw(fmtCLP(tx.abono), ABONO_X);
    draw(fmtCLP(saldo), SALDO_X);
    newline();
  }

  newline(10);
  const totalCargos = f.txs.reduce((s, t) => s + (t.cargo ?? 0), 0);
  const totalAbonos = f.txs.reduce((s, t) => s + (t.abono ?? 0), 0);
  draw(`SALDO INICIAL: ${fmtCLP(f.saldoInicial)}`, 40);
  newline();
  draw(`TOTAL CARGOS: ${fmtCLP(totalCargos)}`, 40);
  newline();
  draw(`TOTAL ABONOS: ${fmtCLP(totalAbonos)}`, 40);
  newline();
  draw(`SALDO FINAL: ${fmtCLP(saldo)}`, 40);

  return Buffer.from(await pdf.save());
}

/** Transacciones estándar del fixture (mismas para todos los bancos). */
export const STANDARD_TXS: FixtureTx[] = [
  { fecha: "05/01", glosa: "Compra Debito LIDER", cargo: 10_500 },
  { fecha: "07/01", glosa: "Deposito Efectivo", abono: 100_000 },
  { fecha: "09/01", glosa: "Compra Nacional JUMBO", cargo: 25_990 },
  { fecha: "12/01", glosa: "Transf de FERNANDO ANDRES", abono: 50_000 },
  { fecha: "15/01", glosa: "Retiro Cajero Automatico", cargo: 50_000 },
  { fecha: "18/01", glosa: "Compra Debito COPEC", cargo: 15_000 },
  { fecha: "22/01", glosa: "Pago Recibido NETFLIX.COM", cargo: 10_132 },
  { fecha: "27/01", glosa: "Transf a Pedro Vega", cargo: 5_000 },
];
