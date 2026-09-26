import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiJson, clearTokens, getAccessToken, storeTokens } from "../api/client";
import { clearApiKey, ensureApiKey } from "../api/apiKey";
import type { User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      setIsLoading(false);
      return;
    }
    apiJson<User>("/auth/me")
      .then((u) => {
        setUser(u);
        void ensureApiKey();
      })
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiJson<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    storeTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    await ensureApiKey();
  }, []);

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const data = await apiJson<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    });
    storeTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    await ensureApiKey();
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    clearApiKey();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
