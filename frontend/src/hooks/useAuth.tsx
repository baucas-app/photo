import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiJson, AUTH_EXPIRED_EVENT, clearTokens, getAccessToken, storeTokens } from "../api/client";
import { clearApiKey, revokeAndClearApiKey, ensureApiKey } from "../api/apiKey";
import type { User } from "../api/types";

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  name?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithTokens: (tokens: OAuthTokens) => void;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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

  // Refresh token expired/invalid mid-session: drop the user so
  // ProtectedRoute redirects to /login instead of leaving a "logged in"
  // UI where every request silently fails.
  useEffect(() => {
    const onExpired = () => {
      clearApiKey();
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
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

  const loginWithTokens = useCallback((tokens: OAuthTokens) => {
    storeTokens(tokens.accessToken, tokens.refreshToken);
    setUser({ id: tokens.userId, email: tokens.email, name: tokens.name ?? null, role: "user" });
    void ensureApiKey();
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    revokeAndClearApiKey();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await apiJson<User>("/auth/me");
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, loginWithTokens, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
