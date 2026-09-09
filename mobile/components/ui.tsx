import React, { useEffect, useRef } from "react";
import {
  Animated,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius, spacing, typography, shadow, size, tileTones, TileTone } from "@/constants/theme";

// Small top "active" indicator pill + icon, for a tab bar's tabBarIcon
// render prop — mirrors the reference design's pill-over-active-icon
// treatment (a plain Ionicon otherwise gives no equivalent affordance).
export function TabIcon({ name, color, size, focused }: { name: keyof typeof Ionicons.glyphMap; color: string; size: number; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: size + 16 }}>
      <View
        style={{
          position: "absolute",
          top: -10,
          width: 18,
          height: 3,
          borderRadius: 2,
          backgroundColor: colors.brandPrimary,
          opacity: focused ? 1 : 0,
        }}
      />
      <Ionicons name={name} color={color} size={size} />
    </View>
  );
}

export function Screen({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.screen, style]} {...rest}>
      {children}
    </View>
  );
}

// Card is optionally pressable — pass onPress to get a very light scale-down
// "press" micro-interaction (section 16/9 of the redesign brief) without
// every call site having to wrap its own Pressable + Animated.Value.
export function Card({
  children,
  style,
  onPress,
  ...rest
}: ViewProps & { onPress?: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  if (!onPress) {
    return (
      <View style={[styles.card, shadow.card, style]} {...rest}>
        {children}
      </View>
    );
  }

  const animateTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => animateTo(0.98)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[styles.card, shadow.card, style, { transform: [{ scale }] }]} {...rest}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// Wrap any card/row/section in a very light fade + slide-up entrance —
// used to stagger a screen's cards in one after another (section 4/5/8 of
// the brief) instead of everything popping in at once. Kept to a single
// short Animated timing (no native dependency) so it stays cheap even when
// several instances mount together in a list (section 18: performance).
export function FadeSlideIn({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: ViewProps["style"];
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 240, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 240, delay, useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

export function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !disabled && !loading && animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        disabled={disabled || loading}
        style={[styles.button, (disabled || loading) && styles.buttonDisabled]}
      >
        {loading ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={typography.button}>{title}</Text>}
      </Pressable>
    </Animated.View>
  );
}

export function Input(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textMuted} style={styles.input} {...props} />;
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={typography.h3}>{title}</Text>
      {subtitle ? <Text style={[typography.bodyMuted, { marginTop: spacing.xs, textAlign: "center" }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={typography.h3}>Something went wrong</Text>
      <Text style={[typography.bodyMuted, { marginTop: spacing.xs, textAlign: "center" }]}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }) {
  const toneColors: Record<typeof tone, { bg: string; fg: string }> = {
    success: { bg: colors.successLight, fg: colors.success },
    warning: { bg: colors.warningLight, fg: colors.warning },
    danger: { bg: colors.dangerLight, fg: colors.danger },
    info: { bg: colors.infoLight, fg: colors.info },
    neutral: { bg: colors.primaryLight, fg: colors.primary },
  };
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// A single toggle chip for status/category filter rows (e.g. Invoices'
// "All / Pending / Paid / Overdue"). Shared so every filter row on every
// screen looks and behaves the same instead of each screen styling its
// own pill — see documents/index.tsx and app/(tabs)/invoices/index.tsx.
export function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  // Cross-fades bg/border/text between the two states instead of an
  // instant flip, so switching filters (section 6) reads as one smooth
  // transition rather than a hard cut.
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: active ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [active, progress]);

  const backgroundColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.surface, colors.brandPrimary] });
  const borderColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.brandPrimary] });
  const textColor = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.textSecondary, colors.textOnPrimary] });

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.8 }}>
      <Animated.View
        style={{
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.pill,
          backgroundColor,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor,
          marginRight: spacing.sm,
        }}
      >
        <Animated.Text style={{ color: textColor, fontWeight: "600", fontSize: 13 }}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Design-system layer 2 — header, hero, quick actions, list rows.
// Shared across every screen so the visual language from the Home /
// Invoices / Profile reference screens (avatar+bell header, navy hero
// card, tinted icon tiles, "Section title — See all" rows) is one set of
// components instead of one-off styles per screen.
// ─────────────────────────────────────────────────────────────────────────

