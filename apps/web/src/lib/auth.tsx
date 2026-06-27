import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch } from './api';
import { setPersonalTokenMirror, setPersonalUserMirror } from './authSession';

export type AuthContextType = 'personal' | 'empresas';

interface User {
  userId: string;
  email: string;
  name?: string;
}

import type { RegisterConsentPayload } from '@/types';

interface AuthContextValue {
  userPersonal: User | null;
  tokenPersonal: string | null;
  userEmpresas: User | null;
  tokenEmpresas: string | null;
  isLoading: boolean;
  login: (context: AuthContextType, email: string, password: string) => Promise<{ requires2FA?: boolean } | void>;
  register: (
    name: string,
    email: string,
    password: string,
    consentOptions: { consents: RegisterConsentPayload; policyVersion?: string }
  ) => Promise<void>;
  logout: (context: AuthContextType) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'jwt_token';
const USER_KEY = 'user_data';
const TOKEN_KEY_EMPRESAS = 'jwt_token_empresas';
const USER_KEY_EMPRESAS = 'user_data_empresas';

/** sessionStorage key set after first login so ProtectedRoute can tell a
 *  real session expiry from a first-ever visit. */
export const HAD_SESSION_KEY = 'coda:had_session';

function getKeys(context: AuthContextType) {
  return context === 'empresas'
    ? { token: TOKEN_KEY_EMPRESAS, user: USER_KEY_EMPRESAS }
    : { token: TOKEN_KEY, user: USER_KEY };
}

// Session mirrors live in a leaf module (no imports) to avoid an import cycle
// (auth → api → apiFetch → authEvents → authSession). Re-exported here so existing
// `@/lib/auth` consumers keep working; AuthProvider syncs them via the setters.
export { getPersonalToken, hasPersonalSession } from './authSession';

function loadStoredAuth(context: AuthContextType): { token: string | null; user: User | null } {
  const { token: tk, user: uk } = getKeys(context);
  const storedToken = localStorage.getItem(tk);
  const storedUser = localStorage.getItem(uk);
  if (storedToken && storedUser) {
    try {
      return { token: storedToken, user: JSON.parse(storedUser) };
    } catch {
      localStorage.removeItem(tk);
      localStorage.removeItem(uk);
    }
  }
  return { token: null, user: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Synchronous initialization from localStorage — no flash of
  // unauthenticated state on hard reload.
  const [userPersonal, setUserPersonal] = useState<User | null>(() => loadStoredAuth('personal').user);
  const [tokenPersonal, setTokenPersonal] = useState<string | null>(() => loadStoredAuth('personal').token);
  const [userEmpresas, setUserEmpresas] = useState<User | null>(() => loadStoredAuth('empresas').user);
  const [tokenEmpresas, setTokenEmpresas] = useState<string | null>(() => loadStoredAuth('empresas').token);
  // C1 cookie-primary: la sesión personal se hidrata desde /api/auth/me usando la
  // cookie httpOnly (con Bearer legacy como fallback). `isHydratingPersonal` evita
  // que ProtectedRoute redirija o parpadee antes de que /me resuelva.
  const [isHydratingPersonal, setIsHydratingPersonal] = useState(true);

  // Keep the module-level mirrors in sync so query functions outside React
  // context can call getPersonalToken() / hasPersonalSession().
  useEffect(() => {
    setPersonalTokenMirror(tokenPersonal);
  }, [tokenPersonal]);
  useEffect(() => {
    setPersonalUserMirror(userPersonal);
  }, [userPersonal]);

  // Al montar: hidrata la sesión personal desde la cookie (o el Bearer legacy si
  // todavía hay token en localStorage). Usa `fetch` directo —no `apiFetch`— para
  // NO disparar el evento de sesión-expirada en visitantes anónimos: un 401 aquí
  // solo significa "no autenticado", no "tu sesión venció".
  useEffect(() => {
    let cancelled = false;
    const apiBase = (
      (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? ""
    ).replace(/\/$/, "");
    const legacyToken = localStorage.getItem(TOKEN_KEY);
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/auth/me`, {
          method: "GET",
          credentials: "include",
          headers: legacyToken ? { Authorization: `Bearer ${legacyToken}` } : undefined,
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.user) {
            // C2: la sesión personal vive en la cookie + /me; no persistimos
            // user_data nuevo como fuente de sesión (solo estado React en memoria).
            setUserPersonal(data.user);
          }
        } else if (res.status === 401) {
          // Sin sesión válida (ni cookie ni Bearer): limpiar SOLO el contexto personal.
          // No tocar jwt_token_empresas / user_data_empresas.
          setUserPersonal(null);
          setTokenPersonal(null);
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        }
        // Otros estados (red/5xx): conservar el estado cacheado (no romper sesión local).
      } catch {
        // Error de red/transitorio: conservar cache; no desloguear agresivamente.
      } finally {
        if (!cancelled) setIsHydratingPersonal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (
    context: AuthContextType,
    email: string,
    password: string
  ): Promise<{ requires2FA?: boolean } | void> => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (data.requires2FA) {
      return { requires2FA: true };
    }

    if (!data.token || !data.user) {
      throw new Error('Invalid response from server');
    }

    sessionStorage.setItem(HAD_SESSION_KEY, '1');

    if (context === 'empresas') {
      // Empresas sigue token-based (Bearer/localStorage) — sin cambios.
      const { token: tk, user: uk } = getKeys('empresas');
      localStorage.setItem(tk, data.token);
      localStorage.setItem(uk, JSON.stringify(data.user));
      setTokenEmpresas(data.token);
      setUserEmpresas(data.user);
    } else {
      // Personal cookie-first (C2): la sesión vive en la cookie httpOnly + /me.
      // NO guardamos jwt_token/user_data nuevos; solo estado React. Sin token,
      // los requests personales van cookie-only (ver hasPersonalSession / apiFetch).
      setUserPersonal(data.user);
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    consentOptions: { consents: RegisterConsentPayload; policyVersion?: string }
  ) => {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        password,
        consents: consentOptions.consents,
        policyVersion: consentOptions.policyVersion ?? '1.0',
      }),
    });

    if (!data.token || !data.user) {
      throw new Error('Invalid response from server');
    }

    // Personal cookie-first (C2): la sesión queda en la cookie + /me; no guardamos
    // jwt_token/user_data nuevos, solo estado React.
    sessionStorage.setItem(HAD_SESSION_KEY, '1');
    setUserPersonal(data.user);
  };

  const logout = (context: AuthContextType) => {
    const token = context === 'empresas' ? tokenEmpresas : tokenPersonal;
    // Personal: llamar SIEMPRE al backend para que limpie la cookie de sesión
    // (apiFetch ya manda credentials:include); el Bearer se adjunta solo si existe.
    // Empresas: comportamiento sin cambios (solo si hay token Bearer).
    if (context === 'personal' || token) {
      apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }).catch(() => {});
    }

    const { token: tk, user: uk } = getKeys(context);
    localStorage.removeItem(tk);
    localStorage.removeItem(uk);
    // Clear the "had a session" marker so ProtectedRoute doesn't show the
    // session-expired toast after an explicit logout.
    sessionStorage.removeItem(HAD_SESSION_KEY);

    if (context === 'empresas') {
      setTokenEmpresas(null);
      setUserEmpresas(null);
    } else {
      setTokenPersonal(null);
      setUserPersonal(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        userPersonal,
        tokenPersonal,
        userEmpresas,
        tokenEmpresas,
        isLoading: isHydratingPersonal,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Pasa el contexto ('personal' o 'empresas') para obtener usuario y sesión de ese contexto. Las sesiones son independientes. */
export function useAuth(context: AuthContextType = 'personal') {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  const user = context === 'empresas' ? ctx.userEmpresas : ctx.userPersonal;
  const token = context === 'empresas' ? ctx.tokenEmpresas : ctx.tokenPersonal;
  // C1: personal es cookie-primary → basta con `user` (hidratado desde /me),
  // ya no exige token local. Empresas queda igual (token-based) hasta su propia fase.
  const isAuthenticated = context === 'empresas' ? !!(user && token) : !!user;
  return {
    user,
    token,
    isAuthenticated,
    // Solo personal espera la hidratación de /me; empresas no cambia (sin loading).
    isLoading: context === 'empresas' ? false : ctx.isLoading,
    login: ctx.login,
    register: ctx.register,
    logout: ctx.logout,
  };
}
