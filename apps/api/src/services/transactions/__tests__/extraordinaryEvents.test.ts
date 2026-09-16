import { describe, it, expect } from "vitest";
import {
  detectExtraordinaryCandidates,
  extraordinaryDecision,
  isExtraordinaryTx,
  isOutsideBaselineTx,
  MIN_SAMPLE_SIZE,
  MIN_AMOUNT_CLP,
  type CandidateTxLike,
} from "../extraordinaryEvents";
import { toNormalizedTx } from "../../normalizedTransactions";

let seq = 0;
const tx = (over: Partial<CandidateTxLike> = {}): CandidateTxLike => {
  const cargo = over.cargo ?? 0;
  const abono = over.abono ?? 0;
  return {
    id: String(++seq),
    postedAt: "2026-05-10",
    month: "2026-05",
    cargo,
    abono,
    tipo: abono > 0 ? "ingreso" : "egreso",
    descripcion: "COMPRA",
    categoria: "otro",
    is_extraordinary: null,
    ...over,
  };
};

/** Ruido de fondo: N gastos chicos que fijan la mediana "habitual" del usuario. */
const routine = (n: number, monto = 20_000, month = "2026-05") =>
  Array.from({ length: n }, () => tx({ cargo: monto, month }));

describe("isExtraordinaryTx", () => {
  it("sólo es true cuando el usuario confirmó (1); null y 0 no lo son", () => {
    expect(isExtraordinaryTx({ is_extraordinary: 1 })).toBe(true);
    expect(isExtraordinaryTx({ is_extraordinary: 0 })).toBe(false);
    expect(isExtraordinaryTx({ is_extraordinary: null })).toBe(false);
    expect(isExtraordinaryTx({})).toBe(false);
  });
});

describe("isOutsideBaselineTx", () => {
  it("saca del baseline tanto las internas como las extraordinarias confirmadas", () => {
    expect(isOutsideBaselineTx({ is_internal_transfer: 1 })).toBe(true);
    expect(isOutsideBaselineTx({ is_extraordinary: 1 })).toBe(true);
    expect(isOutsideBaselineTx({ is_extraordinary: null })).toBe(false);
    expect(isOutsideBaselineTx({ categoria: "otro", descripcion: "SUPERMERCADO" })).toBe(false);
  });
});

describe("detectExtraordinaryCandidates", () => {
  it("detecta el pago único enorme entre gastos habituales", () => {
    const evento = tx({ cargo: 5_000_000, descripcion: "Transf a EVENTOS DEMO SPA" });
    const out = detectExtraordinaryCandidates([...routine(30), evento]);

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(evento.id);
    expect(out[0].amountClp).toBe(5_000_000);
    expect(out[0].medianMultiple).toBeGreaterThan(100);
    expect(out[0].monthShare).toBeGreaterThan(0.5);
    expect(out[0].tipo).toBe("egreso");
  });

  it("también detecta INGRESOS puntuales (plata que entra para financiar el evento)", () => {
    const aporte = tx({ abono: 2_500_000, descripcion: "Transf. Persona Uno" });
    const sueldos = Array.from({ length: 20 }, () => tx({ abono: 90_000 }));
    const out = detectExtraordinaryCandidates([...sueldos, aporte]);

    expect(out.map((c) => c.id)).toEqual([aporte.id]);
    expect(out[0].tipo).toBe("ingreso");
  });

  it("no propone nada sin historia suficiente para saber qué es habitual", () => {
    // El propio candidato cuenta en la muestra, así que para quedar bajo el mínimo
    // hacen falta MIN_SAMPLE_SIZE - 2 rutinarios: total = MIN_SAMPLE_SIZE - 1.
    const pocos = routine(MIN_SAMPLE_SIZE - 2);
    const grande = tx({ cargo: 5_000_000 });
    expect(detectExtraordinaryCandidates([...pocos, grande])).toEqual([]);

    // Con un movimiento más ya hay mediana y el evento sí se propone.
    const conHistoria = detectExtraordinaryCandidates([...routine(MIN_SAMPLE_SIZE - 1), grande]);
    expect(conHistoria).toHaveLength(1);
  });

  it("respeta el piso absoluto: un outlier chico no es un evento de vida", () => {
    // 40× la mediana de $1.000, pero sólo $40.000: outlier estadístico, no matrimonio.
    const chico = tx({ cargo: 40_000 });
    const out = detectExtraordinaryCandidates([...routine(30, 1_000), chico]);
    expect(out).toEqual([]);
    expect(chico.cargo).toBeLessThan(MIN_AMOUNT_CLP);
  });

  it("ignora un monto grande que NO es material dentro de su mes", () => {
    // 40 gastos de $1.000.000 cada uno: $600.000 pasa el piso pero explica ~1% del mes,
    // y además ni siquiera supera la mediana. Es un mes caro, no un evento.
    const mesCaro = Array.from({ length: 40 }, () => tx({ cargo: 1_000_000 }));
    const out = detectExtraordinaryCandidates([...mesCaro, tx({ cargo: 600_000 })]);
    expect(out).toEqual([]);
  });

  it("no vuelve a preguntar por lo ya decidido, en ninguno de los dos sentidos", () => {
    const yaPuntual = tx({ cargo: 5_000_000, is_extraordinary: 1 });
    const yaHabitual = tx({ cargo: 6_000_000, is_extraordinary: 0 });
    const out = detectExtraordinaryCandidates([...routine(30), yaPuntual, yaHabitual]);
    expect(out).toEqual([]);
  });

  it("no propone transferencias internas: ya están fuera del baseline por otra vía", () => {
    const pagoTc = tx({ cargo: 5_000_000, is_internal_transfer: 1 });
    expect(detectExtraordinaryCandidates([...routine(30), pagoTc])).toEqual([]);
  });

  it("un segundo evento no queda tapado por la mediana inflada del primero", () => {
    // Lo ya marcado sale de la población de la mediana; si contara, dos eventos
    // grandes se normalizarían entre sí y el segundo dejaría de ser candidato.
    const marcado = tx({ cargo: 5_000_000, is_extraordinary: 1 });
    const nuevo = tx({ cargo: 4_750_000 });
    const out = detectExtraordinaryCandidates([...routine(30), marcado, nuevo]);
    expect(out.map((c) => c.id)).toEqual([nuevo.id]);
  });

  it("ordena por monto y respeta el límite", () => {
    const grandes = [tx({ cargo: 1_000_000 }), tx({ cargo: 9_000_000 }), tx({ cargo: 3_000_000 })];
    const out = detectExtraordinaryCandidates([...routine(40), ...grandes], 2);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.amountClp)).toEqual([9_000_000, 3_000_000]);
  });

  it("el monthShare se mide contra el total real del mes, incluido el propio movimiento", () => {
    // Mes con $1.000.000 de rutina + $9.000.000 del evento → el evento explica 90%.
    const evento = tx({ cargo: 9_000_000, month: "2026-05" });
    const out = detectExtraordinaryCandidates([...routine(50, 20_000, "2026-05"), evento]);
    expect(out[0].monthShare).toBeCloseTo(0.9, 1);
  });
});