export function Avatar({
  initials,
  size: s = size.avatarMd,
  tone = "blue",
  online,
}: {
  initials: string;
  size?: number;
  tone?: TileTone;
  online?: boolean;
}) {
  const c = tileTones[tone];
  return (
    <View style={{ width: s, height: s }}>
      <View
        style={{
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: colors.brandPrimary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: colors.textOnPrimary, fontWeight: "700", fontSize: s * 0.38 }}>{initials}</Text>
      </View>
      {online ? (
        <View
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: s * 0.3,
            height: s * 0.3,
            borderRadius: s * 0.15,
            backgroundColor: colors.success,
            borderWidth: 2,
            borderColor: colors.background,
          }}
        />
      ) : null}
    </View>
  );
}

// Every screen's top row: greeting/title on the left, avatar (+ optional
// bell) on the right. `bellDotColor` lights the notification dot; omit to
// hide the bell entirely for screens that don't need it.
export function TopBar({
  title,
  subtitle,
  initials,
  onAvatarPress,
  onBellPress,
  bellDotColor,
}: {
  title: string;
  subtitle?: string;
  initials?: string;
  onAvatarPress?: () => void;
  onBellPress?: () => void;
  bellDotColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.xl }}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={typography.h1}>{title}</Text>
        {subtitle ? <Text style={[typography.bodyMuted, { marginTop: spacing.xs }]}>{subtitle}</Text> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        {onBellPress ? (
          <Pressable onPress={onBellPress} hitSlop={8} style={{ padding: spacing.xs }}>
            <Ionicons name="notifications-outline" size={24} color={colors.primary} />
            {bellDotColor ? (
              <View
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: bellDotColor,
                }}
              />
            ) : null}
          </Pressable>
        ) : null}
        {initials ? <Pressable onPress={onAvatarPress}><Avatar initials={initials} /></Pressable> : null}
      </View>
    </View>
  );
}

