/**
 * Títulos de documento por ruta (SPA). Rutas en español + alias en inglés.
 */
const DEFAULT_TITLE = "CODA | Tu panel financiero personal";

/** Coincidencia exacta (pathname sin query, sin barra final salvo /) */
const EXACT: Record<string, string> = {
  "/": DEFAULT_TITLE,

  "/panel": "Panel | CODA",
  "/dashboard": "Panel | CODA",

  "/gastos": "Gastos | CODA",
  "/expenses": "Gastos | CODA",

  "/info/score-credito": "Score Crediticio | CODA",
  "/info/credit-score": "Score Crediticio | CODA",
  /** Si en el futuro existe ruta corta /score */
  "/score": "Score Crediticio | CODA",

  "/productos": "Productos Financieros | CODA",
  "/products": "Productos Financieros | CODA",
  "/productos/metricas": "Métricas de productos | CODA",
  "/products/metrics": "Métricas de productos | CODA",

  "/metas": "Metas | CODA",
  "/goals": "Metas | CODA",

  "/iniciar-sesion": "Iniciar sesión | CODA",
  "/login": "Iniciar sesión | CODA",

  "/registro": "Crear cuenta | CODA",
  "/signup": "Crear cuenta | CODA",

  "/movimientos": "Movimientos | CODA",
  "/conexiones": "Conexiones | CODA",
  "/dividir-cuenta": "Dividir cuenta | CODA",
  "/bill-split": "Dividir cuenta | CODA",
  "/plan": "Plan financiero | CODA",
  "/perfil": "Perfil | CODA",
  "/profile": "Perfil | CODA",

  "/acerca": "Acerca de CODA | CODA",
  "/about": "Acerca de CODA | CODA",

  "/bienvenida": "Bienvenida | CODA",
  "/onboarding": "Bienvenida | CODA",

  "/auditoria": "Auditoría | CODA",
  "/audit": "Auditoría | CODA",

  "/invitacion": "Invitación | CODA",
  "/invite": "Invitación | CODA",

  "/info/riesgo-seguros": "Riesgo de seguros | CODA",
  "/info/insurance-risk": "Riesgo de seguros | CODA",
  "/info/metas-financieras": "Metas financieras | CODA",
  "/info/financial-goals": "Metas financieras | CODA",
  "/info/comparacion-productos": "Comparación de productos | CODA",
  "/info/product-comparison": "Comparación de productos | CODA",

  "/empresas": "CODA Empresas",
  "/empresas/login": "Iniciar sesión — Empresas | CODA",
};

function normalizePath(path: string): string {
  const noQuery = path.split("?")[0] || "/";
  if (noQuery.length > 1 && noQuery.endsWith("/")) {
    return noQuery.slice(0, -1);
  }
  return noQuery || "/";
}

/**
 * Devuelve el &lt;title&gt; recomendado para la ruta actual.
 */
export function getPageTitle(pathname: string): string {
  const p = normalizePath(pathname);
  if (EXACT[p]) return EXACT[p];

  if (p.startsWith("/empresas/")) {
    if (p.includes("/dashboard")) return "Panel empresas | CODA";
    if (p.includes("/companies")) return "Empresas | CODA";
    if (p.includes("/transactions")) return "Transacciones | CODA";
    if (p.includes("/reconciliation")) return "Reconciliación | CODA";
    if (p.includes("/statements")) return "Estados financieros | CODA";
    if (p.includes("/documents")) return "DTE | CODA";
    if (p.includes("/purchase-orders")) return "Órdenes de compra | CODA";
    if (p.includes("/risk")) return "Riesgo | CODA";
    if (p.includes("/products")) return "Productos empresas | CODA";
    return "CODA Empresas";
  }

  if (p.startsWith("/dividir/")) return "Dividir cuenta (invitado) | CODA";
  if (p.startsWith("/split/")) return "Dividir cuenta (invitado) | CODA";

  return "CODA";
}
