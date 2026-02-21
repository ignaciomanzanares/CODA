import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiFetch } from './api';

export type AuthContextType = 'personal' | 'empresas';

interface User {
  userId: string;
  email: string;
  name?: string;
}

interface AuthContextValue {
  userPersonal: User | null;
  tokenPersonal: string | null;
  userEmpresas: User | null;
  tokenEmpresas: string | null;
  isLoading: boolean;
  login: (context: AuthContextType, email: string, password: string) => Promise<{ requires2FA?: boolean } | void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: (context: AuthContextType) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'jwt_token';
const USER_KEY = 'user_data';
const TOKEN_KEY_EMPRESAS = 'jwt_token_empresas';
const USER_KEY_EMPRESAS = 'user_data_empresas';

function getKeys(context: AuthContextType) {
  return context === 'empresas'
    ? { token: TOKEN_KEY_EMPRESAS, user: USER_KEY_EMPRESAS }
    : { token: TOKEN_KEY, user: USER_KEY };
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

    if (context === 'empresas') {
      setTokenEmpresas(data.token);
      setUserEmpresas(data.user);
    } else {
      setTokenPersonal(data.token);
      setUserPersonal(data.user);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!data.token || !data.user) {
      throw new Error('Invalid response from server');
    }

    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
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
