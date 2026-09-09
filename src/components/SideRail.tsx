"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface SideRailItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  /** Optional badge rendered at the top-right of the icon. */
  badge?: ReactNode;
  /** Extra click handler (runs alongside navigation). */
  onSelect?: () => void;
}

const COLLAPSED = 44;
const EXPANDED = 200;
// 100 / 75 / 50 / 25 % wave scaled by distance from the hovered tile.
// Items at distance >= 4 stay collapsed (icon-only).
const WAVE_SCALES = [1, 0.75, 0.5, 0.25];
function widthForDistance(distance: number): number {
  if (distance >= WAVE_SCALES.length) return COLLAPSED;
  return COLLAPSED + (EXPANDED - COLLAPSED) * WAVE_SCALES[distance];
}

interface SideRailProps {
  items: SideRailItem[];
  activeKey?: string;
  /**
   * When true the sidebar is in its wide labelled mode: items render as
   * full-width rows with icon + label + badge, no wave hover. When false
   * (default) the sidebar stays at icon-only width and the premium wave
   * hover takes over.
   */
  expanded?: boolean;
}

/**
 * Sidebar rail with two render modes:
 *
 *   - **Collapsed (default)** — narrow icon rail with the wave hover
 *     effect (100 / 75 / 50 / 25 % expansion around the cursor, label
 *     revealed inside an expanding portal pill). See `CollapsedWaveRail`.
 *   - **Expanded** — wide labelled list, no wave; each item renders
 *     inline as `[icon] [label] [badge]`. See `ExpandedRail`.
 *
 * The two are swapped wholesale rather than morphing one into the other
 * — the interaction patterns are too different to share markup, and the
 * surrounding aside already animates its width so the visual transition
 * feels continuous from the user's perspective.
 */
export function SideRail({ items, activeKey, expanded = false }: SideRailProps) {
  if (expanded) return <ExpandedRail items={items} activeKey={activeKey} />;
  return <CollapsedWaveRail items={items} activeKey={activeKey} />;
}

