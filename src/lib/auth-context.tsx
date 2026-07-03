"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

// ---- 类型 ----

export interface AuthUser {
  userId: string;
  email: string;
  token: string;
  sessions: SessionSummary[];
}

export interface SessionSummary {
  sessionId: string;
  status: string;
  currentStep: string;
  submittedAt: string | null;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshHistory: () => Promise<void>;
  history: SessionSummary[];
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---- token 持久化（localStorage） ----

const TOKEN_KEY = "healthcare_auth_token";
const USER_KEY = "healthcare_auth_user";

function saveAuth(token: string, user: { userId: string; email: string }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function loadAuth(): { token: string; user: { userId: string; email: string } } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const userJson = localStorage.getItem(USER_KEY);
  if (token && userJson) {
    try {
      return { token, user: JSON.parse(userJson) };
    } catch {
      clearAuth();
    }
  }
  return null;
}

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ---- Provider ----

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);

  const clearError = useCallback(() => setError(null), []);

  // 启动时从 localStorage 恢复登录状态
  useEffect(() => {
    const saved = loadAuth();
    if (saved) {
      setUser({ ...saved.user, token: saved.token, sessions: [] });
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/auth/history", {
        headers: { Authorization: `Bearer ${user.token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.sessions)) {
        setHistory(data.sessions);
        setUser((prev) => prev ? { ...prev, sessions: data.sessions } : prev);
      }
    } catch {
      // 静默失败
    }
  }, [user]);

  // 登录后自动拉取历史
  useEffect(() => {
    if (user) {
      refreshHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  const register = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "注册失败");
      }
      saveAuth(data.token, { userId: data.userId, email: data.email });
      setUser({ userId: data.userId, email: data.email, token: data.token, sessions: data.sessions || [] });
      setHistory(data.sessions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "注册失败");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "登录失败");
      }
      saveAuth(data.token, { userId: data.userId, email: data.email });
      setUser({ userId: data.userId, email: data.email, token: data.token, sessions: data.sessions || [] });
      setHistory(data.sessions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setHistory([]);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, register, login, logout, refreshHistory, history, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
