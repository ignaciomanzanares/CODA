/**
 * D6 — Certificados de la AFC (seguro de cesantía). Dos documentos distintos, una sola fuente:
 *
 *  - **Cotizaciones pagadas (histórico)**: período, empleador, renta imponible, monto cotizado.
 *    Es renta imponible VERIFICADA mes a mes — la señal de ingreso formal más granular que
 *    tenemos, y la única que muestra lagunas.
 *  - **Antecedentes del afiliado**: empleadores con tipo de contrato y fechas. De ahí salen
 *    antigüedad y rotación.
 *
 * Tres trampas del formato, aprendidas de un certificado real:
 *
 *  1. **Cada mes aparece DOS veces con la misma renta imponible** (los dos componentes de la
 *     cotización). Sumar la renta duplicaría el ingreso de la persona. Se deduplica por
 *     período+empleador: la renta se toma una vez, los montos cotizados se suman.
 *  2. **Las celdas se envuelven**: el período puede quedar partido en las líneas de ARRIBA y
 *     ABAJO de la fila de datos ("Diciembre" / datos / "2013"), y la razón social puede ocupar
 *     dos líneas. Un parser línea a línea pierde filas: en el certificado real se perdía un
 *     tercio.
 *  3. **El documento trae su propio control**: un TOTAL de lo cotizado. Si la suma de las filas
 *     leídas no cuadra, el parser NO da el resultado por bueno — preferimos no entregar un
 *     ingreso incompleto antes que entregar uno equivocado.
 */
import type { GovParseResult } from "./types.js";

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};
const MES_RE = new RegExp(`\\b(${Object.keys(MESES).join("|")})\\b`, "i");
const ANIO_RE = /\b(19|20)\d{2}\b/;
const RUT_RE = /\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b/;
/** Fila de datos: RUT del empleador, dos montos y la fecha de pago. */
const FILA_RE =
  /^(?<pre>.*?)(?<rut>\d{1,2}\.\d{3}\.\d{3}-[\dkK])(?<mid>.*?)\$(?<renta>[\d.]+)\s+\$(?<cot>[\d.]+)\s+(?<pago>\d{2}\/\d{2}\/\d{4})/;

const clp = (s: string) => Number(s.replace(/\./g, ""));
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export interface CotizacionPeriodo {
  /** "YYYY-MM" */
  periodo: string;
  empleadorRut: string;
  empleadorNombre: string;
  rentaImponibleClp: number;
  montoCotizadoClp: number;
}

export interface CotizacionesAfc {
  periodos: CotizacionPeriodo[];
  /** TOTAL impreso en el documento (null si no aparece). */
  totalDeclaradoClp: number | null;
  /** Suma de los montos cotizados leídos. */
  totalLeidoClp: number;
  /** El documento cuadra con su propio total (o no trae total). */
  cuadra: boolean;
  /** Fecha de emisión del certificado, si se pudo leer (ISO YYYY-MM-DD). */
  emitidoEl: string | null;
  /** Folio del documento, con el que CUALQUIERA puede comprobar que el PDF es auténtico. */
  folio: string | null;
}

/**
 * El N° de folio que la AFC imprime en su certificado. Importa más de lo que parece: es lo
 * único que permite distinguir un certificado real de un PDF retocado, porque se comprueba
 * contra la AFC en {@link VALIDADOR_AFC}. Sin guardarlo, un certificado subido a CODA es
 * indistinguible de uno editado, y la "renta verificada" deja de estar verificada por nadie.
 *
 * Se lee de los dos documentos: el de cotizaciones y el de antecedentes.
 */
export const VALIDADOR_AFC = "https://servicios.afc.cl/validador-documentos/";

