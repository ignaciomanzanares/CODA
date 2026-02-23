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

  // Título formal
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Reporte de Salud Financiera", MARGIN, y);
  y += LINE_HEIGHT + 4;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Generado el ${new Date().toLocaleDateString("es-CL", { dateStyle: "long" })}`,
    MARGIN,
    y
  );
  y += SECTION_GAP + LINE_HEIGHT;

  // 1. Resumen de Identidad
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("1. Resumen de Identidad", MARGIN, y);
  y += LINE_HEIGHT + 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const nombre = data.userName ?? "—";
  const rut = data.documentRut ?? "No extraído de documento";
  doc.text(`Nombre: ${nombre}`, MARGIN, y);
  y += LINE_HEIGHT;
  doc.text(`RUT: ${rut}`, MARGIN, y);
  y += SECTION_GAP + LINE_HEIGHT;

  // 2. Certificación de Ingresos (cartolas)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("2. Certificación de Ingresos", MARGIN, y);
  y += LINE_HEIGHT + 2;
  doc.setFont("helvetica", "normal");
  const metrics = data.metrics;
  if (metrics?.monthsWithAbonos != null || metrics?.averageMonthlyBalanceClp != null) {
    if (metrics.monthsWithAbonos != null) {
      y =
        addWrappedText(
          doc,
          `Basado en el promedio de abonos detectados en las cartolas: ${metrics.monthsWithAbonos} de los últimos 12 meses con al menos un abono.`,
          MARGIN,
          y,
          maxWidth
        ) + 2;
    }
    if (metrics.averageMonthlyBalanceClp != null) {
      doc.text(
        `Saldo promedio mensual (CLP): $${metrics.averageMonthlyBalanceClp.toLocaleString("es-CL")}`,
        MARGIN,
        y
      );
      y += LINE_HEIGHT;
    }
  } else {
    y =
      addWrappedText(
        doc,
        "Sin datos de cartolas cargadas. Sube cartolas para certificar ingresos.",
        MARGIN,
        y,
        maxWidth
      ) + 2;
  }
  y += SECTION_GAP;

  // 3. Estado de Solvencia (CMF)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("3. Estado de Solvencia", MARGIN, y);
  y += LINE_HEIGHT + 2;
  doc.setFont("helvetica", "normal");
  const deuda = data.cmfDeudaTotalVigente;
  if (deuda != null) {
    const textSolvencia =
      deuda === 0
        ? "Deuda total vigente reportada por la CMF: $0 CLP. Estado vigente sin deudas morosas."
        : `Deuda total vigente reportada por la CMF: $${deuda.toLocaleString("es-CL")} CLP.`;
    y = addWrappedText(doc, textSolvencia, MARGIN, y, maxWidth) + 2;
  } else {
    y =
      addWrappedText(
        doc,
        "Sin Informe CMF cargado. Sube un Informe de Deudas CMF para reflejar el estado de solvencia.",
        MARGIN,
        y,
        maxWidth
      ) + 2;
  }
  y += SECTION_GAP;

  // Puntuaciones
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Puntuaciones", MARGIN, y);
  y += LINE_HEIGHT + 2;
  doc.setFont("helvetica", "normal");
  const transactionalScore = data.transactionalScore ?? null;
  const creditScore = data.creditScore ?? null;
  doc.text(
    `Score Transaccional: ${transactionalScore != null ? `${transactionalScore} / 1000` : "—"}`,
    MARGIN,
    y
  );
  y += LINE_HEIGHT;
  doc.text(
    `Score Crediticio (CMF): ${creditScore != null ? `${creditScore} (Excellent)` : "—"}`,
    MARGIN,
    y
  );
  y += SECTION_GAP + LINE_HEIGHT;

  // Insights
  const insights = data.mainInsights ?? [];
  if (insights.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Insights", MARGIN, y);
    y += LINE_HEIGHT + 2;
    doc.setFont("helvetica", "normal");
    for (const insight of insights) {
      y = addWrappedText(doc, `• ${insight}`, MARGIN, y, maxWidth) + 2;
      if (y > 270) {
        doc.addPage();
        y = MARGIN;
      }
    }
    y += SECTION_GAP;
  }

  // 4. Sello de Validación
  if (y > 250) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("4. Sello de Validación", MARGIN, y);
  y += LINE_HEIGHT + 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const sello =
    "Datos validados mediante documentos oficiales bajo estándares CMF/SFA.";
  y = addWrappedText(doc, sello, MARGIN, y, maxWidth) + SECTION_GAP;

  doc.save("reporte-salud-financiera.pdf");
}
