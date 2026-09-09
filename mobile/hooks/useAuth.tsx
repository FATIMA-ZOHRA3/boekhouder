import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getStoredSessionId, clearStoredSessionId, getStoredRole, UnauthorizedError } from "@/services/api";
import { login as loginRequest, logout as logoutRequest, getProfile, type Profile } from "@/services/auth";
import type { Role } from "@/types/api";

type AuthState = {
  status: "loading" | "signed-out" | "signed-in";
  profile: Profile | null;
  role: Role | null;
  isStaff: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Called by the API layer (or any screen) when a request comes back 401 —
  // clears local state so the protected-route guard redirects to /login.
  handleUnauthorized: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restoreSession = useCallback(async () => {
    const sessionId = await getStoredSessionId();
    if (!sessionId) {
      setStatus("signed-out");
      return;
    }
    try {
      // There's no dedicated "whoami" endpoint, so re-using GET /api/profile
      // both confirms the stored session is still valid and gives us the
      // profile data the dashboard/profile screens need anyway. Role isn't
      // part of that response, so it's read back from the cache written at
      // login time (see services/auth.ts) — display-only, every route still
      // re-checks the real role server-side.
      const [me, cachedRole] = await Promise.all([getProfile(), getStoredRole()]);
      setProfile(me);
      setRole((cachedRole as Role) ?? null);
      setStatus("signed-in");
    } catch {
      await clearStoredSessionId();
      setStatus("signed-out");
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const user = await loginRequest(username, password);
      const me = await getProfile();
      setProfile(me);
      setRole(user.role);
      setStatus("signed-in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setProfile(null);
    setRole(null);
    setStatus("signed-out");
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearStoredSessionId();
    setProfile(null);
    setRole(null);
    setStatus("signed-out");
  }, []);

  const isStaff = role === "bookkeeper" || role === "admin";

  return (
    <AuthContext.Provider value={{ status, profile, role, isStaff, error, login, logout, handleUnauthorized }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { UnauthorizedError };
