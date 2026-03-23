/**
 * Rutas en español (CODA Personal).
 * Las rutas antiguas en inglés siguen registradas en App.tsx apuntando al mismo componente o con Redirect.
 */
export const ROUTES = {
  home: "/",
  panel: "/panel",
  movimientos: "/movimientos",
  conexiones: "/conexiones",
  gastos: "/gastos",
  /** Página principal «Dividir cuenta» */
  dividirCuenta: "/dividir-cuenta",
  productos: "/productos",
  productosMetricas: "/productos/metricas",
  metas: "/metas",
  plan: "/plan",
  perfil: "/perfil",
  iniciarSesion: "/iniciar-sesion",
  registro: "/registro",
  acerca: "/acerca",
  invitacion: "/invitacion",
  bienvenida: "/bienvenida",
  auditoria: "/auditoria",
  infoScoreCredito: "/info/score-credito",
  infoRiesgoSeguros: "/info/riesgo-seguros",
  infoMetasFinancieras: "/info/metas-financieras",
  infoComparacionProductos: "/info/comparacion-productos",
} as const;

/** Enlace público para invitados (compartir un dividir cuenta). */
export function rutaDividirPublico(codigo: string): string {
  return `/dividir/${encodeURIComponent(codigo)}`;
}
