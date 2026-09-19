import { describe, it, expect } from "vitest";
import {
  parseAfcCotizaciones,
  parseAfcAntecedentes,
  derivarMetricasAfc,
  parseAfcCertificado,
  leerFolioAfc,
} from "../afcParsers";
import { detectGovSource } from "../govParsers";

/**
 * Fixtures con el layout REAL del certificado (datos sintéticos). Las tres trampas están acá:
 * dos filas por mes con la misma renta imponible, celdas envueltas, y el TOTAL como control.
 */
const encabezado = [
  "                                        N° de folio ABCD-1234-EFGH-5678",
  "                                      Fecha de emisión: 17 de septiembre de 2026",
  "Certificado de cotizaciones previsionales acreditadas de Cuenta Individual por Cesantía",
  "AFC CHILE S.A. certifica que la Cuenta Individual de Cesantía, perteneciente al afiliado(a)",
  "registra en el periodo comprendido entre OCTUBRE/2002 - SEPTIEMBRE/2026, las siguientes cotizaciones",
  "                 RUT                                     Renta         Monto        Fecha de",
  "  Período                       Razón Social",
  "               Empleador                                Imponible     Cotizado        pago",
];

/** Fila normal: el período cabe en la misma línea. */
const fila = (periodo: string, renta: string, cot: string, pago: string) =>
  ` ${periodo.padEnd(13)}76.000.000-0      EMPRESA DEMO SPA        $${renta}     $${cot}   ${pago}`;

/** Fila con el mes arriba y el año abajo, y la razón social envuelta en esas mismas líneas. */
const filaEnvuelta = (mes: string, anio: string, renta: string, cot: string, pago: string) => [
  `${mes.padEnd(14)}              EMPRESA DEMO LARGA Y`,
  `               76.000.000-0                              $${renta}     $${cot}   ${pago}`,
  `   ${anio}                          ASOCIADOS LIMITADA`,
];

const certificado = (filas: string[], total: string) =>
  [
    ...encabezado,
    ...filas,
    `                                        TOTAL           $${total}`,
  ].join("\n");

describe("parseAfcCotizaciones", () => {
  it("no suma dos veces la renta imponible del mismo mes (son dos componentes de la cotización)", () => {
    const texto = certificado(
      [
        fila("Julio 2021", "1.000.000", "6.000", "11/08/2021"),
        fila("Julio 2021", "1.000.000", "16.000", "11/08/2021"),
      ],
      "22.000",
    );
    const cot = parseAfcCotizaciones(texto);

    expect(cot.periodos).toHaveLength(1);
    expect(cot.periodos[0]).toMatchObject({
      periodo: "2021-07",
      rentaImponibleClp: 1_000_000, // una vez, no 2.000.000
      montoCotizadoClp: 22_000, // los montos sí se suman
    });
    expect(cot.cuadra).toBe(true);
  });

  it("lee las filas con la celda del período partida en las líneas vecinas", () => {
    const texto = certificado(
      [
        ...filaEnvuelta("Septiembre", "2023", "2.205.575", "13.233", "10/10/2023"),
        ...filaEnvuelta("Septiembre", "2023", "2.205.575", "35.289", "10/10/2023"),
      ],
      "48.522",
    );
    const cot = parseAfcCotizaciones(texto);

    expect(cot.periodos).toHaveLength(1);
    expect(cot.periodos[0]!.periodo).toBe("2023-09");
    expect(cot.periodos[0]!.rentaImponibleClp).toBe(2_205_575);
    expect(cot.cuadra).toBe(true);
  });

  it("el TOTAL del documento delata un histórico incompleto", () => {
    const texto = certificado([fila("Julio 2021", "1.000.000", "6.000", "11/08/2021")], "999.999");
    const cot = parseAfcCotizaciones(texto);

    expect(cot.totalLeidoClp).toBe(6_000);
    expect(cot.totalDeclaradoClp).toBe(999_999);
    expect(cot.cuadra).toBe(false);
  });

  it("lee la fecha de emisión", () => {
    const cot = parseAfcCotizaciones(certificado([], "0"));
    expect(cot.emitidoEl).toBe("2026-09-17");
  });
});

