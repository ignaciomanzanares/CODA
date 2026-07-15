import { jsPDF } from "jspdf";
import type { ReportData } from "@/contexts/ReportDataContext";

const MARGIN = 20;
const LINE_HEIGHT = 6;
const SECTION_GAP = 10;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const CONTENT_WIDTH = A4_WIDTH_MM - 2 * MARGIN;

// Brand colors
const BLUE = "#1a56db";
const DARK = "#1e293b";
const MUTED = "#64748b";
const LIGHT_BG = "#f8fafc";
const DIVIDER = "#e2e8f0";

function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number = LINE_HEIGHT,
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function setColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function drawDivider(doc: jsPDF, y: number): number {
  const [r, g, b] = hexToRgb(DIVIDER);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, A4_WIDTH_MM - MARGIN, y);
  return y + 6;
}

function drawSectionHeader(doc: jsPDF, title: string, y: number): number {
  setColor(doc, BLUE);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, MARGIN, y);
  setColor(doc, DARK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return y + LINE_HEIGHT + 2;
}

function scoreLabel(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.85) return "Excelente";
  if (pct >= 0.7) return "Muy bueno";
  if (pct >= 0.55) return "Bueno";
  if (pct >= 0.4) return "Regular";
  return "Bajo";
}

function addFooter(doc: jsPDF, pageNum: number) {
  const y = A4_HEIGHT_MM - 10;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  setColor(doc, MUTED);
  doc.text(`Generado por CODA · codafinance.cl · info@codafinance.cl`, MARGIN, y);
  doc.text(`Pág. ${pageNum}`, A4_WIDTH_MM - MARGIN, y, { align: "right" });
  setColor(doc, DARK);
}

function checkPageBreak(doc: jsPDF, y: number, needed: number, pageNum: { value: number }): number {
  if (y + needed > A4_HEIGHT_MM - 18) {
    addFooter(doc, pageNum.value);
    doc.addPage();
    pageNum.value++;
    return MARGIN + 10;
  }
  return y;
}

