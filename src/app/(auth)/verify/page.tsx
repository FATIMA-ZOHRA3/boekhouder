"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

function VerifyForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found");
      return;
    }

    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatus("success");
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Verification failed");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Something went wrong while verifying");
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 max-w-md w-full text-center">
        <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors">
          Boekhouder
        </Link>

        {status === "loading" && (
          <div className="mt-8">
            <p className="text-gray-500">Bezig with verifi&euml;ren...</p>
          </div>
        )}

        {status === "success" && (
          <div className="mt-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">E-mail geverifieerd!</h2>
            <p className="text-gray-500 mb-6">Your email address has been successfully verified. You can now log in.</p>
            <Link
              href="/login?verified=1"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Go to login
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="mt-8">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verification failed</h2>
            <p className="text-red-600 mb-6 text-sm">{errorMsg}</p>
            <Link
              href="/login"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl transition-colors"
            >
              Terug naar inloggen
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