describe("derivarMetricasAfc", () => {
  const meses = ["Enero 2024", "Febrero 2024", "Marzo 2024"];

  it("renta típica, meses cotizados y antigüedad con el empleador actual", () => {
    const cot = parseAfcCotizaciones(
      certificado(
        meses.map((m, i) => fila(m, "1.000.000", String(6_000 + i), `10/0${i + 2}/2024`)),
        String(6_000 + 6_001 + 6_002),
      ),
    );
    const m = derivarMetricasAfc(cot);

    expect(m.mesesCotizados).toBe(3);
    expect(m.rentaImponibleMensualClp).toBe(1_000_000);
    expect(m.ultimoPeriodo).toBe("2024-03");
    expect(m.antiguedadMesesEmpleoActual).toBe(3);
    expect(m.empleadores24m).toBe(1);
  });

  it("cuenta las lagunas entre el primer y el último período", () => {
    const cot = parseAfcCotizaciones(
      certificado(
        [
          fila("Enero 2024", "1.000.000", "6.000", "10/02/2024"),
          fila("Junio 2024", "1.000.000", "6.000", "10/07/2024"),
        ],
        "12.000",
      ),
    );
    // Enero a Junio son 6 meses; hay 2 con cotización → 4 de laguna.
    expect(derivarMetricasAfc(cot).lagunasMeses).toBe(4);
  });

  it("mide los meses sin cotizar contra la emisión del certificado", () => {
    const cot = parseAfcCotizaciones(
      certificado([fila("Agosto 2024", "1.000.000", "6.000", "10/09/2024")], "6.000"),
    );
    // Agosto 2024 → septiembre 2026 (emisión del fixture).
    expect(derivarMetricasAfc(cot).mesesSinCotizar).toBe(25);
  });

  it("suma los empleadores del mismo mes (pluriempleo), sin duplicar filas", () => {
    const texto = certificado(
      [
        fila("Marzo 2024", "800.000", "4.800", "10/04/2024"),
        ` Marzo 2024   77.111.111-1      OTRA EMPRESA SPA        $400.000     $2.400   10/04/2024`,
      ],
      "7.200",
    );
    const m = derivarMetricasAfc(parseAfcCotizaciones(texto));
    expect(m.rentaImponibleMensualClp).toBe(1_200_000);
    expect(m.empleadores24m).toBe(2);
  });
});

describe("parseAfcAntecedentes", () => {
  const antecedentes = [
    "Antecedentes de afiliado registrado en AFC",
    "   Fecha           RUT                          Tipo de       Fecha inicio    Fecha fin",
    " suscripción     empleador      Razón social    contrato        contrato       contrato",
    "   13-02-2023    76.000.000-0   EMPRESA DEMO SPA   INDEFINIDO   01-01-2023     13-08-2024",
    "   23-07-2021    77.111.111-1   OTRA EMPRESA SPA   INDEFINIDO   23-07-2021     22-07-2021",
  ].join("\n");

  it("lee empleadores, tipo de contrato y fechas", () => {
    const empleadores = parseAfcAntecedentes(antecedentes);
    expect(empleadores).toHaveLength(2);
    expect(empleadores[0]).toMatchObject({
      tipoContrato: "INDEFINIDO",
      inicio: "2023-01-01",
      fin: "2024-08-13",
      fechasInconsistentes: false,
    });
  });

  it("marca las fechas imposibles del documento en vez de calcular una antigüedad negativa", () => {
    // Caso real: un contrato con fecha de término ANTERIOR a la de inicio.
    const malo = parseAfcAntecedentes(antecedentes)[1]!;
    expect(malo.fin! < malo.inicio!).toBe(true);
    expect(malo.fechasInconsistentes).toBe(true);
  });
});

