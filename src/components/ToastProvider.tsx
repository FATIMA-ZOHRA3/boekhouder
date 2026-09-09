"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";

export type ToastType = "success" | "error" | "warning" | "info" | "bookkeeping";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  actionUrl?: string;
  actionLabel?: string;
  dismissing?: boolean;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastType, ReactNode> = {
  success: (
    <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  bookkeeping: (
    <svg className="w-5 h-5 text-[#2E6FA7] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: "border-l-emerald-500",
  error: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
  bookkeeping: "border-l-[#2E6FA7]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    // Start dismiss animation
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = toast.duration ?? 5000;
      setToasts((prev) => [...prev.slice(-4), { ...toast, id }]); // max 5 toasts
      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timers.current.set(id, timer);
      }
    },
    [removeToast]
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[380px] max-w-[calc(100vw-32px)]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`bg-white rounded-xl shadow-lg border border-gray-200 border-l-4 ${BORDER_COLORS[toast.type]} p-4 flex items-start gap-3 transition-all duration-300 ${
              toast.dismissing ? "opacity-0 translate-x-8" : "opacity-100 translate-x-0 animate-slide-in-right"
            }`}
          >
            {ICONS[toast.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight">{toast.title}</p>
              {toast.message && (
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{toast.message}</p>
              )}
              {toast.actionUrl && toast.actionLabel && (
                <a
                  href={toast.actionUrl}
                  className="inline-block mt-1.5 text-xs font-medium text-[#2E6FA7] hover:text-[#12355B] transition-colors"
                >
                  {toast.actionLabel} &rarr;
                </a>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-0.5 rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
