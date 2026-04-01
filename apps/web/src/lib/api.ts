import { getStoredToken, clearStoredAuth } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ApiOptions = RequestInit & { auth?: boolean };

export const apiFetch = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  // Default to sending the JWT if present.
  // Callers can explicitly disable by passing { auth: false }.
  const shouldAuth = options.auth ?? true;
  if (shouldAuth) {
    const token = getStoredToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  if (!headers.has("Content-Type") && options.body && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  // Handle 401 Unauthorized (session expired)
  if (res.status === 401) {
    clearStoredAuth();
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      // Avoid redirect loops on auth pages.
      if (path !== "/login" && path !== "/signup" && path !== "/invite") {
        const currentPath = `${window.location.pathname}${window.location.search}`;
        const returnUrl = encodeURIComponent(currentPath);
        window.location.href = `/login?returnUrl=${returnUrl}&reason=expired`;
      }
    }
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const message = errorBody?.error ?? "Request failed";
    const code = errorBody?.code;
    const err = new Error(message);
    // @ts-expect-error attach API error code for UI handling
    err.code = code;
    throw err;
  }

  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
};
