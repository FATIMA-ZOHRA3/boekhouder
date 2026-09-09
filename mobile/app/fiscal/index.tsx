import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActiveClientBar, Card, ErrorState, SkeletonDetail } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getFiscalSummary } from "@/services/fiscal";
import { getClients } from "@/services/clients";
import { explainTaxConcept } from "@/services/ai";
import { formatCurrency } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useActiveClient } from "@/hooks/useActiveClient";
import type { FiscalSummary, TaxConceptExplanation } from "@/types/api";

function StatRow({
  label,
  value,
  tone,
  onExplain,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
  onExplain?: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
        <Text style={typography.bodyMuted}>{label}</Text>
        {onExplain ? (
          <Pressable onPress={onExplain} hitSlop={10} accessibilityLabel={`Explain ${label} with AI`} accessibilityRole="button">
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>i</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
      <Text style={[typography.body, tone === "danger" ? { color: colors.danger } : tone === "success" ? { color: colors.success } : null]}>
        {value}
      </Text>
    </View>
  );
}

// Explain Tax Concept ("ai.tax-concept.explain") — open to CLIENT and
// BOOKKEEPER alike. This is intentionally NOT a free-text tax Q&A box:
// the backend only accepts a fixed set of pre-approved concept keys (see
// src/app/api/ai/explain-tax-concept/route.ts), so the mobile UI offers
// exactly the three concepts already shown as figures on this screen —
// same keys and amounts payload as the web client portal's
// explainTaxConcept() in src/app/client/page.tsx — rather than a search
// box that could imply arbitrary questions are supported.
function TaxConceptExplainer({ concept, fiscal }: { concept: string | null; fiscal: FiscalSummary }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TaxConceptExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!concept) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);
    const amounts: Record<string, number> =
      concept === "btw_ontvangen"
        ? { "VAT received": fiscal.totalVatCollected }
        : concept === "btw_aftrekbaar"
        ? { "VAT deductible": fiscal.totalVatDeductible }
        : { "VAT received": fiscal.totalVatCollected, "VAT deductible": fiscal.totalVatDeductible, "VAT payable": fiscal.vatToPay };
    explainTaxConcept(concept, amounts)
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Could not get an explanation. Try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concept]);

  if (!concept) return null;

  return (
    <Card style={{ marginBottom: spacing.lg, borderColor: colors.primary }}>
      {loading ? (
        <>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Explaining…</Text>
          <View style={{ height: 14, borderRadius: 7, backgroundColor: colors.border, marginBottom: spacing.sm, width: "90%" }} />
          <View style={{ height: 14, borderRadius: 7, backgroundColor: colors.border, width: "60%" }} />
        </>
      ) : error ? (
        <>
          <Text style={{ color: colors.danger, marginBottom: spacing.md }}>{error}</Text>
        </>
      ) : result ? (
        <>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>{result.label}</Text>
          <Text style={typography.body}>{result.explanation}</Text>
          <Text style={[typography.caption, { marginTop: spacing.md }]}>{result.disclaimer}</Text>
        </>
      ) : null}
    </Card>
  );
}

// A client viewing their own summary reaches this with no `clientId` (GET
// /api/fiscal defaults to the caller's own data — see
// src/app/api/fiscal/route.ts). Staff always reach it with one, from a
// Client detail screen.
export default function FiscalScreen() {
  const { clientId: paramClientId } = useLocalSearchParams<{ clientId?: string }>();
  const { activeClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;
  // Remounts the whole screen when the comptable switches client, so the
  // open "explain this concept" panel (`activeConcept`) from the previous
  // client closes instead of staying open over the new client's figures.
  return <FiscalContent key={clientId ?? "own"} clientId={clientId} />;
}

function FiscalContent({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const { clearActiveClient } = useActiveClient();
  const [activeConcept, setActiveConcept] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["fiscal", clientId ?? "own"],
    queryFn: () => getFiscalSummary(clientId),
  });

  // "Client: X" indicator — same as Invoices/Purchases/Audit/Financial
  // Insights: a visible reminder that a bookkeeper is viewing this
  // client's VAT figures, not their own.
  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: getClients, enabled: !!clientId });
  const selectedClient = clientId ? clientsQuery.data?.find((c) => c.id === clientId) : undefined;

  if (isLoading) return <SkeletonDetail />;
  if (isError || !data) {
    return <ErrorState message={error instanceof ApiError ? error.message : "Could not load the fiscal summary."} onRetry={() => refetch()} />;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Fiscal / VAT", headerStyle: { backgroundColor: colors.surface } }} />

      {selectedClient ? (
        <ActiveClientBar
          name={selectedClient.company || selectedClient.name}
          onExit={() => {
            clearActiveClient();
            router.setParams({ clientId: undefined });
          }}
        />
      ) : null}

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>VAT this period</Text>
        <StatRow label="Revenue" value={formatCurrency(data.totalRevenue)} />
        <StatRow label="VAT collected" value={formatCurrency(data.totalVatCollected)} onExplain={() => setActiveConcept("btw_ontvangen")} />
        <StatRow label="VAT deductible" value={formatCurrency(data.totalVatDeductible)} onExplain={() => setActiveConcept("btw_aftrekbaar")} />
        <StatRow label="VAT to pay" value={formatCurrency(data.vatToPay)} tone={data.vatToPay > 0 ? "danger" : undefined} onExplain={() => setActiveConcept("btw_af_te_dragen")} />
      </Card>

      <TaxConceptExplainer concept={activeConcept} fiscal={data} />

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Invoices</Text>
        <StatRow label="Total" value={String(data.invoiceCount)} />
        <StatRow label="Paid" value={String(data.paidCount)} tone="success" />
        <StatRow label="Overdue" value={String(data.overdueCount)} tone={data.overdueCount > 0 ? "danger" : undefined} />
        <StatRow label="Outstanding" value={formatCurrency(data.totalOutstanding)} />
        <StatRow label="Paid this month" value={formatCurrency(data.paidThisMonth)} tone="success" />
      </Card>

      {data.taxEstimate ? (
        <Card>
          <Text style={[typography.h3, { marginBottom: spacing.sm }]}>Estimated tax ({data.taxEstimate.year})</Text>
          <StatRow label="Revenue" value={formatCurrency(data.taxEstimate.revenue)} />
          <StatRow label="Costs" value={formatCurrency(data.taxEstimate.costs)} />
          <StatRow label="Profit" value={formatCurrency(data.taxEstimate.profit)} />
          <StatRow label="Estimated tax" value={formatCurrency(data.taxEstimate.estimatedTax)} tone="danger" />
          <Text style={[typography.caption, { marginTop: spacing.md }]}>{data.taxEstimate.assumption}</Text>
        </Card>
      ) : null}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}