/* -------------------------------------------------------------------- */
/* Expanded mode — labelled rows, simple bg hover.                       */
/* -------------------------------------------------------------------- */
function ExpandedRail({ items, activeKey }: { items: SideRailItem[]; activeKey?: string }) {
  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2">
      {items.map((item) => {
        const isActive = activeKey === item.key;
        return (
          <div
            key={item.key}
            data-rail-item={item.key}
            className="relative"
          >
            <Link
              href={item.href}
              onClick={item.onSelect}
              aria-label={item.label}
              className={`relative flex items-center gap-3 h-10 pl-3 pr-2 rounded-lg text-[13px] font-medium transition-colors duration-150 text-[#E4E9F5] ${
                isActive
                  ? "bg-[#2E6FA7]/20"
                  : "hover:bg-white/5"
              }`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#2E6FA7] rounded-r-full" />
              )}
              <span className="w-[18px] h-[18px] shrink-0 flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px]">
                {item.icon}
              </span>
              <span className="flex-1 min-w-0 truncate text-left">{item.label}</span>
              {item.badge && (
                <span className="shrink-0 flex items-center">{item.badge}</span>
              )}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------- */
/* Collapsed mode — icon-only rail with the multi-pill wave hover.       */
/* -------------------------------------------------------------------- */
function CollapsedWaveRail({ items, activeKey }: { items: SideRailItem[]; activeKey?: string }) {
  const tileRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [tileRects, setTileRects] = useState<Record<string, { top: number; left: number }>>({});

  const hoveredIndex = hoveredKey ? items.findIndex((i) => i.key === hoveredKey) : -1;

  // Measure tile coordinates so the portal pills can match them. Re-
  // measures on resize and on any ancestor scroll (capture phase) so the
  // pills stay glued to their tiles even when the rail's scroll
  // container moves them around. Initial render has empty tileRects so
  // each portal pill bails out (`if (!rect) return null`) until this
  // effect populates them.
  useLayoutEffect(() => {
    function measure() {
      const next: Record<string, { top: number; left: number }> = {};
      for (const item of items) {
        const el = tileRefs.current[item.key];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        next[item.key] = { top: rect.top, left: rect.left };
      }
      setTileRects(next);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [items]);

  return (
    <>
      {/* Rail tiles — pure layout placeholders. Each tile reserves
          vertical space and hosts the `data-rail-item` attribute used
          by the layout's module-popups, but renders no chrome of its
          own. The portal pills below own the icon, label, and click
          target — keeping a separate icon here would visibly overlap
          the pill's icon as soon as a wave neighbour expanded
          (because their bgs are intentionally translucent), producing
          the duplicate-icon ghost the user reported. */}
      <nav className="flex flex-col gap-1 px-1.5 py-2">
        {items.map((item) => (
          <div
            key={item.key}
            ref={(el) => {
              tileRefs.current[item.key] = el;
            }}
            data-rail-item={item.key}
            className="w-11 h-11"
          />
        ))}
      </nav>

      {/* Portal pills — one per item, always mounted after hydration.
          Width morphs from 44 → 200 / 161 / 122 / 83 / 44 px based on
          distance to the hovered tile. CSS transition turns cursor
          movement along the rail into a continuous ripple. */}
      {typeof document !== "undefined" && createPortal(
        <>
          {items.map((item, idx) => {
            const rect = tileRects[item.key];
            if (!rect) return null;
            const distance = hoveredIndex >= 0 ? Math.abs(idx - hoveredIndex) : 999;
            const width = hoveredIndex < 0 ? COLLAPSED : widthForDistance(distance);
            const isHovered = item.key === hoveredKey;
            const isActive = activeKey === item.key;
            const inWave = distance < WAVE_SCALES.length;

            const pillBg = isHovered
              ? "bg-[#101A3D] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.55)] ring-1 ring-white/10"
              : isActive
              ? "bg-[#2E6FA7]/40"
              : inWave
              ? "bg-[#101A3D]/85"
              : "bg-transparent";
            // Icon + label content always renders at full opacity in
            // the brand off-white (#E4E9F5). Pill bg carries the very
            // slight translucency that gives the glass feel — it never
            // comes from fading the inner content. Wave neighbours used
            // to use bg-white/[0.06] which over the teal rail was
            // basically invisible; bg-[#101A3D]/85 is the same dark
            // teal as the hovered pill at 85 % so the partial pill
            // shape reads clearly at every expansion level.
            const textColor = "text-[#E4E9F5]";

            return (
              <div
                key={item.key}
                className="fixed z-[60]"
                style={{
                  top: rect.top,
                  left: rect.left,
                  width,
                  height: COLLAPSED,
                  transition: "width 240ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
                onMouseEnter={() => setHoveredKey(item.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <Link
                  href={item.href}
                  onClick={item.onSelect}
                  aria-label={item.label}
                  className={`relative block w-full h-full rounded-xl overflow-hidden whitespace-nowrap transition-[background-color,box-shadow] duration-200 ${pillBg} ${textColor}`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#2E6FA7] rounded-r-full z-10" />
                  )}
                  {/* Label — `absolute inset-0` so it fills the pill
                      behind the icon. `pr-12` reserves the icon's
                      44 px column on the right so the label never
                      overlaps it visually. Visible on every wave-
                      expanded tile (0-3 distance) at full opacity in
                      the brand off-white; the 80 ms delay keeps the
                      reveal coupled to the width morph. */}
                  <span
                    className="absolute inset-0 flex items-center pl-3 pr-12 truncate text-[13px] font-medium transition-opacity"
                    style={{
                      opacity: inWave ? 1 : 0,
                      transitionDuration: "200ms",
                      transitionDelay: inWave ? "80ms" : "0ms",
                    }}
                  >
                    {item.label}
                  </span>
                  {/* Icon — `absolute right-0 top-0 w-11 h-11`,
                      pinned to the right edge of the pill. At pill
                      width 44 (idle / out-of-wave) the span IS the
                      whole pill, so the 18 × 18 SVG sits perfectly
                      centred in the 44 × 44 button — that's the
                      alignment fix. As the pill grows the span stays
                      anchored on the right, so the icon visually
                      slides RIGHT and the wave reveal motion is
                      preserved unchanged. */}
                  <span className="absolute right-0 top-0 w-11 h-11 flex items-center justify-center [&>svg]:w-[18px] [&>svg]:h-[18px]">
                    {item.icon}
                  </span>
                </Link>
                {item.badge && (
                  <span className="absolute top-0.5 right-[-2px] z-20 pointer-events-auto">
                    {item.badge}
                  </span>
                )}
              </div>
            );
          })}
        </>,
        document.body
      )}
    </>
  );
}
