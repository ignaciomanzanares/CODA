# Evaluación de salud financiera (¿por qué salud ≠ score?) — #40

El **score crediticio** (0–850) y la **salud financiera** (8 niveles, -2 a 5) son cosas
distintas **a propósito** — no es un bug que no coincidan:

- **Score crediticio**: probabilidad de pago / riesgo de default. Mira historial CMF, mora,
  antigüedad y tipos de crédito. Es lo que un prestamista usa para decidir si te presta.
- **Salud financiera** (`evaluationEngine.ts`): qué tan sano es tu flujo y balance HOY. Mira
  ratios deuda/flujo, deuda/activos, ahorro/ingreso y mora activa. Es lo que TÚ usas para decidir
  si conviene ahorrar, refinanciar o reestructurar.

Un usuario puede tener **buen score y mala salud** (paga puntual pero está sobreendeudado y sin
ahorro) o **mal score y buena salud** (sin historial crediticio pero con flujo holgado). Por eso
hay dos motores separados y la salud no se deriva del score.

## Etapas

1. **Etapa 1 — determinística**: clasifica en zona (crítica/intermedia) y salida
   (ahorro_inversión / refinanciamiento / reestructuración / concursal) según los ratios.
2. **Etapa 2 — score compuesto**: combina ratios + score interno para el nivel final (-2…5).

Los ratios y el nivel se persisten para trazabilidad NCG 502 (`financial_health_v2` en
`algorithm_prediction_logs`) y para medir efectividad de los hábitos recomendados (#34).

## Línea base auditable (R1)

**Fuente única de cortes y supuestos: [`healthScorecard.config.ts`](./healthScorecard.config.ts).**
El motor NO tiene números mágicos: lee todo del scorecard. Cambiar un corte = editar ahí (con su
racional). Cada valor está etiquetado por origen — `criterio propio` (fijado por CODA, pendiente de
respaldo en R2/R3), `evidencia` (literatura/data) o `estructural` (normalización).

### Las 4 variables y sus cortes

| Variable | Definición | Corte(s) | Origen |
|---|---|---|---|
| **Deuda/Flujo** | cuota mensual / ingreso mensual (proxy DSTI) | crítico > 0.50; alerta insight > 0.30; peso 0.40 | criterio propio |
| **Deuda/Patrimonio** | deuda total / activos totales | crítico > 0.80; peso 0.35 | criterio propio |
| **Ahorro/Ingreso** | ahorro mensual / ingreso mensual | objetivo 0.20 (penalización 0 en target); peso 0.25 | criterio propio |
| **Mora activa** | ¿atraso vigente en CMF? (+ días de mora) | baja el nivel en 2 escalones | criterio propio |

Zona **crítica** = Deuda/Flujo > 0.50 **Y** Deuda/Patrimonio > 0.80 (regla dura). El resto pasa a
la etapa 2 (score compuesto 0–100 → nivel −2…+5).

### Supuestos / proxies (mayores fuentes de error — los reemplaza D7/R2 con dato real)

- **Cuota mensual** = `deuda_total_CMF / 36` (no es la cuota real).
- **Antigüedad** = `nº líneas de crédito × 12` (no es la antigüedad crediticia real).
- **Activos** = saldo SFA / balance promedio / activos declarados a mano.

Las invariantes del scorecard (pesos suman 1, umbrales ordenados) se testean en
`__tests__/healthScorecard.test.ts`; el comportamiento del motor está congelado por
`evaluationEngine.test.ts` (el refactor a config no cambió ningún resultado).
