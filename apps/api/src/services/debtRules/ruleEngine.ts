import { DEBT_RULE_CATALOG } from './ruleCatalog.js';
import { FAMILY_LABELS, type DebtRuleContext, type DebtRuleRecommendation } from './types.js';

/** Flag de habilitación (opt-out): apagar con DEBT_RULES_ENABLED=false. */
export function isDebtRulesEnabled(): boolean {
  return process.env.DEBT_RULES_ENABLED !== 'false';
}

/**
 * Evalúa las reglas de deuda contra el contexto del usuario y devuelve las recomendaciones
 * ordenadas por prioridad.
 *
 * Regla dura (anti-predatoria, espeja la del marketplace): en ZONA CRÍTICA solo se muestran reglas
 * de reducción de deuda (Familia A). No tiene sentido sugerir diversificar crédito o invertir a
 * alguien insolvente/sobreendeudado — la salida es reestructurar, no tomar más productos.
 */
export function evaluateDebtRules(ctx: DebtRuleContext, limit = 6): DebtRuleRecommendation[] {
  const criticalZone = ctx.health.zona === 'critica';

  const matched = DEBT_RULE_CATALOG.filter((rule) => {
    if (criticalZone && rule.familia !== 'reduccion_deuda') return false;
    return rule.matches(ctx);
  });

  matched.sort((a, b) => b.prioridad - a.prioridad);

  return matched.slice(0, limit).map((rule) => ({
    key: rule.key,
    familia: rule.familia,
    familiaLabel: FAMILY_LABELS[rule.familia],
    titulo: rule.titulo,
    descripcion: rule.describe(ctx),
    accion: rule.accion,
    impacto: rule.impacto,
    prioridad: rule.prioridad,
  }));
}
