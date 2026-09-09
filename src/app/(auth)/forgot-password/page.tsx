"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Er ging iets mis");
        return;
      }

      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
            Boekhouder
          </Link>
          <p className="text-gray-500 mt-2">Reset password</p>
        </div>

        {sent ? (
          <div>
            <div className="bg-emerald-50 text-emerald-700 rounded-lg px-4 py-3 mb-6 text-sm">
              If this email address is known to us, you will receive an email with instructions to reset your password.
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Also check your spam folder if you don't receive the email within a few minutes.
            </p>
            <Link
              href="/login"
              className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Terug naar inloggen
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-6">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            {error && (
              <div className="bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  E-mailadres
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                  placeholder="uw@email.nl"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3.5 rounded-xl transition-colors"
              >
                {loading ? "Sending..." : "Send recovery email"}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-500">
              <Link href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
                &larr; Terug naar inloggen
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