describe("parseAfcCertificado — resultado para la fuente gov", () => {
  it("cotizaciones: entrega renta verificada y avisa si el dato es viejo", () => {
    const r = parseAfcCertificado(
      certificado([fila("Agosto 2024", "1.500.000", "9.000", "10/09/2024")], "9.000"),
    );
    expect(r.source).toBe("afc");
    expect(r.ok).toBe(true);
    expect(r.verifiedMonthlyIncomeClp).toBe(1_500_000);
    expect(r.contributionMonths).toBe(1);
    expect(r.message).toContain("Sin cotizaciones hace 25 meses");
  });

  it("no entrega ingreso si el histórico no cuadra con su propio total", () => {
    const r = parseAfcCertificado(
      certificado([fila("Agosto 2024", "1.500.000", "9.000", "10/09/2024")], "50.000"),
    );
    expect(r.ok).toBe(false);
    expect(r.verifiedMonthlyIncomeClp).toBeUndefined();
    expect(r.message).toContain("no cuadra");
  });

  it("antecedentes: entrega empleadores aunque no traiga renta", () => {
    const r = parseAfcCertificado(
      [
        "Antecedentes de afiliado registrado en AFC",
        "   13-02-2023    76.000.000-0   EMPRESA DEMO SPA   INDEFINIDO   01-01-2023",
      ].join("\n"),
    );
    expect(r.ok).toBe(true);
    expect(r.raw.documento).toBe("antecedentes");
    expect(r.verifiedMonthlyIncomeClp).toBeUndefined();
  });
});

describe("detectGovSource", () => {
  it("reconoce los dos certificados de la AFC y no los confunde con la AFP", () => {
    expect(detectGovSource(certificado([], "0"))).toBe("afc");
    expect(detectGovSource("Antecedentes de afiliado registrado en AFC CHILE")).toBe("afc");
    expect(
      detectGovSource("CERTIFICADO COTIZACIONES AFP MODELO. Cuenta obligatoria. Renta imponible"),
    ).toBe("afp");
  });
});

describe("folio — lo único que hace verificable al certificado", () => {
  it("lee el folio del encabezado", () => {
    expect(parseAfcCotizaciones(certificado([], "0")).folio).toBe("ABCD-1234-EFGH-5678");
  });

  it("no inventa folio cuando el documento no lo trae", () => {
    expect(leerFolioAfc("Certificado sin número de folio impreso")).toBeNull();
  });

  it("el folio llega al resultado junto con el enlace para comprobarlo", () => {
    const r = parseAfcCertificado(
      certificado([fila("Agosto 2024", "1.500.000", "9.000", "10/09/2024")], "9.000"),
    );
    expect(r.raw.folio).toBe("ABCD-1234-EFGH-5678");
    expect(String(r.raw.validador)).toContain("servicios.afc.cl");
  });

  it("guarda el folio INCLUSO si el histórico no cuadra: ahí es cuando más sirve", () => {
    // Un total que no cuadra puede ser un parser incompleto… o un PDF editado. El folio es
    // lo único que permite distinguir una cosa de la otra, así que no se pierde.
    const r = parseAfcCertificado(
      certificado([fila("Agosto 2024", "1.500.000", "9.000", "10/09/2024")], "50.000"),
    );
    expect(r.ok).toBe(false);
    expect(r.raw.folio).toBe("ABCD-1234-EFGH-5678");
  });

  it("también lo lee del certificado de antecedentes", () => {
    const r = parseAfcCertificado(
      [
        "                 N° de folio WXYZ-9876-ABCD-5432",
        "Antecedentes de afiliado registrado en AFC",
        "   13-02-2023    76.000.000-0   EMPRESA DEMO SPA   INDEFINIDO   01-01-2023",
      ].join("\n"),
    );
    expect(r.raw.documento).toBe("antecedentes");
    expect(r.raw.folio).toBe("WXYZ-9876-ABCD-5432");
  });
});
