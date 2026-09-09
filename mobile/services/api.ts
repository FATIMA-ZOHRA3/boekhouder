import Constants from "expo-constants";
import * as SecureStore from "@/lib/storage";

// The existing backend authenticates the web app via an httpOnly session
// cookie, which this native app can't read or persist the way a browser
// does. Rather than build a second auth system, the backend was given one
// small additive change (see the project's src/lib/auth.ts): every route
// that already calls getSession() also accepts
// `Authorization: Bearer <sessionId>` as a fallback to the cookie. This
// file stores that raw session id (returned by POST /api/auth/login) in
// SecureStore and attaches it to every request below.
const SESSION_KEY = "boekhouder_session_id";
// GET /api/profile (used to restore a session on app launch) doesn't
// return the user's role, and there's no separate "whoami" endpoint — so
// the role returned at login time is cached here too, purely so the app
// can show/hide staff-only UI (like the AI document scanner) after a
// restart without an extra round trip. It's never used for anything
// security-sensitive: every route still re-checks the role server-side.
const ROLE_KEY = "boekhouder_role";

export function getApiBaseUrl(): string {
  const url =
    process.env.EXPO_PUBLIC_API_URL ||
    (Constants.expoConfig?.extra?.apiUrl as string | undefined);
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. Copy mobile/.env.example to mobile/.env and point it at your backend (see the file for how to find your computer's LAN IP)."
    );
  }
  return url.replace(/\/$/, "");
}

export async function getStoredSessionId(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function setStoredSessionId(sessionId: string): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, sessionId);
}

export async function clearStoredSessionId(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(ROLE_KEY);
}

export async function getStoredRole(): Promise<string | null> {
  return SecureStore.getItemAsync(ROLE_KEY);
}

export async function setStoredRole(role: string): Promise<void> {
  await SecureStore.setItemAsync(ROLE_KEY, role);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  method?: string;
  url?: string;
  constructor(status: number, message: string, body?: unknown, method?: string, url?: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.method = method;
    this.url = url;
  }
}

// Thrown specifically on 401 so the app-wide auth guard can log the user
// out and redirect to /login without every screen having to check for it.
export class UnauthorizedError extends ApiError {
  constructor(body?: unknown) {
    super(401, "Session expired", body);
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  // For multipart uploads (document scanner) — pass a FormData body and
  // this flag so we don't force a JSON content-type over it.
  isFormData?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(getApiBaseUrl() + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const sessionId = await getStoredSessionId();
  const method = options.method || "GET";
  const url = buildUrl(path, options.query);

  const headers: Record<string, string> = {};
  if (sessionId) headers["Authorization"] = `Bearer ${sessionId}`;
  if (!options.isFormData) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.isFormData
        ? (options.body as FormData)
        : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
    });
  } catch {
    // Network layer failure (no connection, host unreachable, timeout) —
    // distinct from a backend error response, so the UI can show
    // "Check your connection" instead of a server error message.
    throw new ApiError(0, "Connection lost. Please check your internet connection and try again.", undefined, method, url);
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (response.status === 401) {
    throw new UnauthorizedError(payload);
  }

  if (!response.ok) {
    // Pre-existing TS nit (unrelated to PART 1/2 of this fix): the `&&`
    // chain below is provably a string or a falsy value at runtime, but
    // TypeScript widens it to `string | {}`, which ApiError's
    // constructor (typed to take a `string`) rejects. An explicit
    // `String(...)` makes the type honest instead of narrowing with an
    // `as` that could hide a real future mismatch.
    const message =
      (payload && typeof payload === "object" && "error" in payload && (payload as { error?: string }).error) ||
      `Request failed (${response.status})`;
    // Dev-only diagnostic: method/URL/status/body, never headers or the
    // session token — so a failed AI call (e.g. voice-invoice/parse-item)
    // can be debugged from the Metro/console log without exposing
    // secrets. See the Voice Invoice screen for how the UI surfaces this.
    if (__DEV__) {
      console.warn(`[API] ${method} ${path} -> ${response.status}`, payload);
    }
    throw new ApiError(response.status, String(message), payload, method, url);
  }

  return payload as T;
}