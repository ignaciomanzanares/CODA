import type { DebtRule } from "./types.js";
import type { CMFParseResult } from "../../parsers/cmf-parser.js";

/** Ratio 0–1 → porcentaje entero (0.834 → "83%"). */
const pct = (x: number): string => `${Math.round(x * 100)}%`;
/** CLP → "$1.234.567". */
const clp = (x: number): string => `$${Math.round(x).toLocaleString("es-CL")}`;

const consumoVigente = (cmf: CMFParseResult) =>
  cmf.deuda_directa.filter((d) => d.tipo_credito === "consumo" && d.vigente > 0);
const hasAtrasoTemprano = (cmf: CMFParseResult) =>
  cmf.deuda_directa.some((d) => d.atraso_30_59 > 0 || d.atraso_60_89 > 0);
const hasAtrasoGrave = (cmf: CMFParseResult) => cmf.deuda_directa.some((d) => d.atraso_90_mas > 0);
const creditosGrandes = (cmf: CMFParseResult) =>
  cmf.deuda_directa.filter(
    (d) =>
      (d.tipo_credito === "vivienda" && d.vigente > 5_000_000) ||
      (d.tipo_credito === "consumo" && d.vigente > 1_000_000),
  );

/**
 * Las 12 reglas de optimización de deuda, en 3 familias. Cada `key` es estable (para el feedback
 * y la trazabilidad). El motor (ruleEngine) filtra por `matches`, aplica la regla dura de zona
 * crítica y ordena por `prioridad`. Cada regla explica al usuario QUÉ mejora en su score/nivel.
 *
 * Familia A (reduccion_deuda): baja la carga y el costo de la deuda existente.
 * Familia B (comportamiento): mejora las señales que miran el score crediticio.
 * Familia C (ahorro_capacidad): construye colchón y capacidad de pago.
 */
