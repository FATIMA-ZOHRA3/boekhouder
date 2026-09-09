import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextInputProps, View, Alert } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { FadeSlideIn } from "@/components/ui";
import { colors, spacing, typography, radius } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";

// ═══════════════════════════════════════════════════════════════════════════
// Login — redesigned to match the provided "Welcome" mockup: light
// background with soft sky-blue blobs, a circular gradient chart/growth
// logo, rounded fields with leading icons, a "Remember me" + "Forgot
// password?" row, a gradient pill "Log in" button, an "or" divider, and an
// outlined "Create an account" row — all using this project's existing
// Ledgerly sky-blue tokens (constants/theme.ts), no new color system.
//
// FUNCTIONAL NOTES (visual redesign only — no backend behavior changed):
//   - The field bound to `username` keeps calling POST /api/auth/login with
//     a username, exactly as before — that endpoint has no email-based
//     login (see src/app/api/auth/login/route.ts). It's styled and placed
//     exactly like the mockup's "Email address" field, but labelled
//     "Username" so it stays truthful about what it actually accepts.
//   - "Remember me" is local UI state only — the app already persists the
//     session in SecureStore on every login (see services/api.ts), so
//     there's no separate "don't remember" mode to wire it to; it's kept
//     here purely because the mockup calls for it, without inventing a
//     backend toggle that doesn't exist.
//   - "Forgot password?" links to the new app/(auth)/forgot-password.tsx
//     screen, which calls the existing public forgot-password endpoint.
//   - "Create an account" isn't wired to POST /api/auth/register: that
//     endpoint expects a full company registration (ClientRegistration —
//     name, VAT/KVK numbers, address, etc.), not just an email/password,
//     so a one-field mobile form can't honestly complete it. Tapping it
//     explains that and doesn't pretend to be a working signup flow.
// ═══════════════════════════════════════════════════════════════════════════

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!username || !password) {
      setError("Enter your username and password");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateAccount = () => {
    Alert.alert(
      "Create an account",
      "New administrations are set up with full company details (VAT/KVK number, address, etc.) — head to the Boekhouder web app to register, then sign in here."
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Blobs />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <FadeSlideIn delay={0}>
            <LogoBadge />
            <Text style={[typography.h1, { fontSize: 32, textAlign: "center", marginBottom: spacing.xs }]}>Welcome</Text>
            <Text style={[typography.bodyMuted, { textAlign: "center", marginBottom: spacing.xl }]}>Log in to your account</Text>
          </FadeSlideIn>

          <FadeSlideIn delay={80}>
            <FieldRow icon="person-outline">
              <RowInput
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </FieldRow>

            <View style={{ height: spacing.md }} />

            <FieldRow icon="lock-closed-outline">
              <RowInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry={!showPassword}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </Pressable>
            </FieldRow>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, marginBottom: spacing.lg }}>
              <Pressable onPress={() => setRememberMe((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }} hitSlop={4}>
                <Ionicons
                  name={rememberMe ? "checkbox" : "square-outline"}
                  size={20}
                  color={rememberMe ? colors.brandPrimary : colors.textMuted}
                />
                <Text style={typography.body}>Remember me</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/forgot-password")} hitSlop={4}>
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Forgot password?</Text>
              </Pressable>
            </View>

            {error ? <Text style={{ color: colors.danger, fontSize: 13, marginBottom: spacing.md }}>{error}</Text> : null}

            <GradientButton title="Log in" icon="arrow-forward" onPress={onSubmit} loading={submitting} />

            <Divider label="or" />

            <OutlineButton title="Create an account" icon="person-add-outline" onPress={onCreateAccount} />
          </FadeSlideIn>

          <FadeSlideIn delay={140}>
            <View style={{ marginTop: spacing.xxl, flexDirection: "row", alignItems: "center" }}>
              <Text style={[typography.bodyMuted, { flex: 1 }]}>Simplify your bookkeeping, grow your business.</Text>
              <BookkeepingGlyph />
            </View>
          </FadeSlideIn>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Decorative background — two soft, oversized circles clipped to the top of
// the screen, approximating the mockup's sky-blue wash without adding an
// SVG dependency (react-native-svg isn't in this project, and plain Views
// get close enough for a flat, blob-like wash at this size).
// ─────────────────────────────────────────────────────────────────────────
function Blobs() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 320, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: -160, left: -110, width: 320, height: 320, borderRadius: 160, backgroundColor: colors.primaryLight }} />
      <View style={{ position: "absolute", top: -50, left: 70, width: 170, height: 170, borderRadius: 85, backgroundColor: colors.surfaceAlt }} />
    </View>
  );
}

// Circular gradient "growth chart" logo — an upward trend icon on a sky-blue
// gradient disc, standing in for the bespoke bars+arrow mark in the mockup.
function LogoBadge() {
  return (
    <LinearGradient
      colors={[colors.brandPrimaryDeep, colors.brandPrimary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: 88,
        height: 88,
        borderRadius: 44,
        alignItems: "center",
        justifyContent: "center",
        alignSelf: "center",
        marginBottom: spacing.lg,
      }}
    >
      <Ionicons name="trending-up" size={40} color={colors.textOnPrimary} />
    </LinearGradient>
  );
}

// Rounded field container with a leading icon — Input from components/ui.tsx
// doesn't support an icon slot, so this composes a plain TextInput inside a
// styled row instead of changing the shared component (used everywhere
// else without icons).
function FieldRow({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
      }}
    >
      <Ionicons name={icon} size={20} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
      {children}
    </View>
  );
}

function RowInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      style={{ flex: 1, paddingVertical: spacing.md, fontSize: 15, color: colors.textPrimary }}
      {...props}
    />
  );
}

function GradientButton({
  title,
  icon,
  onPress,
  loading,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading}>
      <LinearGradient
        colors={[colors.brandPrimary, colors.brandPrimaryDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          borderRadius: radius.pill,
          paddingVertical: spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.textOnPrimary} />
        ) : (
          <>
            <Text style={typography.button}>{title}</Text>
            {icon ? <Ionicons name={icon} size={18} color={colors.textOnPrimary} /> : null}
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

function OutlineButton({ title, icon, onPress }: { title: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: colors.brandPrimary,
        paddingVertical: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.sm,
      }}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginVertical: spacing.lg }}>
      <View style={{ flex: 1, height: StyleSheetHairline, backgroundColor: colors.border }} />
      <Text style={[typography.caption, { marginHorizontal: spacing.md }]}>{label}</Text>
      <View style={{ flex: 1, height: StyleSheetHairline, backgroundColor: colors.border }} />
    </View>
  );
}
const StyleSheetHairline = 1;

// Small flat glyph pairing (invoice + calculator) standing in for the
// mockup's illustration — built from existing icon set + theme tokens
// rather than a bundled raster/vector asset (none exists in this project;
// assets/ only holds the app icon/splash).
function BookkeepingGlyph() {
  return (
    <View style={{ width: 72, height: 60, alignItems: "flex-end", justifyContent: "flex-end" }}>
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 4,
          width: 44,
          height: 52,
          borderRadius: radius.sm,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 6,
          justifyContent: "flex-end",
        }}
      >
        <Ionicons name="bar-chart" size={20} color={colors.brandPrimary} />
      </View>
      <View
        style={{
          width: 36,
          height: 44,
          borderRadius: radius.sm,
          backgroundColor: colors.brandPrimaryDeep,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="calculator" size={20} color={colors.textOnPrimary} />
      </View>
    </View>
  );
}
