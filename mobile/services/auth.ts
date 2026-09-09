import { apiRequest, clearStoredSessionId, setStoredSessionId, setStoredRole, getStoredRole } from "./api";
import type { Role } from "@/types/api";

export type LoginResponse = {
  success: true;
  user: { id: string; name: string; role: Role; company: string | null };
  sessionId: string;
};

export async function login(username: string, password: string) {
  // Same POST /api/auth/login the web app uses — same validation, same
  // "verify your email first" and "invalid credentials" errors.
  const result = await apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: { username, password },
  });
  await setStoredSessionId(result.sessionId);
  await setStoredRole(result.user.role);
  return result.user;
}

export { getStoredRole };

export async function logout() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
  } finally {
    // Always clear the local token, even if the network call failed —
    // an unreachable backend shouldn't leave the user stuck logged in.
    await clearStoredSessionId();
  }
}

export type Profile = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  vatNumber: string | null;
  kvkNumber: string | null;
  phone: string | null;
  logoUrl: string | null;
};

export function getProfile() {
  // Same GET /api/profile the web app's settings page reads.
  return apiRequest<Profile>("/api/profile");
}

export async function requestPasswordReset(email: string) {
  // Same public POST /api/auth/forgot-password the web app's "forgot
  // password" page calls — always returns {success:true} whether or not
  // the address exists, so the response never reveals which emails are
  // registered. No session/auth header involved.
  return apiRequest<{ success: true }>("/api/auth/forgot-password", {
    method: "POST",
    body: { email },
  });
}
