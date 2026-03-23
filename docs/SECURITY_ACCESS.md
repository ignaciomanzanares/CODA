# Seguridad y acceso (API CODA)

## Eventos de autenticación (logs)

Los eventos se emiten con **Pino**, `module: "auth"`, campo `event` y mensaje `auth:<evento>`.

| `event` | Cuándo |
|---------|--------|
| `login_success` | Login con contraseña correcta (sin 2FA o sin 2FA activado) |
| `login_failed` | Credenciales incorrectas o usuario inexistente |
| `login_demo` | Login con contraseña demo (`DEMO_MODE` / desarrollo) |
| `twofa_challenge` | Se generó OTP; `emailSent` indica si el correo salió |
| `twofa_verified` | OTP correcto, sesión emitida |
| `twofa_failed` | OTP incorrecto o expirado |
| `twofa_email_failed` | No se pudo enviar el correo (503 en producción) |
| `resend_2fa` | Reenvío de código |
| `register_success` | Alta de cuenta |
| `logout` | Cierre de sesión (token invalidado en blacklist en memoria) |
| `enable_2fa` / `disable_2fa` | Cambio de flag 2FA |

Incluyen **IP** (`x-forwarded-for` o socket) y **user-agent** (truncado). El correo se registra **redactado** (`a***@dominio.cl`).

**Retención:** definir en el proveedor de logs del hosting (p. ej. Azure Monitor, CloudWatch).

## Doble factor (2FA)

- Con **2FA activado**, el login envía un **código de 6 dígitos** por correo.
- **Producción:** si el envío falla → **503** y no se completa el login (no depender de `console.log`).
- **Desarrollo:** si no hay SMTP, puede imprimirse `[DEV] 2FA code...` en consola.
- Variables: `GMAIL_USER` + `GMAIL_APP_PASSWORD`, o `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`, y remitente `SMTP_FROM` o `EMAIL_FROM` (recomendado alineado con **codafinance.cl** cuando el correo corporativo esté listo).

## Roles personas vs empresas

- **Personas:** JWT estándar en rutas `/api/*` protegidas con `authenticate`.
- **Empresas:** todas las rutas `/api/empresas/*` exigen **JWT** (mismo login `/api/auth/login`; el cliente guarda el token en `jwt_token_empresas` y `empresasApi.ts` envía `Authorization: Bearer …`).
- **Pendiente endurecimiento:** filtrar datos por **usuario ↔ empresa** (membresía en BD); hoy un usuario autenticado podría consultar IDs de empresa conocidos — conviene `empresas_memberships` o equivalente en rutas sensibles.

## Archivos relevantes

- `apps/api/src/middleware/auth.ts` — login, registro, 2FA, logout
- `apps/api/src/middleware/authSecurityLog.ts` — helpers de log
- `apps/api/src/services/emailService.ts` — `send2FACode`
