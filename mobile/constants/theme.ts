// Design tokens for the mobile app. "Ledgerly" sky-blue identity (2026
// refresh): sky blue is the dominant interactive color (buttons, links,
// active states, highlights) on very light, mostly-white surfaces — see
// the redesign brief for the exact swatch this was lifted from. Replaces
// the previous deep-navy identity; every screen reads colors from here,
// so this file is the single place the rebrand happens.

export const colors = {
  // Brand — sky blue is the dominant, "premium fintech" accent.
  brandPrimary: "#0EA5E9", // Primary sky blue — buttons, active tab, filled banners, FAB
  brandPrimaryDeep: "#0284C7", // deeper sky — hero card accents, pressed/emphasis states
  primary: "#0284C7", // deep-enough sky for text/icons/links on white — keeps numbers and
  // labels crisp instead of washed out (bright sky reads great as a fill,
  // not as small text), while still clearly reading as "sky blue".
  primaryHover: "#0369A1",
  primaryLight: "#E0F2FE", // Light Blue — tinted icon tiles, badges, chip fills
  primarySoft: "#BAE6FD", // slightly stronger tint for secondary fills

  // Extra accent (icon tiles, quick-action grid) — kept distinct from the
  // sky-blue identity on purpose (section 2: "don't make everything blue").
  accentPurple: "#6B46C1",
  accentPurpleLight: "#EFEAFB",

  // Surfaces
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceAlt: "#F0F9FF", // Very Light Blue — avatar rings, subtle fills inside cards
  border: "#E2E8F0",
  overlayOnBrand: "rgba(14,165,233,0.08)", // faint sky tint for decorative circles on light cards

  // Text
  textPrimary: "#0F172A", // Main Text
  textSecondary: "#64748B", // Secondary Text
  textMuted: "#94A3B8",
  textOnPrimary: "#FFFFFF",
  textOnPrimaryMuted: "#EAF6FE", // near-white, faint sky tint — muted labels on filled sky surfaces

  // Status
  success: "#22C55E",
  successLight: "#DCFCE7",
  warning: "#F59E0B",
  warningLight: "#FEF3C7",
  danger: "#EF4444",
  dangerLight: "#FEE2E2",
  info: "#0284C7",
  infoLight: "#E0F2FE",
  neutral: "#64748B",
  neutralLight: "#F1F5F9",
} as const;

// Tinted icon-tile palette — one {bg, fg} pair per quick-action / shortcut
// tile, cycled across the app so a given entity (invoices, purchases,
// alerts, profile, clients…) always reads with the same accent wherever
// its tile shows up (home grid, section icons, list-row leading icons).
export const tileTones = {
  blue: { bg: colors.primaryLight, fg: colors.primary },
  green: { bg: colors.successLight, fg: colors.success },
  orange: { bg: colors.warningLight, fg: colors.warning },
  purple: { bg: colors.accentPurpleLight, fg: colors.accentPurple },
  red: { bg: colors.dangerLight, fg: colors.danger },
  neutral: { bg: colors.neutralLight, fg: colors.neutral },
} as const;
export type TileTone = keyof typeof tileTones;

// {bg, fg} pair per BadgeTone (see lib/format.ts's statusTone) — for
// coloring a row's leading icon circle to match its StatusBadge, the same
// "icon colored by type" treatment used on the Home screen, reused here
// instead of every screen inventing its own bg/fg pair per status.
export const statusIconColors = {
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warning },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  info: { bg: colors.infoLight, fg: colors.info },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: "700" as const, color: colors.textPrimary },
  h2: { fontSize: 22, fontWeight: "700" as const, color: colors.textPrimary },
  h3: { fontSize: 17, fontWeight: "600" as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.textPrimary },
  bodyMuted: { fontSize: 14, fontWeight: "400" as const, color: colors.textSecondary },
  caption: { fontSize: 12, fontWeight: "500" as const, color: colors.textMuted },
  button: { fontSize: 15, fontWeight: "600" as const, color: colors.textOnPrimary },
};

export const shadow = {
  // Resting card — list rows, form cards. Barely-there lift.
  card: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  // Raised — anchor elements meant to stand out on a screen.
  raised: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
};

// Fixed circle sizes for Avatar/IconTile so every screen's header avatar,
// list-row leading icon, and quick-action tile line up on the same grid.
export const size = {
  avatarSm: 32,
  avatarMd: 40,
  avatarLg: 56,
  iconTile: 56,
  rowIcon: 40,
} as const;