export function leerFolioAfc(text: string): string | null {
  const m = text.match(/N[°ºo]?\s*de\s*folio[:\s]*([A-Z0-9][A-Z0-9-]{5,})/i);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Busca el mes y/o el año en las líneas vecinas, POR COLUMNA.
 *
 * Cuando el mes es largo, el período se parte en las líneas de arriba y abajo… que son las mismas
 * donde se envuelve la razón social:
 *
 *     Septiembre                    DELOITTE ASESORIAS LEGALES Y
 *                    76.xxx.xxx-x        $2.205.575   $13.233   10/10/2023
 *        2023                            TRIBUTSRIAS LIMITADA
 *
 * Por eso no sirve filtrar por largo de línea (así se perdían 8 filas del certificado real):
 * hay que mirar sólo la franja a la IZQUIERDA de la columna del RUT, que es donde vive el período.
 */
function completarPeriodo(
  lineas: string[],
  i: number,
  corte: number,
  mes: string | null,
  anio: string | null,
): { mes: string | null; anio: string | null } {
  for (const j of [i - 1, i + 1, i - 2, i + 2]) {
    if (mes && anio) break;
    const vecina = lineas[j];
    if (vecina === undefined || FILA_RE.test(vecina)) continue;
    const franja = norm(vecina.slice(0, corte));
    if (!franja) continue;
    if (!mes) mes = franja.match(MES_RE)?.[0] ?? null;
    if (!anio) anio = franja.match(ANIO_RE)?.[0] ?? null;
  }
  return { mes, anio };
}

/**
 * Fragmentos de razón social envueltos en las líneas vecinas. Se mira sólo a la DERECHA de la
 * columna del período, porque esas mismas líneas pueden traer el mes o el año de la celda partida.
 */
function razonSocialVecina(lineas: string[], i: number, desde = 0): string {
  const partes: string[] = [];
  for (const j of [i - 1, i + 1]) {
    const vecina = lineas[j];
    if (vecina === undefined || FILA_RE.test(vecina)) continue;
    const texto = norm(vecina.slice(desde));
    if (!texto || /^\d{4}$/.test(texto)) continue;
    if (/[A-Za-zÁÉÍÓÚÑ]{3}/.test(texto)) partes.push(texto);
  }
  return partes.join(" ");
}

export function parseAfcCotizaciones(text: string): CotizacionesAfc {
  const lineas = text.split("\n");
  // Deduplicado por período+empleador: la renta imponible se repite en cada componente.
  const porClave = new Map<string, CotizacionPeriodo>();

  lineas.forEach((linea, i) => {
    const m = linea.match(FILA_RE);
    if (!m?.groups) return;
    const { pre, rut, mid, renta, cot } = m.groups;

    let mes = pre.match(MES_RE)?.[0] ?? null;
    let anio = pre.match(ANIO_RE)?.[0] ?? null;
    ({ mes, anio } = completarPeriodo(lineas, i, pre.length, mes, anio));
    if (!mes || !anio) return; // sin período no se puede ubicar en el tiempo

    const periodo = `${anio}-${String(MESES[mes.toLowerCase()]).padStart(2, "0")}`;
    const clave = `${periodo}|${rut}`;
    const nombre = norm(mid) || razonSocialVecina(lineas, i, pre.length);

    const prev = porClave.get(clave);
    if (prev) {
      prev.montoCotizadoClp += clp(cot);
      if (!prev.empleadorNombre) prev.empleadorNombre = nombre;
      return;
    }
    porClave.set(clave, {
      periodo,
      empleadorRut: rut,
      empleadorNombre: nombre,
      rentaImponibleClp: clp(renta),
      montoCotizadoClp: clp(cot),
    });
  });

  const periodos = [...porClave.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const totalDeclarado = text.match(/TOTAL\s+\$([\d.]+)/i);
  const totalDeclaradoClp = totalDeclarado ? clp(totalDeclarado[1]!) : null;
  const totalLeidoClp = periodos.reduce((s, p) => s + p.montoCotizadoClp, 0);

  const emision = text.match(
    /Fecha de emisi[oó]n:\s*(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i,
  );
  const emitidoEl = emision
    ? `${emision[3]}-${String(MESES[emision[2]!.toLowerCase()] ?? 1).padStart(2, "0")}-${emision[1]!.padStart(2, "0")}`
    : null;

  return {
    periodos,
    totalDeclaradoClp,
    totalLeidoClp,
    cuadra: totalDeclaradoClp === null || totalLeidoClp === totalDeclaradoClp,
    emitidoEl,
    folio: leerFolioAfc(text),
  };
}

export interface EmpleadorAfc {
  rut: string;
  razonSocial: string;
  tipoContrato: string;
  inicio: string | null; // ISO
  fin: string | null; // ISO; null = vigente
  /** El documento trae fin anterior al inicio (dato malo en la fuente, no del parser). */
  fechasInconsistentes: boolean;
}

const FECHA_RE = /(\d{2})-(\d{2})-(\d{4})/g;
const isoDe = (d: string) => {
  const [dd, mm, yyyy] = d.split("-");
  return `${yyyy}-${mm}-${dd}`;
};

export function parseAfcAntecedentes(text: string): EmpleadorAfc[] {
  const lineas = text.split("\n");
  const out: EmpleadorAfc[] = [];

  lineas.forEach((linea, i) => {
    const rut = linea.match(RUT_RE)?.[0];
    if (!rut) return;
    const tipo = linea.match(/\b(INDEFINIDO|PLAZO FIJO|POR OBRA[^\s]*|FAENA)\b/i)?.[0];
    if (!tipo) return;

    const fechas = [...linea.matchAll(FECHA_RE)].map((f) => isoDe(f[0]));
    // La primera es la fecha de suscripción; luego inicio y fin de contrato.
    const [, inicio = null, fin = null] = fechas;
    const razon =
      norm(linea.split(rut)[1]?.split(new RegExp(tipo, "i"))[0] ?? "") ||
      razonSocialVecina(lineas, i);

    out.push({
      rut,
      razonSocial: razon,
      tipoContrato: tipo.toUpperCase(),
      inicio,
      fin,
      fechasInconsistentes: Boolean(inicio && fin && fin < inicio),
    });
  });

  return out;
}

export interface MetricasAfc {
  /** Renta imponible mensual típica de los últimos meses cotizados (mediana). */
  rentaImponibleMensualClp: number | null;
  mesesCotizados: number;
  ultimoPeriodo: string | null;
  /** Meses entre el último período cotizado y la emisión del certificado. */
  mesesSinCotizar: number | null;
  /** Meses sin cotización ENTRE el primero y el último período (discontinuidad). */
  lagunasMeses: number;
  /** Empleadores distintos en los últimos 24 meses cotizados. */
  empleadores24m: number;
  /** Antigüedad, en meses, con el empleador del último período. */
  antiguedadMesesEmpleoActual: number | null;
}

const mesesEntre = (a: string, b: string) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by! - ay!) * 12 + (bm! - am!);
};

/** Mediana de una lista no vacía. Robusta a un mes con bono o finiquito. */
function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

export function derivarMetricasAfc(cot: CotizacionesAfc): MetricasAfc {
  const { periodos } = cot;
  if (periodos.length === 0) {
    return {
      rentaImponibleMensualClp: null,
      mesesCotizados: 0,
      ultimoPeriodo: null,
      mesesSinCotizar: null,
      lagunasMeses: 0,
      empleadores24m: 0,
      antiguedadMesesEmpleoActual: null,
    };
  }

  // Renta del mes = suma de empleadores de ese mes (pluriempleo), nunca de las filas repetidas.
  const porMes = new Map<string, number>();
  const empleadoresPorMes = new Map<string, Set<string>>();
  for (const p of periodos) {
    porMes.set(p.periodo, (porMes.get(p.periodo) ?? 0) + p.rentaImponibleClp);
    const set = empleadoresPorMes.get(p.periodo) ?? new Set<string>();
    set.add(p.empleadorRut);
    empleadoresPorMes.set(p.periodo, set);
  }

  const meses = [...porMes.keys()].sort();
  const primero = meses[0]!;
  const ultimo = meses.at(-1)!;
  const ultimos12 = meses.slice(-12).map((m) => porMes.get(m)!);

  const empleadores24m = new Set(
    meses
      .filter((m) => mesesEntre(m, ultimo) < 24)
      .flatMap((m) => [...(empleadoresPorMes.get(m) ?? [])]),
  ).size;

  // Antigüedad: meses consecutivos hacia atrás con el mismo empleador del último período.
  const empleadorActual = [...(empleadoresPorMes.get(ultimo) ?? [])][0] ?? null;
  let antiguedad: number | null = null;
  if (empleadorActual) {
    antiguedad = 0;
    for (let i = meses.length - 1; i >= 0; i--) {
      if (!empleadoresPorMes.get(meses[i]!)?.has(empleadorActual)) break;
      antiguedad++;
    }
  }

  return {
    rentaImponibleMensualClp: mediana(ultimos12),
    mesesCotizados: meses.length,
    ultimoPeriodo: ultimo,
    mesesSinCotizar: cot.emitidoEl ? mesesEntre(ultimo, cot.emitidoEl.slice(0, 7)) : null,
    lagunasMeses: mesesEntre(primero, ultimo) + 1 - meses.length,
    empleadores24m,
    antiguedadMesesEmpleoActual: antiguedad,
  };
}

/** True si el texto corresponde a alguno de los dos certificados de la AFC. */
export function esCertificadoAfc(text: string): boolean {
  return /AFC\s*CHILE|Cuenta Individual por Cesant[íi]a|afiliado registrado en AFC|seguro de cesant[íi]a/i.test(
    text,
  );
}

/**
 * Lee cualquiera de los dos certificados de la AFC. Son complementarios: el de cotizaciones
 * aporta la renta verificada, el de antecedentes aporta empleadores y contratos.
 */
export function parseAfcCertificado(text: string): GovParseResult {
  const cot = parseAfcCotizaciones(text);

  if (cot.periodos.length > 0) {
    if (!cot.cuadra) {
      return {
        source: "afc",
        ok: false,
        raw: {
          documento: "cotizaciones",
          totalDeclaradoClp: cot.totalDeclaradoClp,
          totalLeidoClp: cot.totalLeidoClp,
          periodosLeidos: cot.periodos.length,
          folio: cot.folio,
          validador: VALIDADOR_AFC,
        },
        message:
          "El certificado de cotizaciones no cuadra con su propio total: se leyeron " +
          `$${cot.totalLeidoClp.toLocaleString("es-CL")} de $${cot.totalDeclaradoClp?.toLocaleString("es-CL")}. ` +
          "Preferimos no usar un histórico incompleto.",
      };
    }
    const m = derivarMetricasAfc(cot);
    return {
      source: "afc",
      ok: m.rentaImponibleMensualClp !== null,
      verifiedMonthlyIncomeClp: m.rentaImponibleMensualClp,
      contributionMonths: m.mesesCotizados,
      raw: {
        documento: "cotizaciones",
        ...m,
        emitidoEl: cot.emitidoEl,
        folio: cot.folio,
        validador: VALIDADOR_AFC,
      },
      message:
        m.mesesSinCotizar && m.mesesSinCotizar >= 6
          ? `Sin cotizaciones hace ${m.mesesSinCotizar} meses: la renta imponible es histórica, no actual.`
          : undefined,
    };
  }

  const empleadores = parseAfcAntecedentes(text);
  if (empleadores.length > 0) {
    return {
      source: "afc",
      ok: true,
      raw: {
        documento: "antecedentes",
        empleadores,
        empleadorVigente: empleadores.find((e) => !e.fin)?.razonSocial ?? null,
        folio: leerFolioAfc(text),
        validador: VALIDADOR_AFC,
      },
    };
  }

  return {
    source: "afc",
    ok: false,
    raw: {},
    message: "No se reconoció el certificado de la AFC (ni cotizaciones ni antecedentes).",
  };
}
