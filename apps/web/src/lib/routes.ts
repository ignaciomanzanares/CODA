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
  /** Onboarding de primer ingreso: consentimiento + KYC + 2FA (detrás del flag). */
  verificacion: "/verificacion",
  auditoria: "/auditoria",
  /** Dashboard de administración (solo role=admin): revenue/funnel, gestión de leads, export compliance. */
  admin: "/admin",
  infoScoreCredito: "/info/score-credito",
  infoMetasFinancieras: "/info/metas-financieras",
  infoComparacionProductos: "/info/comparacion-productos",
  restablecerContrasena: "/restablecer-contrasena",
  saludFinanciera: "/salud-financiera",
  misActivos: "/mis-activos",
  /** Política de privacidad (CMF / Ley Fintec) */
  privacidad: "/privacidad",
  /** Términos y condiciones de uso */
  terminos: "/terminos",
} as const;

/** Enlace público para invitados (compartir un dividir cuenta). */
export function rutaDividirPublico(codigo: string): string {
  return `/dividir/${encodeURIComponent(codigo)}`;
}
