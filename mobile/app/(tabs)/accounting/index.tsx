import React, { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ActiveClientBar, Card, ErrorState, FadeSlideIn } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getAllPurchases } from "@/services/purchases";
import { getBankTransactions } from "@/services/bank";
import { getExceptions } from "@/services/exceptions";
import { getInvoices } from "@/services/invoices";
import { getConversations } from "@/services/conversations";
import { useAuth } from "@/hooks/useAuth";
import { useActiveClient } from "@/hooks/useActiveClient";

function HubCard({
  icon,
  title,
  count,
  subtitle,
  tone,
  onPress,
  delay = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  count?: number;
  subtitle: string;
  tone?: "danger" | "warning";
  onPress: () => void;
  delay?: number;
}) {
  const accent = tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : colors.primary;
  return (
    <FadeSlideIn delay={delay}>
      <Card onPress={onPress} style={{ marginBottom: spacing.md, flexDirection: "row", alignItems: "center" }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: `${accent}1A`,
            alignItems: "center",
            justifyContent: "center",
            marginRight: spacing.md,
          }}
        >
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{title}</Text>
          <Text style={typography.bodyMuted}>{subtitle}</Text>
        </View>
        {count != null ? (
          <View style={{ minWidth: 28, height: 28, borderRadius: 14, backgroundColor: accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>{count}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        )}
      </Card>
    </FadeSlideIn>
  );
}

// Staff-only hub (see app/(tabs)/_layout.tsx — hidden from a client's tab
// bar). Consolidates the cross-client accounting work a bookkeeper needs
// day to day, without blindly copying the web sidebar's 6 nested groups —
// each card links out to a full screen for that area. Every underlying
// call is already permission-checked server-side (src/lib/permissions.ts);
// this screen just surfaces the counts.
//
// Client-scoping fix: this hub defaults to the firm-wide queue (every
// client) — the right default when nothing is selected. But it previously
// stayed firm-wide even right after a bookkeeper had opened a specific
// client, because none of its cards or count queries knew about that
// selection. It now reads the active client (hooks/useActiveClient.tsx,
// set when opening a client from the Clients tab) and, when one is set,
// scopes both the counts on this screen and every card's destination to
// that client — so "Purchases to validate" opened right after selecting
// "De Vries Consulting BV" shows that client's queue, not the whole
// portfolio's. The bookkeeper stays the bookkeeper throughout: same tabs,
// same permissions, same staff-only endpoints — only which client's data
// is fetched changes, and it's always visible via the "Client actif" bar
// with a one-tap "Quitter" back to the firm-wide view.
export default function AccountingHubScreen() {
  const router = useRouter();
  const { isStaff } = useAuth();
  const { activeClient, clearActiveClient } = useActiveClient();
  const clientId = activeClient?.id;

  useEffect(() => {
    if (!isStaff) router.replace("/");
  }, [isStaff, router]);

  const purchasesQuery = useQuery({
    queryKey: ["purchases-all", clientId ?? "all", "pending"],
    queryFn: () => getAllPurchases({ clientId, status: "uploaded" }),
    enabled: isStaff,
  });
  const bankQuery = useQuery({
    queryKey: ["bank-transactions", clientId ?? "all", "new"],
    queryFn: () => getBankTransactions({ clientId, status: "new" }),
    enabled: isStaff,
  });
  const exceptionsQuery = useQuery({
    queryKey: ["exceptions", clientId ?? "all"],
    queryFn: () => getExceptions(clientId),
    enabled: isStaff,
  });
  const invoicesQuery = useQuery({
    queryKey: ["invoices", clientId ?? "all"],
    queryFn: () => getInvoices(clientId),
    enabled: isStaff,
  });
  const conversationsQuery = useQuery({
    queryKey: ["conversations", clientId ?? "all"],
    queryFn: () => getConversations(clientId),
    enabled: isStaff,
  });

  // Appends the active client, if any, to a hub card's destination —
  // keeping every downstream screen's existing `?clientId=` convention
  // instead of inventing a second way to scope them.
  const scoped = (path: string, extraParams?: Record<string, string>) => {
    const params = new URLSearchParams({ ...(clientId ? { clientId } : {}), ...(extraParams ?? {}) });
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
  };

  if (!isStaff) return null;

  const openExceptions = exceptionsQuery.data?.filter((e) => e.status !== "resolved").length;
  const overdueInvoices = invoicesQuery.data?.filter((i) => i.status === "overdue").length;

  const hasError = purchasesQuery.isError || bankQuery.isError || exceptionsQuery.isError || invoicesQuery.isError || conversationsQuery.isError;
  const unreadConversations = conversationsQuery.data?.filter((c) => c.unreadByAccountant).length;

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      {activeClient ? <ActiveClientBar name={activeClient.name} onExit={clearActiveClient} /> : null}
      {hasError ? <ErrorState message="Some accounting data couldn't be loaded." onRetry={() => {
        purchasesQuery.refetch();
        bankQuery.refetch();
        exceptionsQuery.refetch();
        invoicesQuery.refetch();
        conversationsQuery.refetch();
      }} /> : null}

      <HubCard
        icon="chatbubbles-outline"
        title="Messages"
        subtitle="Client conversations across your portfolio"
        count={unreadConversations}
        tone={unreadConversations ? "warning" : undefined}
        onPress={() => router.push(scoped("/conversations"))}
        delay={0}
      />

      <HubCard
        icon="cart-outline"
        title="Purchases to validate"
        subtitle={activeClient ? `Scanned documents awaiting review — ${activeClient.name}` : "Scanned documents awaiting review"}
        count={purchasesQuery.data?.length}
        tone={purchasesQuery.data && purchasesQuery.data.length > 0 ? "warning" : undefined}
        onPress={() => router.push(scoped("/purchases", { status: "uploaded" }))}
        delay={30}
      />
      <HubCard
        icon="business-outline"
        title="Unmatched bank transactions"
        subtitle="Not yet linked to an invoice or purchase"
        count={bankQuery.data?.length}
        tone={bankQuery.data && bankQuery.data.length > 0 ? "warning" : undefined}
        onPress={() => router.push(scoped("/bank", { status: "new" }))}
        delay={60}
      />
      <HubCard
        icon="alert-circle-outline"
        title="Accounting exceptions"
        subtitle="Open items needing a client's response"
        count={openExceptions}
        tone={openExceptions ? "danger" : undefined}
        onPress={() => router.push(scoped("/exceptions"))}
        delay={90}
      />
      <HubCard
        icon="document-text-outline"
        title="Overdue invoices"
        subtitle={activeClient ? activeClient.name : "Across every client"}
        count={overdueInvoices}
        tone={overdueInvoices ? "danger" : undefined}
        onPress={() => router.push(scoped("/invoices"))}
        delay={120}
      />
      <HubCard icon="people-outline" title="Client portfolio" subtitle="Browse clients and their data" onPress={() => router.push("/clients")} delay={150} />
      <HubCard icon="time-outline" title="Activity log" subtitle={activeClient ? activeClient.name : "Firm-wide audit trail"} onPress={() => router.push(scoped("/audit"))} delay={180} />
      <HubCard icon="bar-chart-outline" title="Reports" subtitle="Invoice aging & expense breakdown" onPress={() => router.push("/reports")} delay={210} />
      <HubCard icon="briefcase-outline" title="Suppliers" subtitle="Purchases grouped by supplier" onPress={() => router.push("/suppliers")} delay={240} />
      <HubCard icon="folder-outline" title="Documents" subtitle="Purchases, invoices & quotations in one place" onPress={() => router.push("/documents")} delay={270} />
    </ScrollView>
  );
}
