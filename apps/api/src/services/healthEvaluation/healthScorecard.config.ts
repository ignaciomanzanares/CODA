/**
 * Scorecard AUDITABLE del motor de salud financiera v2 (R1 — línea base auditable).
 *
 * FUENTE ÚNICA de los cortes, pesos, anclas y supuestos del `evaluationEngine`. Antes vivían como
 * números mágicos dispersos en el código; centralizarlos permite discutir "qué cambia y por qué"
 * en un solo lugar, y es la base de la defensa regulatoria (NCG 502 / discriminación indirecta).
 *
 * Cada valor lleva su racional y su ORIGEN:
 *   - `criterio propio`  → fijado por CODA; PENDIENTE de respaldar con evidencia/data local (R2/R3).
 *   - `evidencia`        → respaldado por literatura o datos (se completa en R2).
 *   - `estructural`      → decisión de diseño/normalización (no es un umbral de riesgo).
 *
 * NO cambiar valores sin actualizar el racional: este archivo ES la especificación del modelo.
 */

export const HEALTH_V2_SCORECARD = {
  version: "v2.0.0",

  /**
   * Etapa 1 — Zona crítica. Regla dura: AMBAS condiciones simultáneas → zona crítica.
   * deudaFlujo = cuota mensual de deuda / ingreso mensual (proxy DSTI).
   * deudaActivos = deuda total / activos totales.
   */
  criticalZone: {
    /** Cuota/ingreso por sobre 50%. [criterio propio — alinear con DSTI de literatura, R2] */
    deudaFlujoMax: 0.5,
    /** Deuda/activos por sobre 80% (sobre-apalancamiento). [criterio propio, R2] */
    deudaActivosMax: 0.8,
  },

  /**
   * Etapa 2 — Score de ratios (0–100). Penaliza carga de deuda y premia ahorro.
   * scoreRatios = 100 − (deudaFlujoNorm·w1 + deudaActivosNorm·w2 + penalizacionAhorro·w3).
   */
  ratiosScore: {
    /** Pesos relativos de cada ratio en el score. Suman 1.0. [criterio propio, R3] */
    weights: { deudaFlujo: 0.4, deudaActivos: 0.35, ahorro: 0.25 },
    /** Ahorro/ingreso objetivo: 20% = penalización 0 (regla 50/30/20). [criterio propio] */
    ahorroTarget: 0.2,
  },

  /**
   * Score interno (0–100) — señal crediticia complementaria (NO es el score CMF).
   * scoreInterno = histNorm·w1 + antNorm·w2 + divNorm·w3.
   */
  internalScore: {
    weights: { historial: 0.5, antiguedad: 0.3, diversificacion: 0.2 },
    /** Máximo del historial CMF crudo (0–850). [estructural] */
    historialMax: 850,
    /** Tope de antigüedad: 120 meses = 10 años. [criterio propio] */
    antiguedadTopeMeses: 120,
    /** Normalización por nº de tipos de crédito (índice 0..3). [criterio propio] */
    diversificacionLookup: [0, 40, 70, 100] as const,
  },

  /** Composición final y mapeo a nivel -2..+5. */
  composite: {
    /** scoreCompuesto = scoreRatios·ratiosWeight + scoreInterno·internoWeight. */
    ratiosWeight: 0.5,
    internoWeight: 0.5,
    /** Mapeo score→nivel: floor(score/segmentSize) + levelOffset, acotado. [estructural] */
    segmentSize: 12.5, // 8 segmentos de 0–100
    levelOffset: -2,
    levelMin: -2,
    levelMax: 5,
  },

  /** Mora activa baja el nivel en N escalones (penalización dura). [criterio propio] */
  moraPenaltyLevels: 2,

  /** Umbrales de "salida" (recomendación) por nivel resultante. [criterio propio] */
  salidaThresholds: {
    /** nivel ≥ este → ahorro/inversión. */
    ahorroInversionMinNivel: 2,
    /** nivel ≥ este (y < ahorro) → refinanciamiento; bajo esto → reestructuración. */
    refinanciamientoMinNivel: -1,
  },

  /** Cortes usados solo para generar insights de texto (no afectan el nivel). */
  insights: {
    deudaFlujoAlerta: 0.3,
    deudaFlujoAlta: 0.5,
    ahorroBajo: 0.1,
    ahorroBueno: 0.2,
  },

  /**
   * SUPUESTOS / PROXIES documentados. Son las mayores fuentes de error del modelo y lo que R2/D7
   * deben reemplazar con dato real (SII/AFC/banco) cuando esté disponible.
   */
  assumptions: {
    cuotaMensual: "Proxy: deuda_total CMF / 36. Reemplazar con la cuota real declarada.",
    antiguedad: "Proxy: nº de líneas de crédito × 12 meses. No es la antigüedad crediticia real.",
    activos: "Proxy: saldo SFA / balance promedio / activos declarados a mano por el usuario.",
    ahorroMensual: "Ingreso mensual − gastos mensuales (de cartola). Puede ser negativo.",
  },
} as const;

export type HealthScorecard = typeof HEALTH_V2_SCORECARD;
