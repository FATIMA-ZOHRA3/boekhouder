import { cookies, headers } from "next/headers";
import { v4 as uuid } from "uuid";
import bcrypt from "bcrypt";
import { prisma } from "./prisma";

// --- Session management ---

const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes

export async function createSession(userId: string) {
  const session = await prisma.session.create({
    data: { id: uuid(), userId, lastActivity: new Date() },
  });

  const cookieStore = await cookies();
  cookieStore.set("boekhouder_session", session.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return session;
}

// Mobile (React Native/Expo) support ----------------------------------------
// The web app authenticates purely via the httpOnly `boekhouder_session`
// cookie, which a native client can't read or persist the way a browser
// does. Rather than build a second auth system, the mobile app reuses the
// exact same Session rows: /api/auth/login now also returns the raw
// session id in its JSON body (additive field, ignored by the existing web
// client), the mobile app stores it in SecureStore, and sends it back as
// `Authorization: Bearer <sessionId>` on every request. getSession() below
// just checks that header as a fallback when there is no session cookie —
// every one of the ~90 existing routes that calls getSession()/
// refreshSession()/destroySession() with no arguments keeps working
// unchanged for both clients, nothing else had to be touched.
async function getBearerSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization") || headerStore.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

async function getIncomingSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieSessionId = cookieStore.get("boekhouder_session")?.value;
  if (cookieSessionId) return cookieSessionId;
  return getBearerSessionId();
}

// Roles are stored as a free-text column on User (see prisma/schema.prisma), but every
// call site treats it as one of these three values. Centralized here (rather than in
// permissions.ts) so this file's return type can reference it without a circular import.
export type Role = "client" | "bookkeeper" | "admin";

export type Session = {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivity: Date;
  role: Role;
};

export async function getSession(): Promise<Session | null> {
  const sessionId = await getIncomingSessionId();
  if (!sessionId) return null;

  // Pilier 2 (sécurité/permissions): the role is now fetched in this same query
  // (one extra `include`, not an extra round-trip) so every route can authorize
  // via `requirePermission()`/`requireRole()` without re-querying the user itself.
  // All pre-existing fields (id, userId, createdAt, lastActivity) are unchanged —
  // this is purely additive, existing callers that only read those keep working.
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { role: true } } },
  });
  if (!session) return null;

  // Check inactivity timeout (30 minutes)
  if (Date.now() - session.lastActivity.getTime() > SESSION_INACTIVITY_MS) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    const cookieStore = await cookies();
    cookieStore.delete("boekhouder_session");
    return null;
  }

  const { user, ...rest } = session;
  return { ...rest, role: (user?.role as Role) ?? "client" };
}

export async function refreshSession() {
  const sessionId = await getIncomingSessionId();
  if (!sessionId) return null;

  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { lastActivity: new Date() },
  }).catch(() => null);

  return session;
}

export async function destroySession() {
  const sessionId = await getIncomingSessionId();
  if (sessionId) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  }
  const cookieStore = await cookies();
  cookieStore.delete("boekhouder_session");
}

// --- Password hashing (bcrypt) ---

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

// --- Email verification tokens ---

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createVerificationToken(userId: string): Promise<string> {
  // Delete existing tokens for this user
  await prisma.verificationToken.deleteMany({ where: { userId } });

  const token = uuid();
  await prisma.verificationToken.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + TOKEN_EXPIRY_MS),
    },
  });
  return token;
}

export async function consumeVerificationToken(token: string): Promise<{ userId: string } | { error: string }> {
  const entry = await prisma.verificationToken.findUnique({ where: { token } });
  if (!entry) return { error: "Invalid verification link" };
  if (new Date() > entry.expiresAt) {
    await prisma.verificationToken.delete({ where: { id: entry.id } });
    return { error: "This verification link has expired. Request a new one." };
  }
  await prisma.verificationToken.delete({ where: { id: entry.id } });
  return { userId: entry.userId };
}

// --- Password reset tokens ---

const RESET_EXPIRY_MS = 1 * 60 * 60 * 1000; // 1 hour

export async function createResetToken(userId: string): Promise<string> {
  await prisma.resetToken.deleteMany({ where: { userId } });

  const token = uuid();
  await prisma.resetToken.create({
    data: {
      token,
      userId,
      expiresAt: new Date(Date.now() + RESET_EXPIRY_MS),
    },
  });
  return token;
}

export async function consumeResetToken(token: string): Promise<{ userId: string } | { error: string }> {
  const entry = await prisma.resetToken.findUnique({ where: { token } });
  if (!entry) return { error: "Invalid reset link" };
  if (entry.used) return { error: "This reset link has already been used" };
  if (new Date() > entry.expiresAt) {
    await prisma.resetToken.delete({ where: { id: entry.id } });
    return { error: "This reset link has expired. Request a new one." };
  }
  await prisma.resetToken.update({ where: { id: entry.id }, data: { used: true } });
  return { userId: entry.userId };
}

export async function validateResetToken(token: string): Promise<{ valid: boolean; error?: string }> {
  const entry = await prisma.resetToken.findUnique({ where: { token } });
  if (!entry) return { valid: false, error: "Invalid reset link" };
  if (entry.used) return { valid: false, error: "This reset link has already been used" };
  if (new Date() > entry.expiresAt) return { valid: false, error: "This reset link has expired" };
  return { valid: true };
}

// --- Password strength validation ---

export interface PasswordCheck {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  isValid: boolean;
}

export function checkPasswordStrength(password: string): PasswordCheck {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return { minLength, hasUppercase, hasNumber, isValid: minLength && hasUppercase && hasNumber };
}

// --- Input validation ---

export function validateKvk(kvk: string): string | null {
  const digits = kvk.replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return "KVK number may only contain digits";
  if (digits.length !== 8) return "KVK number must be exactly 8 digits";
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email address";
  return null;
}

export function validateIban(iban: string): string | null {
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  if (cleaned.length < 15 || cleaned.length > 34) return "IBAN must be between 15 and 34 characters";
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return "Invalid IBAN format (e.g. NL00BANK0123456789)";
  return null;
}

export function validatePhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (!/^(\+?\d{10,13})$/.test(cleaned)) return "Invalid phone number";
  return null;
}