// The financial "hero" card — an eyebrow label, a large value, an optional
// status pill, an optional CTA, and a soft-tinted icon badge with two faint
// concentric rings standing in for the wallet illustration (plain Views,
// so it works with no image asset and no gradient library).
//
// Redesigned as a LIGHT sky-blue card (not a solid dark block): the brief
// explicitly asks for "une carte financière moderne avec bleu ciel léger"
// and to avoid "gros blocs bleu foncé". A light tint also means the value
// and eyebrow can use the normal dark text colors, which reads far more
// crisply than light text ever could on a saturated fill.
export function HeroCard({
  eyebrow,
  value,
  icon,
  action,
  onActionPress,
  children,
}: {
  eyebrow: string;
  value: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: string;
  onActionPress?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.primaryLight,
        borderRadius: radius.xl,
        padding: spacing.xl,
        marginBottom: spacing.xl,
        overflow: "hidden",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.primarySoft,
        ...shadow.card,
      }}
    >
      {icon ? (
        <>
          <View style={{ position: "absolute", right: -30, top: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: colors.overlayOnBrand }} />
          <View style={{ position: "absolute", right: 8, top: 60, width: 84, height: 84, borderRadius: 42, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", ...shadow.card }}>
            <Ionicons name={icon} size={30} color={colors.primary} />
          </View>
        </>
      ) : null}
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", letterSpacing: 0.4 }}>
        {eyebrow.toUpperCase()}
      </Text>
      <Text style={{ color: colors.textPrimary, fontSize: 32, fontWeight: "700", marginTop: spacing.xs }}>{value}</Text>
      {children}
      {action ? (
        <Pressable
          onPress={onActionPress}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: colors.surface,
              borderRadius: radius.pill,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              marginTop: spacing.md,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.primarySoft,
            },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14, marginRight: spacing.xs }}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// A bolder "balance card" variant — full sky-blue gradient fill (instead of
// HeroCard's light tint) with an optional two-column stat split underneath
// on a white footer, modeled on the reference finance-app dashboard's
// balance card (gradient hero + Income/Expense split). Kept as a separate
// component rather than changing HeroCard itself, since several screens
// already rely on HeroCard's light-tint look; use this one specifically
// for a screen's single "headline" balance.
export function GradientHeroCard({
  eyebrow,
  value,
  caption,
  badge,
  stats,
}: {
  eyebrow: string;
  value: string;
  caption?: string;
  badge?: string;
  stats?: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: "success" | "danger" }[];
}) {
  return (
    <View style={{ borderRadius: radius.xl, marginBottom: spacing.xl, overflow: "hidden", ...shadow.card }}>
      <LinearGradient colors={[colors.brandPrimaryDeep, colors.brandPrimary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: spacing.xl }}>
        <Text style={{ color: colors.textOnPrimaryMuted, fontSize: 13, fontWeight: "600" }}>{eyebrow}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.xs }}>
          <Text style={{ color: colors.textOnPrimary, fontSize: 32, fontWeight: "700" }}>{value}</Text>
          {badge ? (
            <View style={{ marginLeft: spacing.sm, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
              <Text style={{ color: colors.textOnPrimary, fontSize: 12, fontWeight: "700" }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {caption ? <Text style={{ color: colors.textOnPrimaryMuted, fontSize: 12, marginTop: spacing.xs }}>{caption}</Text> : null}
      </LinearGradient>
      {stats && stats.length > 0 ? (
        <View style={{ flexDirection: "row", backgroundColor: colors.surface }}>
          {stats.map((s, i) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: spacing.lg,
                borderLeftWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                borderLeftColor: colors.border,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  marginBottom: spacing.xs,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: s.tone === "success" ? colors.successLight : colors.dangerLight,
                }}
              >
                <Ionicons name={s.icon} size={16} color={s.tone === "success" ? colors.success : colors.danger} />
              </View>
              <Text style={{ fontSize: 13, color: colors.textSecondary }}>{s.label}</Text>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 2 }}>{s.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}


export function BannerAction({
  icon,
  title,
  subtitle,
  tone = "blue",
  filled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  tone?: TileTone;
  filled?: boolean;
  onPress: () => void;
}) {
  const c = tileTones[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          borderRadius: radius.lg,
          padding: spacing.lg,
          backgroundColor: filled ? colors.brandPrimary : colors.surface,
          borderWidth: filled ? 0 : StyleSheet.hairlineWidth,
          borderColor: colors.border,
          marginBottom: spacing.lg,
        },
        !filled && shadow.card,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View
        style={{
          width: size.rowIcon,
          height: size.rowIcon,
          borderRadius: size.rowIcon / 2,
          backgroundColor: filled ? "rgba(255,255,255,0.16)" : c.bg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.md,
        }}
      >
        <Ionicons name={icon} size={20} color={filled ? colors.textOnPrimary : c.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: filled ? colors.textOnPrimary : colors.textPrimary }}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 13, marginTop: 2, color: filled ? colors.textOnPrimaryMuted : colors.textSecondary }}>{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={filled ? colors.textOnPrimary : colors.textMuted} />
    </Pressable>
  );
}

// One tinted, rounded-square shortcut tile (Invoices / Purchases / Alerts /
// Profile on Home, but generic enough for any quick-action grid). Render a
// row of these in a flex-wrap View with `width: "23%"` per tile for a
// 4-across grid, or `"48%"` for 2-across.
export function IconTile({
  icon,
  label,
  tone = "blue",
  onPress,
  width,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: TileTone;
  onPress: () => void;
  width?: `${number}%`;
}) {
  const c = tileTones[tone];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width: width ?? "23%", alignItems: "center" }, pressed && { opacity: 0.7 }]}
    >
      <View
        style={{
          width: size.iconTile,
          height: size.iconTile,
          borderRadius: radius.lg,
          backgroundColor: c.bg,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.xs,
        }}
      >
        <Ionicons name={icon} size={22} color={c.fg} />
      </View>
      <Text style={[typography.caption, { color: colors.textPrimary, fontWeight: "600" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// "Section title ······ See all >" header used above every list section.
export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md }}>
      <Text style={typography.h3}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 14, marginRight: 2 }}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// General-purpose row: tinted leading icon (or plain text row when `icon`
