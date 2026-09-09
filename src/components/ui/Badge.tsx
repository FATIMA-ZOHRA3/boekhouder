import type { ButtonHTMLAttributes, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Badge — semantic status pill. Colors stay semantic (red=critical,
// amber=warning, emerald=success, blue/gray=neutral) per the design brief —
// only the primary brand accent moves to blue (via the indigo-* scale, which
// is remapped to the brand blue in globals.css), status colors are untouched
// so meaning stays instantly recognizable across the whole app.
// ---------------------------------------------------------------------------
export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "primary";

const BADGE_TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-blue-50 text-blue-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  primary: "bg-indigo-50 text-indigo-700",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: BadgeTone; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${BADGE_TONE_CLASS[tone]} ${className}`}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Button — primary/secondary/ghost, brand blue as the primary accent
// (indigo-* classes below resolve to the brand blue via globals.css).
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost";

const BUTTON_VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
  secondary: "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50",
  ghost: "text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: { children: ReactNode; variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${BUTTON_VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
