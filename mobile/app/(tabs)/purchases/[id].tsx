import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, ErrorState, Input, PrimaryButton, StatusBadge, SkeletonDetail } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getPurchase, scanPurchaseDocument, updatePurchaseDocument } from "@/services/purchases";
import { suggestCategory } from "@/services/ai";
import { getApiBaseUrl, ApiError } from "@/services/api";
import { formatCurrency, formatDate, statusLabel, statusTone } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import type { CategorySuggestion, PurchaseScanResult } from "@/types/api";

function Field({ label, value, onChangeText, editable }: { label: string; value: string; onChangeText?: (v: string) => void; editable?: boolean }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[typography.caption, { marginBottom: spacing.xs }]}>{label}</Text>
      {editable ? (
        <Input value={value} onChangeText={onChangeText} />
      ) : (
        <Text style={typography.body}>{value || "—"}</Text>
      )}
    </View>
  );
}

// The backend forwards the AI provider's 429 message verbatim, e.g.
// "Trop de requêtes IA en ce moment. Veuillez réessayer dans environ 25
// secondes." — rather than let the accountant immediately re-tap the
// button (which only feeds the same rate limit), pull the countdown out
// of that message and disable the button until it elapses.
function extractRetrySeconds(message: string): number | null {
  const match = message.match(/(\d+)\s*(secondes?|seconds?)/i);
  return match ? parseInt(match[1], 10) : null;
}

// Ticks once a second so any active cooldown's displayed countdown stays
// live without each screen wiring its own interval.
function useClockTick(enabled: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
}