export const DEBT_RULE_CATALOG: DebtRule[] = [
  // ── Familia A — Reducción y reestructuración de deuda ──
  {
    key: "repactar_mora",
    familia: "reduccion_deuda",
    titulo: "Repacta tus pagos en mora",
    prioridad: 120,
    matches: (c) => c.health.ratios.moraActiva,
    describe: (c) =>
      `Tienes deuda en mora con ${c.health.ratios.diasMora} día(s) de atraso. Repactar o ponerte al día ` +
      `frena los intereses moratorios y detiene el deterioro de tu historial.`,
    accion: "Contacta a tu institución para repactar la deuda atrasada o ponerte al día.",
    impacto: "Historial de pago (el componente de mayor peso en tu score crediticio).",
  },
  {
    key: "consolidar_deudas",
    familia: "reduccion_deuda",
    titulo: "Consolida tus créditos de consumo",
    prioridad: 110,
    matches: (c) => consumoVigente(c.cmf).length >= 2,
    describe: (c) => {
      const list = consumoVigente(c.cmf);
      const total = list.reduce((s, d) => s + d.vigente, 0);
      return (
        `Tienes ${list.length} créditos de consumo vigentes en ${new Set(list.map((d) => d.institucion)).size} ` +
        `institución(es) por ${clp(total)}. Consolidarlos en un solo crédito suele bajar la cuota mensual total y simplifica el pago.`
      );
    },
    accion: "Cotiza un crédito de consolidación que junte tus deudas en una sola cuota más baja.",
    impacto: "Baja tu carga mensual (deuda/flujo) y mejora tu componente de endeudamiento.",
  },
  {
    key: "prepago_deuda_cara",
    familia: "reduccion_deuda",
    titulo: "Prepaga tu deuda más cara",
    prioridad: 100,
    matches: (c) => c.health.ratios.ahorroIngreso > 0.1 && c.health.ratios.deudaFlujo > 0.2,
    describe: (c) =>
      `Ahorras alrededor del ${pct(c.health.ratios.ahorroIngreso)} de tu ingreso y destinas el ` +
      `${pct(c.health.ratios.deudaFlujo)} a deuda. Usar parte de ese excedente para prepagar el crédito más caro ` +
      `reduce el interés total que pagas.`,
    accion:
      "Destina tu excedente mensual a abonar/prepagar el crédito con la tasa más alta (método avalancha).",
    impacto: "Baja tu ratio deuda/activos y el costo financiero total.",
  },
  {
    key: "portabilidad_credito",
    familia: "reduccion_deuda",
    titulo: "Evalúa portar tu crédito a mejor tasa",
    prioridad: 90,
    matches: (c) => creditosGrandes(c.cmf).length > 0 && !c.health.ratios.moraActiva,
    describe: (c) => {
      const list = creditosGrandes(c.cmf);
      const total = list.reduce((s, d) => s + d.vigente, 0);
      return (
        `Tienes ${clp(total)} en créditos vigentes candidatos a portabilidad. Portar a otra institución con mejor ` +
        `tasa puede reducir tu cuota sin aumentar tu deuda.`
      );
    },
    accion:
      "Solicita ofertas de portabilidad financiera y compara la tasa (CAE) con tu crédito actual.",
    impacto: "Baja tu cuota mensual y mejora tu capacidad de pago.",
  },
  {
    key: "reducir_uso_linea",
    familia: "reduccion_deuda",
    titulo: "Reduce el uso de tus líneas de crédito",
    prioridad: 80,
    matches: (c) => c.cmf.lineas_credito.length > 0 && c.health.ratios.deudaFlujo > 0.35,
    describe: (c) =>
      `Tienes líneas de crédito disponibles y ya destinas el ${pct(c.health.ratios.deudaFlujo)} de tu flujo a deuda. ` +
      `Evitar apoyarte en las líneas rotativas (que tienen tasas altas) frena que la carga siga creciendo.`,
    accion:
      "Evita usar la línea de crédito/sobregiro para gastos corrientes; paga el saldo utilizado cuanto antes.",
    impacto: "Mejora tu comportamiento de uso de crédito (una señal que el score observa).",
  },

  // ── Familia B — Mejora de comportamiento y score ──
  {
    key: "regularizar_atraso_temprano",
    familia: "comportamiento",
    titulo: "Ponte al día antes de que el atraso escale",
    prioridad: 105,
    matches: (c) => hasAtrasoTemprano(c.cmf) && !hasAtrasoGrave(c.cmf),
    describe: () =>
      `Registras atrasos tempranos (30–89 días) que aún no llegan a mora grave. Pagarlos ahora evita que se ` +
      `conviertan en un castigo, que golpea mucho más fuerte tu historial.`,
    accion: "Regulariza los pagos con atraso de 30–89 días antes de que superen los 90.",
    impacto: "Evita una caída fuerte de tu componente de historial de pago.",
  },
  {
    key: "bajar_ratio_endeudamiento",
    familia: "comportamiento",
    titulo: "Baja tu ratio de endeudamiento",
    prioridad: 70,
    matches: (c) => c.health.ratios.deudaFlujo > 0.3 && c.health.ratios.deudaFlujo <= 0.5,
    describe: (c) =>
      `Destinas el ${pct(c.health.ratios.deudaFlujo)} de tu ingreso a deuda (zona intermedia). Bajarlo hacia el ` +
      `30% o menos mejora cómo te ven las instituciones al evaluar un nuevo producto.`,
    accion:
      "Prioriza reducir saldos antes de tomar deuda nueva, hasta bajar del 30% de tu ingreso.",
    impacto: "Mejora tu componente de endeudamiento.",
  },
  {
    key: "mejorar_capacidad_pago",
    familia: "comportamiento",
    titulo: "Aumenta tu capacidad de pago",
    prioridad: 60,
    matches: (c) =>
      c.health.ratios.ahorroIngreso < 0.1 && !c.health.ratios.moraActiva && c.health.nivel >= 0,
    describe: (c) =>
      `Tu excedente mensual es bajo (ahorras ~${pct(Math.max(0, c.health.ratios.ahorroIngreso))} del ingreso). ` +
      `Liberar flujo (renegociando gastos fijos) mejora tu capacidad de pago, que el score valora.`,
    accion: "Renegocia o elimina gastos fijos recurrentes para liberar flujo mensual.",
    impacto: "Mejora tu componente de capacidad de pago.",
  },
  {
    key: "diversificar_credito",
    familia: "comportamiento",
    titulo: "Diversifica tu historial de crédito (con prudencia)",
    prioridad: 40,
    matches: (c) => c.tiposCredito <= 1 && c.health.nivel >= 2 && !c.health.ratios.moraActiva,
    describe: () =>
      `Tu historial muestra un solo tipo de crédito. Un historial con distintos tipos bien manejados puede aportar ` +
      `a tu score — pero solo si tu situación es holgada y sin sumar carga que no necesites.`,
    accion:
      "Si lo necesitas y puedes pagarlo sin esfuerzo, un producto de otro tipo bien manejado diversifica tu historial.",
    impacto: "Aporta al componente de historial (diversidad de cartera).",
  },

  // ── Familia C — Ahorro y capacidad de pago ──
  {
    key: "fondo_emergencia",
    familia: "ahorro_capacidad",
    titulo: "Arma tu fondo de emergencia",
    prioridad: 65,
    matches: (c) => c.health.nivel >= 0 && c.health.nivel <= 1,
    describe: () =>
      `Estás al día pero con poco colchón. Juntar 3–6 meses de gastos esenciales te protege de tener que endeudarte ` +
      `ante un imprevisto — y sube tu nivel de salud financiera.`,
    accion:
      "Separa automáticamente un monto fijo cada mes hasta juntar 3 meses de gastos esenciales.",
    impacto: "Sube tu nivel de salud financiera (de −2..+5).",
  },
  {
    key: "optimizar_gasto_discrecional",
    familia: "ahorro_capacidad",
    titulo: "Optimiza tu gasto discrecional",
    prioridad: 55,
    matches: (c) => c.health.ratios.ahorroIngreso < 0.05,
    describe: (c) =>
      c.health.ratios.ahorroIngreso < 0
        ? `Estás gastando más de lo que ingresas. Recortar el gasto no esencial es el primer paso para dejar de perder terreno.`
        : `Casi no te queda excedente al mes. Reasignar parte del gasto discrecional a pago de deuda o ahorro cambia tu trayectoria.`,
    accion:
      "Identifica tus 2–3 categorías de gasto no esencial más altas y reasígnalas a deuda o ahorro.",
    impacto: "Mejora tu capacidad de pago y tu tasa de ahorro.",
  },
  {
    key: "aumentar_ahorro",
    familia: "ahorro_capacidad",
    titulo: "Sube tu tasa de ahorro",
    prioridad: 45,
    matches: (c) =>
      c.health.ratios.ahorroIngreso >= 0.05 &&
      c.health.ratios.ahorroIngreso < 0.2 &&
      c.health.nivel >= 1,
    describe: (c) =>
      `Ahorras el ${pct(c.health.ratios.ahorroIngreso)} de tu ingreso. Llevarlo hacia el 20% acelera tu fondo de ` +
      `emergencia y te acerca a poder invertir.`,
    accion:
      "Automatiza el ahorro apenas recibes tu ingreso (págate a ti primero), apuntando al 20%.",
    impacto: "Sube tu nivel de salud financiera.",
  },
];
