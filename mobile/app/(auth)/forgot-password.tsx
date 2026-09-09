import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextInputProps, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { FadeSlideIn } from "@/components/ui";
import { colors, spacing, typography, radius } from "@/constants/theme";
import { requestPasswordReset } from "@/services/auth";
import { ApiError } from "@/services/api";

// Reuses the existing public POST /api/auth/forgot-password endpoint (the
// same one the web app's forgot-password page calls) — no new backend
// behavior, just a mobile screen for it in the new "Ledgerly" visual style
// introduced on the login screen.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Blobs />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ position: "absolute", top: spacing.xl, left: spacing.xl }}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </Pressable>

          <FadeSlideIn delay={0}>
            <LogoBadge iconName="key" />
            <Text style={[typography.h1, { textAlign: "center", marginBottom: spacing.xs }]}>Reset password</Text>
            <Text style={[typography.bodyMuted, { textAlign: "center", marginBottom: spacing.xl }]}>
              {sent
                ? "If that email is registered, a reset link is on its way."
                : "Enter your email and we'll send you a reset link."}
            </Text>
          </FadeSlideIn>

          {sent ? (
            <FadeSlideIn delay={80}>
              <View style={{ alignItems: "center" }}>
                <Ionicons name="checkmark-circle" size={56} color={colors.success} style={{ marginBottom: spacing.lg }} />
                <Pressable onPress={() => router.replace("/login")}>
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>Back to log in</Text>
                </Pressable>
              </View>
            </FadeSlideIn>
          ) : (
            <FadeSlideIn delay={80}>
              <FieldRow icon="mail-outline">
                <RowInput value={email} onChangeText={setEmail} placeholder="Email address" autoCapitalize="none" keyboardType="email-address" />
              </FieldRow>
              {error ? <Text style={{ color: colors.danger, fontSize: 13, marginTop: spacing.sm }}>{error}</Text> : null}
              <View style={{ marginTop: spacing.lg }}>
                <GradientButton title="Send reset link" onPress={onSubmit} loading={submitting} />
              </View>
            </FadeSlideIn>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// Kept file-local (small, presentational) rather than shared, to keep this
// screen self-contained; see app/(auth)/login.tsx for the versions used
// there, with fuller comments on the visual choices.
function Blobs() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 260, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: -140, left: -90, width: 260, height: 260, borderRadius: 130, backgroundColor: colors.primaryLight }} />
      <View style={{ position: "absolute", top: -40, left: 60, width: 140, height: 140, borderRadius: 70, backgroundColor: colors.surfaceAlt }} />
    </View>
  );
}

function LogoBadge({ iconName }: { iconName: keyof typeof Ionicons.glyphMap }) {
  return (
    <LinearGradient
      colors={[colors.brandPrimaryDeep, colors.brandPrimary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: spacing.lg }}
    >
      <Ionicons name={iconName} size={32} color={colors.textOnPrimary} />
    </LinearGradient>
  );
}

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

function GradientButton({ title, onPress, loading }: { title: string; onPress: () => void; loading?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={loading}>
      <LinearGradient
        colors={[colors.brandPrimary, colors.brandPrimaryDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          borderRadius: radius.pill,
          paddingVertical: spacing.md,
          alignItems: "center",
          justifyContent: "center",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={typography.button}>{title}</Text>}
      </LinearGradient>
    </Pressable>
  );
}