export function generateCodaReportPdf(data: ReportData): void {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const pageNum = { value: 1 };

  // ── HEADER ────────────────────────────────────────────────────────────────
  // Blue header bar
  const [br, bg, bb] = hexToRgb(BLUE);
  doc.setFillColor(br, bg, bb);
  doc.rect(0, 0, A4_WIDTH_MM, 30, "F");

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("CODA", MARGIN, 13);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Reporte de Salud Financiera", MARGIN, 21);

  // Date top right
  doc.setFontSize(9);
  doc.text(
    new Date().toLocaleDateString("es-CL", { dateStyle: "long" }),
    A4_WIDTH_MM - MARGIN,
    21,
    { align: "right" },
  );

  setColor(doc, DARK);

  let y = 42;

  // ── 1. IDENTIDAD ───────────────────────────────────────────────────────────
  y = drawSectionHeader(doc, "1. Identidad", y);
  doc.setFontSize(10);
  setColor(doc, DARK);

  const nombre = data.userName ?? "—";
  doc.text(`Nombre: ${nombre}`, MARGIN, y);
  y += LINE_HEIGHT;

  // Only show RUT if it was extracted from the document
  if (data.documentRut) {
    doc.text(`RUT: ${data.documentRut}`, MARGIN, y);
    y += LINE_HEIGHT;
  }
  y += SECTION_GAP;
  y = drawDivider(doc, y);

  // ── 2. CERTIFICACIÓN DE INGRESOS ──────────────────────────────────────────
  pageNum.value =
    checkPageBreak(doc, y, 30, pageNum) === MARGIN + 10 ? pageNum.value : pageNum.value;
  y = checkPageBreak(doc, y, 30, pageNum);
  y = drawSectionHeader(doc, "2. Certificación de Ingresos", y);

  const metrics = data.metrics;
  if (metrics?.monthsWithAbonos != null || metrics?.averageMonthlyBalanceClp != null) {
    if (metrics.monthsWithAbonos != null) {
      y =
        addWrappedText(
          doc,
          `Meses con al menos un abono detectado: ${metrics.monthsWithAbonos} de los últimos 12 meses.`,
          MARGIN,
          y,
          CONTENT_WIDTH,
        ) + 2;
    }
    if (metrics.averageMonthlyBalanceClp != null) {
      doc.text(
        `Saldo promedio mensual: $${metrics.averageMonthlyBalanceClp.toLocaleString("es-CL")} CLP`,
        MARGIN,
        y,
      );
      y += LINE_HEIGHT;
    }
  } else {
    setColor(doc, MUTED);
    y =
      addWrappedText(
        doc,
        "Sin cartolas cargadas. Sube una cartola bancaria para certificar tus ingresos.",
        MARGIN,
        y,
        CONTENT_WIDTH,
      ) + 2;
    setColor(doc, DARK);
  }
  y += SECTION_GAP;
  y = drawDivider(doc, y);

  // ── 3. ESTADO DE SOLVENCIA ────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 30, pageNum);
  y = drawSectionHeader(doc, "3. Estado de Solvencia (CMF)", y);

  const deuda = data.cmfDeudaTotalVigente;
  if (deuda != null) {
    const textSolvencia =
      deuda === 0
        ? "Deuda total vigente reportada por la CMF: $0 CLP. Sin deudas morosas activas."
        : `Deuda total vigente reportada por la CMF: $${deuda.toLocaleString("es-CL")} CLP.`;
    y = addWrappedText(doc, textSolvencia, MARGIN, y, CONTENT_WIDTH) + 2;
  } else {
    setColor(doc, MUTED);
    y =
      addWrappedText(
        doc,
        "Sin Informe CMF cargado. Sube un Informe de Deudas CMF para reflejar el estado de solvencia.",
        MARGIN,
        y,
        CONTENT_WIDTH,
      ) + 2;
    setColor(doc, DARK);
  }
  y += SECTION_GAP;
  y = drawDivider(doc, y);

  // ── 4. SCORES ─────────────────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 40, pageNum);
  y = drawSectionHeader(doc, "4. Puntuaciones", y);

  const transactionalScore = data.transactionalScore ?? null;
  const creditScore = data.creditScore ?? null;

  if (transactionalScore != null) {
    const tLabel = scoreLabel(transactionalScore, 100);
    doc.text(`Score Transaccional: ${transactionalScore} / 100  (${tLabel})`, MARGIN, y);
    y += LINE_HEIGHT;
  } else {
    setColor(doc, MUTED);
    doc.text("Score Transaccional: pendiente (sube una cartola bancaria)", MARGIN, y);
    setColor(doc, DARK);
    y += LINE_HEIGHT;
  }

  if (creditScore != null) {
    const cLabel = scoreLabel(creditScore, 850);
    doc.text(`Score Crediticio (CMF): ${creditScore} / 850  (${cLabel})`, MARGIN, y);
    y += LINE_HEIGHT;
  } else {
    setColor(doc, MUTED);
    doc.text("Score Crediticio: pendiente (sube un Informe de Deudas CMF)", MARGIN, y);
    setColor(doc, DARK);
    y += LINE_HEIGHT;
  }
  y += SECTION_GAP;
  y = drawDivider(doc, y);

  // ── 5. INSIGHTS ───────────────────────────────────────────────────────────
  const insights = data.mainInsights ?? [];
  if (insights.length > 0) {
    y = checkPageBreak(doc, y, 20, pageNum);
    y = drawSectionHeader(doc, "5. Insights", y);
    for (const insight of insights) {
      y = checkPageBreak(doc, y, 10, pageNum);
      y = addWrappedText(doc, `• ${insight}`, MARGIN, y, CONTENT_WIDTH) + 2;
    }
    y += SECTION_GAP;
    y = drawDivider(doc, y);
  }

  // ── 6. SELLO DE VALIDACIÓN ────────────────────────────────────────────────
  y = checkPageBreak(doc, y, 20, pageNum);
  y = drawSectionHeader(
    doc,
    insights.length > 0 ? "6. Sello de Validación" : "5. Sello de Validación",
    y,
  );
  setColor(doc, MUTED);
  y =
    addWrappedText(
      doc,
      "Datos validados mediante documentos oficiales (Informe CMF / Cartola bancaria). Este reporte es informativo y no constituye asesoría financiera ni garantiza aprobación de productos.",
      MARGIN,
      y,
      CONTENT_WIDTH,
    ) + SECTION_GAP;
  setColor(doc, DARK);

  addFooter(doc, pageNum.value);
  doc.save("reporte-salud-financiera-coda.pdf");
}
