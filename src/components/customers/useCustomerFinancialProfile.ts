"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface CustomerProfileInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  total: number;
  status: string;
  isCredit: boolean;
}

export interface CustomerProfilePayment {
  id: string;
  date: string;
  amount: number;
  invoiceNumber: string;
}

export interface CustomerFinancialProfile {
  customer: { id: string; name: string; email: string | null; phone: string | null; userId: string };
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    outstanding: number;
    overdue: number;
    invoiceCount: number;
  };
  invoices: CustomerProfileInvoice[];
  invoiceTotalCount: number;
  payments: CustomerProfilePayment[];
  auditEntityIds: string[];
}

export function useCustomerFinancialProfile(customerId: string) {
  const [data, setData] = useState<CustomerFinancialProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    setNotFound(false);
    fetch(`/api/customers/${customerId}/financial-profile`)
      .then((r) => {
        if (r.status === 404) throw new Error("not_found");
        if (!r.ok) throw new Error("request_failed");
        return r.json();
      })
      .then((json) => {
        if (id !== requestId.current) return;
        setData(json);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        if (err instanceof Error && err.message === "not_found") setNotFound(true);
        else setError(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [customerId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  return { data, loading, error, notFound, retry: load };
}
