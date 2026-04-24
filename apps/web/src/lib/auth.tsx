import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch } from './api';

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

/**
 * Module-level mirror of the React auth state token.
 *
 * Query functions scattered across pages used to read localStorage directly;
 * this variable is kept in sync with the React state so they can call
 * `getPersonalToken()` instead. When the user deletes localStorage in DevTools
 * without a hard reload, this still holds the in-memory token so API calls
 * continue to work (and return a real 401 if the JWT is actually expired).
 */
let _personalToken: string | null = localStorage.getItem(TOKEN_KEY);

/** Returns the current personal JWT from React state (not directly from localStorage). */
export function getPersonalToken(): string | null {
  return _personalToken;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userPersonal, setUserPersonal] = useState<User | null>(null);
  const [tokenPersonal, setTokenPersonal] = useState<string | null>(null);
  const [userEmpresas, setUserEmpresas] = useState<User | null>(null);
  const [tokenEmpresas, setTokenEmpresas] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = (context: AuthContextType) => {
      const { token: tk, user: uk } = getKeys(context);
      const storedToken = localStorage.getItem(tk);
      const storedUser = localStorage.getItem(uk);
      if (storedToken && storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          if (context === 'empresas') {
            setTokenEmpresas(storedToken);
            setUserEmpresas(parsed);
          } else {
            setTokenPersonal(storedToken);
            setUserPersonal(parsed);
          }
        } catch {
          localStorage.removeItem(tk);
          localStorage.removeItem(uk);
        }
      }
    };
    load('personal');
    load('empresas');
    setIsLoading(false);
  }, []);

  // Keep the module-level mirror in sync so query functions outside React
  // context can call getPersonalToken() rather than reading localStorage.
  useEffect(() => {
    _personalToken = tokenPersonal;
  }, [tokenPersonal]);

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

    const { token: tk, user: uk } = getKeys(context);
    localStorage.setItem(tk, data.token);
    localStorage.setItem(uk, JSON.stringify(data.user));
    sessionStorage.setItem(HAD_SESSION_KEY, '1');

    if (context === 'empresas') {
      setTokenEmpresas(data.token);
      setUserEmpresas(data.user);
    } else {
      setTokenPersonal(data.token);
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

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(HAD_SESSION_KEY, '1');
    setTokenPersonal(data.token);
    setUserPersonal(data.user);
  };

  const logout = (context: AuthContextType) => {
    const token = context === 'empresas' ? tokenEmpresas : tokenPersonal;
    if (token) {
      apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
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
        isLoading,
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
  const isAuthenticated = !!(user && token);
  return {
    user,
    token,
    isAuthenticated,
    isLoading: ctx.isLoading,
    login: ctx.login,
    register: ctx.register,
    logout: ctx.logout,
  };
}