function secondsLeft(until: number | null): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isStaff } = useAuth();
  const queryClient = useQueryClient();

  const { data: doc, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["purchase", id],
    queryFn: () => getPurchase(id),
    enabled: !!id,
  });

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<PurchaseScanResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Suggest Category — independent of the "Recognize with AI" scan flow
  // above: it works from whatever supplier/description text the document
  // already has, so it doesn't require running recognition first.
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [applyingCategory, setApplyingCategory] = useState(false);

  // Both AI actions on this screen hit the same backend AI-provider quota
  // (see extractRetrySeconds comment above) — a 429 from either one means
  // the OTHER button will also fail if tapped right away. Share a single
  // cooldown clock instead of two independent ones, so hitting the limit
  // on "Suggest category" also counts down "Recognize with AI" (and vice
  // versa) instead of inviting a second wasted, confusing 429.
  const [aiRetryAt, setAiRetryAt] = useState<number | null>(null);
  useClockTick(!!aiRetryAt);
  const aiWaitSeconds = secondsLeft(aiRetryAt);
  // Once the cooldown elapses, drop the stale red error text automatically
  // instead of leaving yesterday's rate-limit message on screen forever.
  useEffect(() => {
    if (aiRetryAt && aiWaitSeconds === 0) {
      setSuggestError(null);
      setScanError(null);
      setAiRetryAt(null);
    }
  }, [aiWaitSeconds, aiRetryAt]);

  // Editable draft, seeded from the AI result once the accountant chooses
  // to run recognition — this is the "AI proposes" half of the flow.
  const [draft, setDraft] = useState<{
    supplierName: string;
    invoiceNumber: string;
    documentDate: string;
    amount: string;
    vatAmount: string;
    totalAmount: string;
  } | null>(null);

  if (isLoading) return <SkeletonDetail />;
  if (isError || !doc) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : "Could not load this document."}
        onRetry={() => refetch()}
      />
    );
  }

  const imageUrl = ["jpg", "png"].includes(doc.fileType) ? `${getApiBaseUrl()}${doc.fileUrl}` : null;
  const fileUrl = `${getApiBaseUrl()}${doc.fileUrl}`;

  const runRecognition = async (force = false) => {
    setScanning(true);
    setScanError(null);
    try {
      const result = await scanPurchaseDocument(doc.id, force);
      setScanResult(result);
      setAiRetryAt(null);
      setDraft({
        supplierName: result.supplierName || "",
        invoiceNumber: result.invoiceNumber || "",
        documentDate: result.documentDate || "",
        amount: result.amount != null ? String(result.amount) : "",
        vatAmount: result.vatAmount != null ? String(result.vatAmount) : "",
        totalAmount: result.totalAmount != null ? String(result.totalAmount) : "",
      });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Recognition failed. Try again.";
      setScanError(message);
      const wait = extractRetrySeconds(message);
      setAiRetryAt(wait ? Date.now() + wait * 1000 : null);
      // BUGFIX: aiRetryAt (and therefore both buttons' "Retry in Xs" label) is
      // shared between this action and Suggest category, since they hit the
      // same backend quota. But suggestError was left untouched here, so if
      // Suggest category had failed earlier for an unrelated reason (e.g. a
      // formatting error, which carries no wait time), its stale message kept
      // showing underneath a countdown that now has nothing to do with it.
      // Clear it whenever this action starts a fresh shared cooldown.
      if (wait) setSuggestError(null);
    } finally {
      setScanning(false);
    }
  };

  // "User confirms → backend saves" — the accountant may have edited any
  // field the AI proposed before this runs.
  const confirmAndSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await updatePurchaseDocument(doc.id, {
        supplierName: draft.supplierName || null,
        invoiceNumber: draft.invoiceNumber || null,
        documentDate: draft.documentDate || null,
        amount: draft.amount ? Number(draft.amount) : null,
        vatAmount: draft.vatAmount ? Number(draft.vatAmount) : null,
        totalAmount: draft.totalAmount ? Number(draft.totalAmount) : null,
        status: "processing",
      });
      queryClient.invalidateQueries({ queryKey: ["purchase", id] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["purchases-all"] });
      setScanResult(null);
      setDraft(null);
    } catch (err) {
      setScanError(err instanceof ApiError ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Suggest Category: free-text description built from whatever the
  // document already has (same fallback order as the web bookkeeper
  // portal's suggestCategory() — description, then supplier, then
  // filename) — never invented data, never a network call to Groq
  // directly, this only calls the existing backend route.
  const runSuggestCategory = async (force = false) => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      setSuggestion(
        await suggestCategory({ description: doc.label || doc.supplierName || doc.fileName, force })
      );
      setAiRetryAt(null);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not suggest a category. Try again.";
      setSuggestError(message);
      const wait = extractRetrySeconds(message);
      setAiRetryAt(wait ? Date.now() + wait * 1000 : null);
      // Mirror of the fix in runRecognition — see the comment there.
      if (wait) setScanError(null);
    } finally {
      setSuggesting(false);
    }
  };

  // Only writes the category when the accountant explicitly taps "Apply
  // category" — the suggestion is never saved automatically.
  const applyCategory = async () => {
    if (!suggestion) return;
    setApplyingCategory(true);
    try {
      await updatePurchaseDocument(doc.id, { category: suggestion.accountNumber });
      queryClient.invalidateQueries({ queryKey: ["purchase", id] });
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["purchases-all"] });
      setSuggestion(null);
    } catch (err) {
      setSuggestError(err instanceof ApiError ? err.message : "Could not apply the category. Try again.");
    } finally {
      setApplyingCategory(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: "100%", height: 220, borderRadius: 16, marginBottom: spacing.lg, backgroundColor: colors.border }}
          resizeMode="cover"
        />
      ) : (
        <Card style={{ marginBottom: spacing.lg, alignItems: "center" }}>
          <Text style={typography.bodyMuted} onPress={() => Linking.openURL(fileUrl)}>
            Open PDF document ↗
          </Text>
        </Card>
      )}

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: spacing.md }}>
          <Text style={typography.h2}>{doc.supplierName || doc.label || doc.fileName}</Text>
          <StatusBadge label={statusLabel(doc.status)} tone={statusTone(doc.status)} />
        </View>
        {/* Only present for staff (GET /api/purchases/[id] as bookkeeper/
            admin includes the owning user — see getDoc() in
            src/app/api/purchases/[id]/route.ts) */}
        {doc.user ? <Field label="Client" value={doc.user.company || doc.user.name} /> : null}
        <Field label="Document date" value={doc.documentDate ? formatDate(doc.documentDate) : "—"} />
        <Field label="Total amount" value={doc.totalAmount != null ? formatCurrency(doc.totalAmount) : "—"} />
        <Field label="Invoice number" value={doc.invoiceNumber || "—"} />
        <Field label="Category" value={doc.category || "Not categorized"} />
      </Card>

      {isStaff ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Suggest category</Text>
          <Text style={[typography.bodyMuted, { marginBottom: spacing.md }]}>
            The AI proposes a general ledger account — review it before applying.
          </Text>

          {!suggestion ? (
            <PrimaryButton
              title={aiWaitSeconds > 0 ? `Retry in ${aiWaitSeconds}s` : "Suggest category"}
              onPress={() => runSuggestCategory(false)}
              loading={suggesting}
              disabled={aiWaitSeconds > 0}
            />
          ) : (
            <>
              <View style={{ backgroundColor: colors.primaryLight, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md }}>
                <Text style={[typography.h3, { color: colors.primary }]}>{suggestion.ledgerAccount}</Text>
                {suggestion.reasoning ? (
                  <Text style={[typography.bodyMuted, { marginTop: spacing.xs }]}>{suggestion.reasoning}</Text>
                ) : null}
                {suggestion.fromCache ? (
                  <Text style={[typography.caption, { marginTop: spacing.xs }]}>Previously suggested — not a new AI call.</Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Discard" onPress={() => setSuggestion(null)} disabled={applyingCategory} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Apply category" onPress={applyCategory} loading={applyingCategory} />
                </View>
              </View>
              {suggestion.fromCache ? (
                <PrimaryButton
                  title={aiWaitSeconds > 0 ? `Retry in ${aiWaitSeconds}s` : "Regenerate with AI"}
                  onPress={() => runSuggestCategory(true)}
                  loading={suggesting}
                  disabled={aiWaitSeconds > 0}
                />
              ) : null}
            </>
          )}
          {suggestError ? <Text style={{ color: colors.danger, marginTop: spacing.md }}>{suggestError}</Text> : null}
        </Card>
      ) : null}

      {isStaff ? (
        <Card>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>AI recognition</Text>
          <Text style={[typography.bodyMuted, { marginBottom: spacing.md }]}>
            The AI proposes the values below from the scanned document — review and edit before saving.
          </Text>

          {!draft ? (
            <PrimaryButton
              title={aiWaitSeconds > 0 ? `Retry in ${aiWaitSeconds}s` : "Recognize with AI"}
              onPress={() => runRecognition(false)}
              loading={scanning}
              disabled={aiWaitSeconds > 0}
            />
          ) : (
            <>
              <Field label="Supplier" value={draft.supplierName} editable onChangeText={(v) => setDraft({ ...draft, supplierName: v })} />
              <Field label="Invoice number" value={draft.invoiceNumber} editable onChangeText={(v) => setDraft({ ...draft, invoiceNumber: v })} />
              <Field label="Document date (YYYY-MM-DD)" value={draft.documentDate} editable onChangeText={(v) => setDraft({ ...draft, documentDate: v })} />
              <Field label="Amount excl. VAT" value={draft.amount} editable onChangeText={(v) => setDraft({ ...draft, amount: v })} />
              <Field label="VAT amount" value={draft.vatAmount} editable onChangeText={(v) => setDraft({ ...draft, vatAmount: v })} />
              <Field label="Total incl. VAT" value={draft.totalAmount} editable onChangeText={(v) => setDraft({ ...draft, totalAmount: v })} />
              {scanResult?.pageNote ? <Text style={[typography.caption, { marginBottom: spacing.md }]}>{scanResult.pageNote}</Text> : null}
              {scanResult?.fromCache ? (
                <Text style={[typography.caption, { marginBottom: spacing.md }]}>Existing data — not a new AI scan.</Text>
              ) : null}

              <View style={{ flexDirection: "row", gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Discard" onPress={() => { setDraft(null); setScanResult(null); }} disabled={saving} />
                </View>
                <View style={{ flex: 1 }}>
                  <PrimaryButton title="Confirm & save" onPress={confirmAndSave} loading={saving} />
                </View>
              </View>
              {scanResult?.fromCache ? (
                <PrimaryButton
                  title={aiWaitSeconds > 0 ? `Retry in ${aiWaitSeconds}s` : "Rescan with AI"}
                  onPress={() => runRecognition(true)}
                  loading={scanning}
                  disabled={aiWaitSeconds > 0}
                />
              ) : null}
            </>
          )}
          {scanError ? <Text style={{ color: colors.danger, marginTop: spacing.md }}>{scanError}</Text> : null}
        </Card>
      ) : null}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}
