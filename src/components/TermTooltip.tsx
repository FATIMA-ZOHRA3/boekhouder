"use client";

import { useState, useRef, useEffect } from "react";
import { GLOSSARY } from "@/lib/glossary";

// Task #12: wrap any jargon word in the UI with this component to give it a plain-language
// explanation on hover (desktop) or tap (mobile) — no page-specific wiring, just point it
// at a key in the central glossary (src/lib/glossary.ts).
//
//   <TermTooltip term="lettering">lettering</TermTooltip>
//
// If `term` isn't in the glossary, this renders the children as plain text with no tooltip
// affordance — a typo'd key fails safe (no dead "?" button) rather than showing an empty
// popover.
export default function TermTooltip({ term, children }: { term: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const definition = GLOSSARY[term];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!definition) return <>{children}</>;

  return (
    <span ref={ref} className="relative inline-block">
      <span
        className="border-b border-dotted border-gray-400 cursor-help"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        tabIndex={0}
        role="button"
        aria-label={`Uitleg: ${term}`}
      >
        {children}
      </span>
      {open && (
        <span className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 bg-[#12355B] text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none">
          {definition}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#12355B]" />
        </span>
      )}
    </span>
  );
}
