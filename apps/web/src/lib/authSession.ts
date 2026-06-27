/**
 * Personal session mirrors — a tiny leaf module that imports nothing.
 *
 * `authEvents` and module-scope query functions need to know whether there is an
 * active personal session. Reading that from `auth.tsx` would create an import
 * cycle (`auth → api → apiFetch → authEvents → auth`); keeping the mirrors here
 * (a module with no imports) breaks the cycle entirely. `AuthProvider` keeps
 * these in sync with React state via the setters.
 */

export interface SessionUser {
  userId: string;
  email: string;
  name?: string;
}

const TOKEN_KEY = "jwt_token";

/**
 * In-memory mirror of the personal JWT (legacy Bearer fallback). Initialized
 * from localStorage so query functions work before AuthProvider mounts and keep
 * the legacy token usable on a hard reload.
 */
let _personalToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
let _personalUser: SessionUser | null = null;

/** Current personal JWT (legacy Bearer fallback), or null when cookie-only. */
export function getPersonalToken(): string | null {
  return _personalToken;
}

/**
 * True when there is an active personal session — a legacy token OR a
 * cookie-hydrated user. Use this (not just the token) so cookie-only sessions
 * are neither blocked from fetching data nor kicked out on a transient 401.
 */
export function hasPersonalSession(): boolean {
  return !!_personalToken || !!_personalUser;
}

export function setPersonalTokenMirror(token: string | null): void {
  _personalToken = token;
}

export function setPersonalUserMirror(user: SessionUser | null): void {
  _personalUser = user;
}
