"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

interface PasswordCheck {
  minLength: boolean;
  hasUppercase: boolean;
  hasNumber: boolean;
  isValid: boolean;
}

function checkPasswordStrength(password: string): PasswordCheck {
  const minLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return { minLength, hasUppercase, hasNumber, isValid: minLength && hasUppercase && hasNumber };
}

function PasswordStrengthIndicator({ password }: { password: string }) {
  const checks = checkPasswordStrength(password);
  if (!password) return null;

  const items = [
    { ok: checks.minLength, label: "Minimaal 8 tekens" },
    { ok: checks.hasUppercase, label: "Minimaal 1 hoofdletter" },
    { ok: checks.hasNumber, label: "Minimaal 1 cijfer" },
  ];

  return (
    <div className="mt-3 space-y-1.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2 text-sm">
          {item.ok ? (
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
            </svg>
          )}
          <span className={item.ok ? "text-emerald-700" : "text-gray-500"}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenError("No reset token found");
      return;
    }

    fetch(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setTokenValid(true);
        } else {
          setTokenError(data.error || "Invalid reset link");
        }
      })
      .catch(() => {
        setTokenError("Could not validate the reset link");
      })
      .finally(() => {
        setValidating(false);
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const strength = checkPasswordStrength(password);
    if (!strength.isValid) {
      setError("Password does not meet all requirements");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Password reset failed");
        return;
      }

      router.push("/login?reset=1");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <p className="text-gray-500">Validating...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full">
          <div className="text-center mb-6">
            <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
              Boekhouder
            </Link>
          </div>
          <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
            {tokenError}
          </div>
          <Link
            href="/forgot-password"
            className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Request new reset link
          </Link>
          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              &larr; Terug naar inloggen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
            Boekhouder
          </Link>
          <p className="text-gray-500 mt-2">Set new password</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              placeholder="Minimaal 8 tekens"
            />
            <PasswordStrengthIndicator password={password} />
          </div>

          <div>
            <label htmlFor="passwordConfirm" className="block text-sm font-medium text-gray-700 mb-1.5">
              Repeat password
            </label>
            <input
              id="passwordConfirm"
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              placeholder="Repeat your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl transition-colors"
          >
            {loading ? "Bezig..." : "Change password"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          <Link href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
            &larr; Terug naar inloggen
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
