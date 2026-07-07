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
