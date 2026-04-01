export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
};

export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

export type AuthOrg = {
  id: string;
  name: string;
};

const TOKEN_KEY = "propai_token";
const USER_KEY = "propai_user";
const ROLE_KEY = "propai_role";

export const getStoredToken = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
};

export const getStoredUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

export const getStoredRole = (): OrgRole | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ROLE_KEY);
  if (!raw) return null;
  if (raw === "OWNER" || raw === "ADMIN" || raw === "MEMBER") return raw;
  return null;
};

export const setStoredAuth = (token: string, user?: AuthUser | null, role?: OrgRole | null) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  if (role) {
    window.localStorage.setItem(ROLE_KEY, role);
  }
};

export const clearStoredAuth = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(ROLE_KEY);
};
