"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { Button } from "@/components/ui/Badge";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const verified = searchParams.get("verified") === "1";
  const resetDone = searchParams.get("reset") === "1";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("boekhouder_username");
    if (saved) {
      setUsername(saved);
      setRemember(true);
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEmailNotVerified(false);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.emailNotVerified) {
          setEmailNotVerified(true);
          setUnverifiedEmail(data.email || "");
        }
        setError(data.error || "Login failed");
        return;
      }

      if (remember) {
        localStorage.setItem("boekhouder_username", username);
      } else {
        localStorage.removeItem("boekhouder_username");
      }

      // Route based on role
      if (data.user?.role === "admin") {
        router.push("/admin");
      } else if (data.user?.role === "bookkeeper") {
        router.push("/bookkeeper");
      } else {
        router.push("/client");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    setResendLoading(true);
    setResendSuccess(false);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
      setResendSuccess(true);
    } catch {
      // silently fail
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[540px] bg-[#12355B] flex-col justify-between p-10 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="relative z-10">
          <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={200} height={52} className="brightness-0 invert" priority />
        </div>
        <div className="relative z-10 space-y-6">
          <h1 className="text-3xl xl:text-4xl font-bold text-white leading-tight">
            Your bookkeeping,<br />
            <span className="text-indigo-400">clear and organized.</span>
          </h1>
          <p className="text-white/70 text-base leading-relaxed max-w-sm">
            Manage your invoices, view your tax overviews, and stay in control of your bookkeeping &mdash; all in one place.
          </p>
        </div>

        {/* Illustration: laptop with mini dashboard, calculator, plant, floating checked document */}
        <div className="relative z-10 -mb-2">
          <svg viewBox="0 0 440 260" className="w-full max-w-[420px] mx-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* soft ground shadow */}
            <ellipse cx="220" cy="248" rx="150" ry="10" fill="#0B2440" opacity="0.5" />

            {/* laptop base */}
            <path d="M96 200h248l14 22a8 8 0 01-7 12H89a8 8 0 01-7-12l14-22z" fill="#1F4E74" />
            <rect x="118" y="196" width="204" height="6" rx="2" fill="#16385A" />

            {/* laptop screen */}
            <rect x="118" y="70" width="204" height="130" rx="6" fill="#0F2D4C" />
            <rect x="126" y="78" width="188" height="114" rx="2" fill="#E9F2FB" />

            {/* dashboard content inside screen */}
            <rect x="136" y="88" width="70" height="8" rx="2" fill="#BBDCF0" />
            {/* line chart */}
            <polyline points="136,140 152,122 168,132 184,108 200,118" fill="none" stroke="#245A87" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {/* bar chart */}
            <rect x="218" y="120" width="10" height="24" rx="1.5" fill="#5FA8DE" />
            <rect x="233" y="104" width="10" height="40" rx="1.5" fill="#2E6FA7" />
            <rect x="248" y="116" width="10" height="28" rx="1.5" fill="#5FA8DE" />
            <rect x="263" y="96" width="10" height="48" rx="1.5" fill="#245A87" />
            {/* donut */}
            <circle cx="163" cy="172" r="20" fill="none" stroke="#BBDCF0" strokeWidth="9" />
            <path d="M163 152a20 20 0 0116.5 31.4" fill="none" stroke="#2E6FA7" strokeWidth="9" strokeLinecap="round" />
            {/* small progress bars */}
            <rect x="200" y="162" width="94" height="6" rx="3" fill="#D7E9F8" />
            <rect x="200" y="162" width="60" height="6" rx="3" fill="#2E6FA7" />
            <rect x="200" y="176" width="94" height="6" rx="3" fill="#D7E9F8" />
            <rect x="200" y="176" width="36" height="6" rx="3" fill="#5FA8DE" />

            {/* potted plant */}
            <path d="M345 150c-14-4-22-18-18-34 12 2 24 12 26 26M357 148c11-7 15-22 7-35-11 5-19 17-18 31" fill="#2E6FA7" opacity="0.85" />
            <rect x="336" y="148" width="30" height="34" rx="3" fill="#1F4E74" />
            <path d="M334 148h34l-4 10h-26z" fill="#245A87" />

            {/* calculator */}
            <rect x="270" y="150" width="58" height="76" rx="8" fill="#2E6FA7" />
            <rect x="278" y="158" width="42" height="16" rx="3" fill="#0F2D4C" />
            {[0, 1, 2].map((row) => (
              <g key={row}>
                {[0, 1, 2].map((col) => (
                  <rect key={col} x={278 + col * 15} y={182 + row * 14} width="10" height="10" rx="2" fill="#BBDCF0" />
                ))}
              </g>
            ))}

            {/* floating document with checkmark */}
            <g transform="translate(60 150) rotate(-6)">
              <rect width="66" height="86" rx="6" fill="#F2F7FB" stroke="#BBDCF0" strokeWidth="1" />
              <rect x="10" y="14" width="46" height="5" rx="2.5" fill="#8FC7EC" />
              <rect x="10" y="26" width="34" height="5" rx="2.5" fill="#BBDCF0" />
              <rect x="10" y="38" width="40" height="5" rx="2.5" fill="#BBDCF0" />
              <circle cx="33" cy="64" r="15" fill="#2E6FA7" />
              <path d="M26 64l5 5 10-10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          </svg>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-indigo-500/30 border-2 border-[#12355B] flex items-center justify-center text-xs text-white font-medium">JV</div>
            <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-[#12355B] flex items-center justify-center text-xs text-white font-medium">MO</div>
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 border-2 border-[#12355B] flex items-center justify-center text-xs text-white font-medium">PB</div>
          </div>
          <p className="text-white/50 text-sm">Trusted by business owners</p>
          <svg className="w-5 h-5 text-white/30 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4c-2.2 3-2.2 7 0 16-2.2-9-2.2-13 0-16zM12 4c2.2 3 2.2 7 0 16 2.2-9 2.2-13 0-16z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 9c1 4 4 7 8 8M4 9c2.5 1 4 3 4.5 6M4 9c1.5-1 3.5-1 5 .5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 9c-1 4-4 7-8 8M20 9c-2.5 1-4 3-4.5 6M20 9c-1.5-1-3.5-1-5 .5" />
          </svg>
        </div>
      </div>

      {/* Right panel - login form */}
      <div
        className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-12 bg-slate-50 relative"
        style={{ backgroundImage: "radial-gradient(#CBD9E8 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      >
        <div className="w-full max-w-[420px] bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-gray-100 px-8 py-10 sm:px-10">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Image src="/logo.svg" alt="HAMZA Deboekhouder" width={170} height={44} priority />
          </div>

          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-full bg-[#12355B] flex items-center justify-center mb-4">
              <svg viewBox="0 0 136 190" className="w-5 h-7" fill="white">
                <path d="M91,8v30h-16V0H30v30H0v152h45v-30h15v38h45v-30h31V8h-45ZM30,167h-15V46h15v121ZM60,137h-15V16h15v121ZM90,175h-15V54h15v121ZM121,144h-15V23h15v121Z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-1.5">Log in to your account</p>
          </div>

          {registered === "verify" && (
            <div className="bg-indigo-50 text-[#12355B] rounded-2xl px-4 py-3 mb-6 text-sm border border-indigo-100">
              Your account has been created. Check your email to verify your account before you can log in.
            </div>
          )}

          {registered === "1" && (
            <div className="bg-emerald-50 text-emerald-700 rounded-2xl px-4 py-3 mb-6 text-sm border border-emerald-200">
              Account successfully created. Welcome! You can now log in.
            </div>
          )}

          {verified && (
            <div className="bg-emerald-50 text-emerald-700 rounded-2xl px-4 py-3 mb-6 text-sm border border-emerald-200">
              Your email address has been successfully verified. You can now log in.
            </div>
          )}

          {resetDone && (
            <div className="bg-emerald-50 text-emerald-700 rounded-2xl px-4 py-3 mb-6 text-sm border border-emerald-200">
              Your password has been changed successfully. You can now log in with your new password.
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 rounded-2xl px-4 py-3 mb-6 text-sm border border-red-200">
              {error}
              {emailNotVerified && (
                <div className="mt-3">
                  {resendSuccess ? (
                    <p className="text-emerald-700">A new verification email has been sent.</p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resendLoading}
                      className="text-indigo-600 hover:text-indigo-700 font-medium underline"
                    >
                      {resendLoading ? "Sending..." : "Send new verification email"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-900 mb-1.5">
                Username
              </label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0ZM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                  placeholder="you@email.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-900 mb-1.5">
                Password
              </label>
              <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-11 pr-11 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm text-gray-500">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" disabled={loading} className="w-full py-3.5 text-base rounded-xl flex items-center justify-center gap-2">
              {loading ? "Logging in..." : (
                <>
                  Log in
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <Link
            href="/advisory"
            className="flex items-center justify-center gap-2 bg-white hover:bg-indigo-50 text-indigo-600 font-medium py-3 px-5 rounded-xl transition-colors text-sm w-full border border-gray-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            I&apos;d like an introductory call
          </Link>

          <div className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account yet?{" "}
            <Link href="/register" className="text-indigo-600 hover:text-indigo-700 font-medium transition-colors">
              Register
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
