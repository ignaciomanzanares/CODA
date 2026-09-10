-- 047 — Gastos e ingresos EXTRAORDINARIOS (movimientos puntuales).
--
-- Un matrimonio, un auto, un pie, una operación: plata que SÍ entró o salió, pero que
-- no describe el ritmo mensual de la persona. Hasta ahora el diagnóstico trataba el mes
-- de un evento así como si fuera la vida financiera normal del usuario (tasa de ahorro
-- −18%, Ahorro/Ingreso "Crítico", "+3.484% vs mes anterior"), y en el modelo empujaba la
-- PD a la cola no confiable. `ratiosDerivation` sólo ACOTA el ratio (±1000%) para que la
-- UI no reviente; nadie identificaba el evento.
--
-- is_extraordinary es NULLABLE a propósito — tres estados, no dos:
--   NULL = sin decidir  → candidato a preguntarle al usuario
--   1    = el usuario confirmó que fue puntual → fuera del baseline recurrente
--   0    = el usuario dijo que es habitual     → nunca volver a preguntar
-- Nunca se marca solo: el detector propone, la persona decide. Excluir plata del
-- diagnóstico sin que el dueño lo sepa sería reescribirle las finanzas en silencio.
--
-- El movimiento SIGUE contando en saldo, patrimonio y Movimientos. Sólo sale del
-- baseline que modela el ritmo recurrente (salud financiera, tasa de ahorro, features
-- del modelo de riesgo, reconciliación de ingresos).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_extraordinary       INTEGER;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS extraordinary_marked_at TEXT;

-- Los candidatos se buscan sobre las filas sin decidir.
CREATE INDEX IF NOT EXISTS idx_transactions_extraordinary ON transactions(is_extraordinary);
