import { jsPDF } from "jspdf";
import type { ReportData } from "@/contexts/ReportDataContext";

const MARGIN = 20;
const LINE_HEIGHT = 6;
const SECTION_GAP = 10;

function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * LINE_HEIGHT;
}

const A4_WIDTH_MM = 210;

export function generateCodaReportPdf(data: ReportData): void {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const maxWidth = A4_WIDTH_MM - 2 * MARGIN;
  let y = MARGIN;

  // Título
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte CODA", MARGIN, y);
  y += LINE_HEIGHT + 4;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Generado el ${new Date().toLocaleDateString("es-CL", { dateStyle: "long" })}`,
    MARGIN,
    y
  );
  y += SECTION_GAP + LINE_HEIGHT;

  // Scores
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Puntuaciones", MARGIN, y);
  y += LINE_HEIGHT + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const transactionalScore =
    data.transactionalScore ?? 802;
  const creditScore = data.creditScore ?? null;
  doc.text(
    `Score Transaccional: ${transactionalScore} / 1000`,
    MARGIN,
    y
  );
  y += LINE_HEIGHT;
  doc.text(
    `Score Crediticio (CMF): ${creditScore != null ? creditScore : "—"}${creditScore != null ? " (Excellent)" : ""}`,
    MARGIN,
    y
  );
  y += SECTION_GAP + LINE_HEIGHT;

  // Insights críticos
  const insights = data.mainInsights ?? [];
  if (insights.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Insights", MARGIN, y);
    y += LINE_HEIGHT + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    for (const insight of insights) {
      y = addWrappedText(doc, `• ${insight}`, MARGIN, y, maxWidth) + 2;
      if (y > 270) {
        doc.addPage();
        y = MARGIN;
      }
    }
    y += SECTION_GAP;
  }

  // Tabla Liquidez y Estabilidad de Ingresos (desde metrics)
  const metrics = data.metrics;
  if (metrics) {
    if (y > 240) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Liquidez y Estabilidad de Ingresos", MARGIN, y);
    y += LINE_HEIGHT + 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const rows: [string, string][] = [];
    if (metrics.averageMonthlyBalanceClp != null) {
      rows.push([
        "Saldo promedio mensual (CLP)",
        metrics.averageMonthlyBalanceClp.toLocaleString("es-CL"),
      ]);
    }
    if (metrics.monthsWithAbonos != null) {
      rows.push([
        "Meses con abonos (últimos 12)",
        String(metrics.monthsWithAbonos),
      ]);
    }
    if (metrics.monthsWithGap != null) {
      rows.push([
        "Meses sin movimientos (gap)",
        String(metrics.monthsWithGap),
      ]);
    }
    if (metrics.overdraftUsageRatio != null) {
      rows.push([
        "Uso de línea de sobregiro",
        `${(metrics.overdraftUsageRatio * 100).toFixed(1)}%`,
      ]);
    }
    if (metrics.hasOptimizationOpportunity != null) {
      rows.push([
        "Oportunidad de optimización (Saldo vs Deuda Tarjeta)",
        metrics.hasOptimizationOpportunity ? "Sí" : "No",
      ]);
    }

    if (rows.length > 0) {
      const col1W = 90;
      doc.setFont("helvetica", "bold");
      doc.text("Indicador", MARGIN, y);
      doc.text("Valor", MARGIN + col1W, y);
      y += LINE_HEIGHT + 2;
      doc.setFont("helvetica", "normal");
      for (const [label, value] of rows) {
        const yRow = y;
        y = addWrappedText(doc, label, MARGIN, y, col1W - 5) + 2;
        doc.text(value, MARGIN + col1W, yRow);
        y = Math.max(y, yRow + LINE_HEIGHT) + 2;
        if (y > 270) {
          doc.addPage();
          y = MARGIN;
        }
      }
    }
  }

  doc.save("reporte-coda.pdf");
}
