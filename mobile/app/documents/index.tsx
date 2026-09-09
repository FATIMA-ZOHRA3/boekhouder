import React, { useEffect, useMemo, useState } from "react";
import { Linking, RefreshControl, ScrollView, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card, EmptyState, ErrorState, StatusBadge, SkeletonList, FilterChip } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getAllPurchases } from "@/services/purchases";
import { getInvoices } from "@/services/invoices";
import { getQuotations } from "@/services/quotations";
import { getApiBaseUrl } from "@/services/api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";

// Staff-only screen (reachable from the Accounting hub). Mirrors
// src/app/bookkeeper/documents/page.tsx: combines the three existing
// document sources — uploaded purchase files, sent invoice PDFs, sent
// quotation PDFs — into one browsable list with a kind filter, rather
// than being a new document store. Every underlying call is the same one
// its own tab/screen already uses (unscoped = every client, matching the
// Accounting hub's convention).
type Kind = "all" | "purchase" | "invoice" | "quotation";

type Row = {
  kind: Exclude<Kind, "all">;
  id: string;
  title: string;
  meta: string;
  date: string;
  href: string;
};

const kindTone: Record<Row["kind"], "warning" | "info" | "success"> = {
  purchase: "warning",
  invoice: "info",
  quotation: "success",
};
const kindLabel: Record<Row["kind"], string> = {
  purchase: "Purchase",
  invoice: "Invoice",
  quotation: "Quotation",
};
const kindIcon: Record<Row["kind"], keyof typeof Ionicons.glyphMap> = {
  purchase: "cart-outline",
  invoice: "document-text-outline",
  quotation: "document-attach-outline",
};
// Same warning/info/success tones as the StatusBadge above, just mapped to
// an {bg, fg} pair for the icon's circle — so the icon color matches the
// badge instead of every row using the same plain blue regardless of kind.
const kindIconColors: Record<Row["kind"], { bg: string; fg: string }> = {
  purchase: { bg: colors.warningLight, fg: colors.warning },
  invoice: { bg: colors.infoLight, fg: colors.info },
  quotation: { bg: colors.successLight, fg: colors.success },
};

function DocumentRow({ row }: { row: Row }) {
  const iconColor = kindIconColors[row.kind];
  return (
    <Card onPress={() => Linking.openURL(row.href)} style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center" }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: iconColor.bg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.md,
        }}
      >
        <Ionicons name={kindIcon[row.kind]} size={18} color={iconColor.fg} />
      </View>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <Text style={typography.body}>{row.title}</Text>
        <Text style={typography.caption}>
          {row.meta} · {formatDate(row.date)}
        </Text>
      </View>
      <StatusBadge label={kindLabel[row.kind]} tone={kindTone[row.kind]} />
    </Card>
  );
}

export default function DocumentsScreen() {
  const { isStaff } = useAuth();
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("all");

  useEffect(() => {
    if (!isStaff) router.replace("/");
  }, [isStaff, router]);

  const purchasesQuery = useQuery({ queryKey: ["purchases-all", "documents"], queryFn: () => getAllPurchases(), enabled: isStaff });
  const invoicesQuery = useQuery({ queryKey: ["invoices", "all"], queryFn: () => getInvoices(), enabled: isStaff });
  const quotationsQuery = useQuery({ queryKey: ["quotations", "all"], queryFn: () => getQuotations(), enabled: isStaff });

  const loading = purchasesQuery.isLoading || invoicesQuery.isLoading || quotationsQuery.isLoading;
  const isRefetching = purchasesQuery.isRefetching || invoicesQuery.isRefetching || quotationsQuery.isRefetching;
  const hasError = purchasesQuery.isError || invoicesQuery.isError || quotationsQuery.isError;
  const refetchAll = () => {
    purchasesQuery.refetch();
    invoicesQuery.refetch();
    quotationsQuery.refetch();
  };

  const rows = useMemo<Row[]>(() => {
    const base = getApiBaseUrl();
    const purchaseRows: Row[] = (purchasesQuery.data || []).map((d) => ({
      kind: "purchase",
      id: d.id,
      title: d.label || d.fileName,
      meta: d.supplierName || "Purchase document",
      date: d.createdAt,
      href: `${base}${d.fileUrl}`,
    }));
    const invoiceRows: Row[] = (invoicesQuery.data || []).map((i) => ({
      kind: "invoice",
      id: i.id,
      title: `#${i.invoiceNumber}`,
      meta: i.customerName,
      date: i.date,
      href: `${base}/api/invoices/${i.id}/pdf?download=1`,
    }));
    const quotationRows: Row[] = (quotationsQuery.data || []).map((q) => ({
      kind: "quotation",
      id: q.id,
      title: `#${q.quotationNumber}`,
      meta: q.customerName,
      date: q.date,
      href: `${base}/api/quotations/${q.id}/pdf?download=1`,
    }));
    const all = [...purchaseRows, ...invoiceRows, ...quotationRows].sort((a, b) => b.date.localeCompare(a.date));
    return kind === "all" ? all : all.filter((r) => r.kind === kind);
  }, [purchasesQuery.data, invoicesQuery.data, quotationsQuery.data, kind]);

  if (!isStaff) return null;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Documents", headerStyle: { backgroundColor: colors.surface } }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg, flexGrow: 0 }}>
        <FilterChip label="All" active={kind === "all"} onPress={() => setKind("all")} />
        <FilterChip label="Purchases" active={kind === "purchase"} onPress={() => setKind("purchase")} />
        <FilterChip label="Invoices" active={kind === "invoice"} onPress={() => setKind("invoice")} />
        <FilterChip label="Quotations" active={kind === "quotation"} onPress={() => setKind("quotation")} />
      </ScrollView>

      {loading ? (
        <SkeletonList withTrailing={false} />
      ) : hasError ? (
        <ErrorState message="Could not load documents." onRetry={refetchAll} />
      ) : rows.length === 0 ? (
        <EmptyState title="No documents yet" />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((row) => (
            <DocumentRow key={`${row.kind}-${row.id}`} row={row} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