describe("extraordinaryDecision — tres estados sin colapsar", () => {
  it("el booleano de conveniencia `false` NO significa 'decidido habitual'", () => {
    // Forma real de producción para una fila sin decidir: null + false.
    expect(extraordinaryDecision({ is_extraordinary: null, isExtraordinary: false })).toBeNull();
    expect(extraordinaryDecision({ isExtraordinary: false })).toBeNull();
  });

  it("respeta la columna autoritativa cuando viene", () => {
    expect(extraordinaryDecision({ is_extraordinary: 1, isExtraordinary: true })).toBe(1);
    expect(extraordinaryDecision({ is_extraordinary: 0, isExtraordinary: false })).toBe(0);
  });
});

describe("detectExtraordinaryCandidates — con la forma REAL de producción (toNormalizedTx)", () => {
  // Filas crudas como las devuelve la tabla `transactions`, pasadas por el mismo mapper que
  // usa getUserNormalizedTransactions. is_extraordinary NULL en la base = sin decidir.
  let id = 1000;
  const row = (
    postedAt: string,
    amount: number,
    description = "MOV",
    extra: number | null = null,
  ) =>
    toNormalizedTx(
      {
        id: ++id,
        accountId: 1,
        postedAt,
        amount,
        description,
        category: "otro",
        isInternalTransfer: 0,
        isExtraordinary: extra,
      },
      { id: 1, name: "Cuenta", subtype: "checking" },
    );

  // Forma del caso que originó el fix (anonimizado: nombres y RUTs sintéticos, montos redondeados):
  //  - egresos habituales chicos (mediana ~$10.000) + pagos grandes a un proveedor de eventos;
  //  - ingresos habituales ~$365.000 + transferencias de terceros el mismo mes;
  //  - un pago recurrente de empresa de $1.350.000 (3,7× la mediana de ingreso).
  const build = () => [
    ...Array.from({ length: 40 }, () => row("2026-05-10", -10_000, "SUPERMERCADO")),
    row("2026-05-20", -5_000_000, "Transf a EVENTOS DEMO SPA"),
    row("2026-05-18", -4_750_000, "Transf a EVENTOS DEMO SPA"),
    row("2026-05-15", -250_000, "Transf a EVENTOS DEMO SPA"),
    ...Array.from({ length: 20 }, (_, i) =>
      row(`2025-${String((i % 9) + 1).padStart(2, "0")}-05`, 365_000, "HONORARIOS"),
    ),
    row("2026-05-19", 2_500_000, "Transf. Persona Uno"),
    row("2026-05-19", 2_500_000, "Transf. Persona Dos"),
    row("2026-05-15", 2_500_000, "Transf. Persona Uno"),
    row("2026-04-11", 1_350_000, "76.543.210-3 Transf. SERVI TELE"),
  ];

  it("propone el evento puntual en las DOS puntas — el bug hacía que no propusiera nada", () => {
    const out = detectExtraordinaryCandidates(build());
    const desc = out.map((c) => `${c.tipo}:${c.amountClp}`);

    expect(desc).toContain("egreso:5000000");
    expect(desc).toContain("egreso:4750000");
    expect(out.filter((c) => c.tipo === "ingreso" && c.amountClp === 2_500_000)).toHaveLength(3);
  });

  it("no propone el pago chico bajo el piso ni el ingreso recurrente de empresa", () => {
    const out = detectExtraordinaryCandidates(build());
    expect(out.find((c) => c.amountClp === 250_000)).toBeUndefined();
    expect(out.find((c) => c.amountClp === 1_350_000)).toBeUndefined();
  });

  it("lo que el usuario ya marcó (1 o 0) deja de proponerse", () => {
    const txs = build().map((t) =>
      t.description.includes("EVENTOS DEMO") && t.cargo === 5_000_000
        ? row(t.postedAt, -5_000_000, t.description, 1)
        : t.description.includes("EVENTOS DEMO") && t.cargo === 4_750_000
          ? row(t.postedAt, -4_750_000, t.description, 0)
          : t,
    );
    const out = detectExtraordinaryCandidates(txs);
    expect(out.find((c) => c.amountClp === 5_000_000)).toBeUndefined();
    expect(out.find((c) => c.amountClp === 4_750_000)).toBeUndefined();
  });
});
