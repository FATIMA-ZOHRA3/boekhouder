"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function AcceptContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");
  const [quotationNumber, setQuotationNumber] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) { setStatus("error"); setErrorMsg("No valid link"); return; }

    fetch(`/api/quotations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (res) => {
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setQuotationNumber(data.quotationNumber);
      } else {
        if (data.error?.includes("already accepted")) setStatus("already");
        else { setStatus("error"); setErrorMsg(data.error || "Er ging iets mis"); }
      }
    }).catch(() => { setStatus("error"); setErrorMsg("Er ging iets mis"); });
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Processing quotation...</p>
          </>
        )}
        {status === "success" && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Quotation accepted!</h1>
            <p className="text-gray-500 mb-4">Bedankt! Offerte {quotationNumber} was successfully accepted.</p>
            <p className="text-sm text-gray-400">You will receive the invoice soon.</p>
          </>
        )}
        {status === "already" && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Already accepted</h1>
            <p className="text-gray-500">This quotation has already been accepted.</p>
          </>
        )}
        {status === "error" && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Er ging iets mis</h1>
            <p className="text-gray-500">{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function QuotationAcceptPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <AcceptContent />
    </Suspense>
  );
}
