import React, { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ActiveClientBar, Screen, Card, Input, BannerAction, IllustratedEmptyState, ErrorState, StatusBadge, SkeletonList, FilterChip } from "@/components/ui";
import { colors, spacing, typography, statusIconColors } from "@/constants/theme";
import { getInvoices } from "@/services/invoices";
import { getClients } from "@/services/clients";
import { formatCurrency, formatDate, statusTone, statusLabel } from "@/lib/format";
import type { Invoice } from "@/types/api";
import { ApiError } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { useActiveClient } from "@/hooks/useActiveClient";

// Status filter row (section 8 of the redesign brief: All / Pending / Paid
// / Overdue). Display-only bucketing on top of the existing `status`
// string already returned by GET /api/invoices — no new backend field or
// endpoint, just a client-side grouping of the same statuses statusTone()/
// statusLabel() already know about ("draft"/"sent" read as still-pending
// until they're paid or flagged overdue).
type StatusFilter = "all" | "pending" | "paid" | "overdue";
function matchesStatusFilter(status: string, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "paid") return status === "paid";
  if (filter === "overdue") return status === "overdue";
  return status !== "paid" && status !== "overdue"; // pending: draft, sent, ...
}

// Reused for both roles (see app/(tabs)/_layout.tsx's header comment):
// a client always sees their own invoices. Staff reach this screen either
// scoped to one client (pushed from Clients tab with a `clientId` param)
// or unscoped from the Accounting tab, which shows the full cross-client
// list — in that case each row is labelled with the owning client's name
// (looked up client-side against the cached "clients" list, since
// GET /api/invoices doesn't include the owning client's name on each row —
// see src/app/api/invoices/route.ts's getAllInvoices()).
// Icon per BadgeTone — paired with statusIconColors for the row's leading
// icon circle: paid=check, overdue=alert, sent/processing=paper-plane,
// everything else (draft, pending, uploaded)=a clock.
function statusIcon(tone: ReturnType<typeof statusTone>): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case "success":
      return "checkmark-circle";
    case "danger":
      return "alert-circle";
    case "info":
      return "paper-plane";
    default:
      return "time-outline";
  }
}

function InvoiceRow({ invoice, clientName, onPress }: { invoice: Invoice; clientName?: string; onPress: () => void }) {
  const tone = statusTone(invoice.status);
  const iconColor = statusIconColors[tone];
  // Card's built-in onPress gives the row a light scale-down on tap — same
  // "feedback visuel lors d'une sélection" as every other pressable card,
  // instead of a one-off Pressable wrapper.
  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "flex-start" }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: iconColor.bg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.md,
          marginTop: 2,
        }}
      >
        <Ionicons name={statusIcon(tone)} size={18} color={iconColor.fg} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text style={typography.h3}>{invoice.customerName}</Text>
          <Text style={[typography.bodyMuted, { marginTop: 2 }]}>
            #{invoice.invoiceNumber} · {formatDate(invoice.date)}
          </Text>
          {clientName ? <Text style={[typography.caption, { marginTop: 2 }]}>{clientName}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
          <Text style={[typography.h3, { color: colors.primary }]}>{formatCurrency(invoice.total)}</Text>
          <StatusBadge label={statusLabel(invoice.status)} tone={statusTone(invoice.status)} />
        </View>
      </View>
    </Card>
  );
}

export default function InvoicesListScreen() {
  const { clientId: paramClientId } = useLocalSearchParams<{ clientId?: string }>();
  // Falls back to the active client (set from the Clients tab) so the
  // Accounting hub's "Overdue invoices" card, reached with no explicit
  // clientId, still stays scoped to a client the bookkeeper has selected.
  const { activeClient } = useActiveClient();
  const clientId = paramClientId ?? activeClient?.id;
  // Keying the actual content by clientId forces a clean remount whenever
  // the comptable switches client: local UI state (search text, status
  // filter) resets instead of surviving from the previous client, and the
  // list starts from its loading/skeleton state rather than momentarily
  // showing whatever was on screen for the last client. This is on top of
  // (not instead of) `["invoices", clientId ?? "all"]` already being the
  // query key — that part was already correct — this closes the gap where
  // this screen's own useState was not clientId-scoped.
  return <InvoicesListContent key={clientId ?? "all"} clientId={clientId} />;
}

