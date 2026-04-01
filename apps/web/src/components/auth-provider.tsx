"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthOrg,
  AuthUser,
  OrgRole,
  clearStoredAuth,
  getStoredRole,
  getStoredToken,
  getStoredUser,
  setStoredAuth
} from "../lib/auth";
import { apiFetch } from "../lib/api";

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  org: AuthOrg | null;
  role: OrgRole | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (args: { name: string; email: string; password: string; organizationName: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [org, setOrg] = useState<AuthOrg | null>(null);
  const [role, setRole] = useState<OrgRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedToken = getStoredToken();
    const storedUser = getStoredUser();
    const storedRole = getStoredRole();

    setToken(storedToken);
    setUser(storedUser);
    setRole(storedRole);

    // If we have a token, validate it + fetch the org/user from the backend.
    // This ensures the app is always in sync with the org-first auth model.
    const hydrate = async () => {
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const me = await apiFetch<{ user: AuthUser; organization?: AuthOrg | null; role?: OrgRole }>("/auth/me");
        setUser(me.user);
        setOrg(me.organization ?? null);
        setRole(me.role ?? null);
        // Keep stored user fresh for faster first paint on refresh.
        setStoredAuth(storedToken, me.user, me.role ?? null);
      } catch (err) {
        // Non-401 errors shouldn't brick the UI. 401s are handled in apiFetch.
        console.error("[AuthProvider] /auth/me failed", err);
      } finally {
        setLoading(false);
      }
    };

    hydrate();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await apiFetch<{ token: string; user?: AuthUser | null; role?: OrgRole }>("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password })
    });

    // Some backends return only { token }. Prefer /auth/me as source of truth.
    setStoredAuth(response.token, response.user, response.role ?? null);
    setToken(response.token);
    if (response.user) setUser(response.user);
    if (response.role) setRole(response.role);

    // Fetch org context after login (org-first backend).
    const me = await apiFetch<{ user: AuthUser; organization?: AuthOrg | null; role?: OrgRole }>("/auth/me");
    setUser(me.user);
    setOrg(me.organization ?? null);
    setRole(me.role ?? null);
  };

  const signup = async (args: { name: string; email: string; password: string; organizationName: string }) => {
    const response = await apiFetch<{ token: string; user?: AuthUser | null; role?: OrgRole }>("/auth/signup", {
      method: "POST",
      auth: false,
      body: JSON.stringify(args)
    });

    setStoredAuth(response.token, response.user, response.role ?? null);
    setToken(response.token);
    if (response.user) setUser(response.user);
    if (response.role) setRole(response.role);

    const me = await apiFetch<{ user: AuthUser; organization?: AuthOrg | null; role?: OrgRole }>("/auth/me");
    setUser(me.user);
    setOrg(me.organization ?? null);
    setRole(me.role ?? null);
  };

  const logout = () => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
    setOrg(null);
    setRole(null);
    // Redirect to login page
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const value = useMemo(
    () => ({ token, user, org, role, loading, login, signup, logout }),
    [token, user, org, role, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};