// is omitted, for the Profile "Name / Email / …" field rows), title +
// optional meta line, trailing text, optional chevron. Used for recent
// activity, menu links, and document/file lists alike.
export function ListRow({
  icon,
  tone = "neutral",
  title,
  meta,
  trailing,
  chevron,
  onPress,
  last,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: TileTone;
  title: string;
  meta?: string;
  trailing?: string;
  chevron?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const c = tileTones[tone];
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.md,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}
    >
      {icon ? (
        <View
          style={{
            width: size.rowIcon,
            height: size.rowIcon,
            borderRadius: radius.md,
            backgroundColor: c.bg,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          <Ionicons name={icon} size={18} color={c.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, marginRight: spacing.sm }}>
        <Text style={typography.body} numberOfLines={1}>{title}</Text>
        {meta ? <Text style={[typography.caption, { marginTop: 2 }]} numberOfLines={1}>{meta}</Text> : null}
      </View>
      {trailing ? <Text style={[typography.body, { fontWeight: "600" }]}>{trailing}</Text> : null}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: spacing.xs }} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{content}</Pressable> : content;
}

// Empty state with a soft illustrated icon (concentric tint circle + a
// small "x" dismiss dot, echoing the reference "No invoices yet" screen)
// instead of a bare title/subtitle — same info, more finished feel.
export function IllustratedEmptyState({
  icon = "document-text-outline",
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg }}>
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: colors.primaryLight,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: spacing.lg,
        }}
      >
        <Ionicons name={icon} size={36} color={colors.primary} />
      </View>
      <Text style={[typography.h3, { textAlign: "center" }]}>{title}</Text>
      {subtitle ? <Text style={[typography.bodyMuted, { marginTop: spacing.xs, textAlign: "center" }]}>{subtitle}</Text> : null}
      {actionLabel ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.primary,
              borderRadius: radius.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              marginTop: spacing.lg,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} style={{ marginRight: spacing.xs }} />
          <Text style={{ color: colors.primary, fontWeight: "600" }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Skeleton loading
// ─────────────────────────────────────────────────────────────────────────
// Replaces the plain "Loading…" text every list/detail screen used to show.
// Built on the RN core Animated API only — no new dependency, works in
// Expo Go, same constraint that shaped the voice-input decision.

function SkeletonBlock({ width, height, style }: { width: number | `${number}%`; height: number; style?: ViewProps["style"] }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius.sm, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}

// One skeleton row shaped like a typical list Card (title + subtitle line,
// optional trailing amount) — used by every list screen's loading state.
export function SkeletonListItem({ withTrailing = true }: { withTrailing?: boolean }) {
  return (
    <Card style={{ marginBottom: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <View style={{ flex: 1, marginRight: spacing.md, gap: spacing.sm }}>
        <SkeletonBlock width="70%" height={15} />
        <SkeletonBlock width="45%" height={12} />
      </View>
      {withTrailing ? <SkeletonBlock width={60} height={18} /> : null}
    </Card>
  );
}

// A short stack of SkeletonListItem — drop-in replacement for
// <EmptyState title="Loading X…" /> on any list screen.
export function SkeletonList({ count = 5, withTrailing = true }: { count?: number; withTrailing?: boolean }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} withTrailing={withTrailing} />
      ))}
    </View>
  );
}

// Loading placeholder for a detail screen (title block + a few field rows).
export function SkeletonDetail() {
  return (
    <View>
      <Card style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
        <SkeletonBlock width="60%" height={20} />
        <SkeletonBlock width="35%" height={13} />
      </Card>
      <Card style={{ gap: spacing.md }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <SkeletonBlock width="30%" height={13} />
            <SkeletonBlock width="35%" height={13} />
          </View>
        ))}
      </Card>
    </View>
  );
}

// Persistent "you're inside one client's data" strip for staff screens.
// Deliberately NOT a nav element and NOT styled like a tab — this is a
// filter indicator, not a role change: the bookkeeper's own tab bar,
// permissions, and every API call underneath stay exactly the same
// whether this is shown or not (see hooks/useActiveClient.tsx). "Exit"
// only clears which client the staff-only screens default to — it never
// signs anyone out or changes role.
export function ActiveClientBar({ name, onExit }: { name: string; onExit: () => void }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.primaryLight,
        borderRadius: radius.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <Ionicons name="briefcase-outline" size={16} color={colors.primary} style={{ marginRight: spacing.sm }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.primary }} numberOfLines={1}>
        Client actif : {name}
      </Text>
      <Pressable onPress={onExit} hitSlop={8}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary, textDecorationLine: "underline" }}>Quitter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 12, fontWeight: "600" },
});