function InvoicesListContent({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const { isStaff } = useAuth();
  const { clearActiveClient } = useActiveClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["invoices", clientId ?? "all"],
    queryFn: () => getInvoices(clientId),
  });

  // Serves two purposes for staff: labels rows with the owning client's
  // name in the unscoped, cross-client view, AND (when a single client IS
  // selected) drives the "Client: X" indicator below — a visible reminder
  // that the bookkeeper is *viewing* that client's data, not acting as
  // them (see this screen's own action-button comment above).
  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: getClients,
    enabled: isStaff,
  });
  const clientNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clientsQuery.data ?? []) map.set(c.id, c.company || c.name);
    return map;
  }, [clientsQuery.data]);
  const selectedClient = clientId ? clientsQuery.data?.find((c) => c.id === clientId) : undefined;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((inv) => {
      const matchesSearch =
        !q || inv.customerName.toLowerCase().includes(q) || inv.invoiceNumber.toLowerCase().includes(q);
      return matchesSearch && matchesStatusFilter(inv.status, statusFilter);
    });
  }, [data, search, statusFilter]);

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg }}>
        <Text style={typography.h1}>Invoices</Text>
        {/* "Create invoice" is a CLIENT-only action (their own voice-invoice
            flow) — gated by role (isStaff), not by whether a client is
            selected. A bookkeeper viewing Client A's invoices still can't
            create one as if they were Client A; this button simply isn't
            part of the bookkeeper's own feature set on this screen. */}
        {!isStaff ? (
          <Pressable
            onPress={() => router.push("/invoices/voice-invoice")}
            style={({ pressed }) => [
              {
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.brandPrimary,
                alignItems: "center",
                justifyContent: "center",
              },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="add" size={22} color={colors.textOnPrimary} />
          </Pressable>
        ) : null}
      </View>

      {selectedClient ? (
        <ActiveClientBar
          name={selectedClient.company || selectedClient.name}
          onExit={() => {
            clearActiveClient();
            router.setParams({ clientId: undefined });
          }}
        />
      ) : null}

      <View style={{ position: "relative", marginBottom: isStaff ? spacing.lg : spacing.md }}>
        <Ionicons
          name="search"
          size={18}
          color={colors.textMuted}
          style={{ position: "absolute", left: spacing.md, top: 0, bottom: 0, textAlignVertical: "center", zIndex: 1 }}
        />
        <Input
          placeholder="Search customer or invoice #"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          style={{ paddingLeft: spacing.xl + spacing.sm }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg, flexGrow: 0 }}>
        <FilterChip label="All" active={statusFilter === "all"} onPress={() => setStatusFilter("all")} />
        <FilterChip label="Pending" active={statusFilter === "pending"} onPress={() => setStatusFilter("pending")} />
        <FilterChip label="Paid" active={statusFilter === "paid"} onPress={() => setStatusFilter("paid")} />
        <FilterChip label="Overdue" active={statusFilter === "overdue"} onPress={() => setStatusFilter("overdue")} />
      </ScrollView>

      {!isStaff ? (
        <BannerAction
          icon="mic"
          title="Create new invoice by voice"
          subtitle="Just speak and we'll take care of the rest."
          filled
          onPress={() => router.push("/invoices/voice-invoice")}
        />
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <ErrorState
          message={error instanceof ApiError ? error.message : "Could not load invoices."}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <IllustratedEmptyState
          icon="document-text-outline"
          title={search || statusFilter !== "all" ? "No invoices" : "No invoices yet"}
          subtitle={
            search || statusFilter !== "all"
              ? "No invoice matches your filters."
              : isStaff
              ? "This client has no invoices yet."
              : "Invoices you create or receive will show up here."
          }
          // "Create your first invoice" is the CLIENT voice-invoice flow —
          // must never show for a bookkeeper, even when they're viewing an
          // empty client (this was previously gated only by
          // `!search && statusFilter === "all"`, so a bookkeeper landing on
          // Client A's empty invoice list saw and could tap this CLIENT-only
          // action; role, not data state, decides this).
          actionLabel={!isStaff && !search && statusFilter === "all" ? "Create your first invoice" : undefined}
          onAction={!isStaff ? () => router.push("/invoices/voice-invoice") : undefined}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <InvoiceRow
              invoice={item}
              clientName={!clientId ? clientNameById.get(item.clientId) : undefined}
              onPress={() => router.push(`/invoices/${item.id}`)}
            />
          )}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
