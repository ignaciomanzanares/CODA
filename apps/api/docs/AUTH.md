# CODA Auth — Session Management

## JWT TTL

Tokens are valid for **30 days** (`expiresIn: "30d"`).

The default can be overridden per-deployment with the `JWT_EXPIRES_IN` environment variable (e.g. `"1h"` for testing, `"90d"` for a longer window).

**Rationale (MVP simplicity):** Real users upload cartolas, navigate slowly, and sometimes return the next day or the following week. A 1-hour or 24-hour TTL caused spurious "expired token" errors during normal sessions. Refresh tokens add meaningful implementation surface for no benefit at current scale — users tolerate a monthly re-login. This decision should be revisited when the user base grows or compliance requirements change.

## No Refresh Tokens

There is no refresh-token endpoint. When a token expires the frontend:
1. Shows a Spanish toast: "Tu sesión ha expirado. Vuelve a iniciar sesión para continuar."
2. Saves the current route and any pending upload metadata to `sessionStorage`.
3. Redirects to `/iniciar-sesion`.
4. After successful re-login, navigates back to the saved route.

## Token Blacklist

Logged-out tokens are held in an in-memory `Set` and expire from it after 30 days (matching the JWT TTL). In a scaled deployment, replace with Redis.

## Signing Secret

`JWT_SECRET` must be at least 32 characters in production. Generate with:

```sh
openssl rand -base64 32
```

Do not commit the secret to source control.
