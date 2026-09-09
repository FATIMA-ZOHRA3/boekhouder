import React, { useMemo } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  Card,
  ErrorState,
  StatusBadge,
  SkeletonList,
  TopBar,
  GradientHeroCard,
  BannerAction,
  IconTile,
  SectionHeader,
  ListRow,
  FadeSlideIn,
} from "@/components/ui";
import { typography, spacing, colors } from "@/constants/theme";
import { useAuth } from "@/hooks/useAuth";
import { getInvoices } from "@/services/invoices";
import { getPurchases, getAllPurchases } from "@/services/purchases";
import { getBankTransactions } from "@/services/bank";
import { getExceptions } from "@/services/exceptions";
import { getClients } from "@/services/clients";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// PART 2 fix — role-aware dashboard.
//
// Previously the single dashboard below ran for every role and called
// getInvoices() (which, for a staff session with no clientId, returns
// EVERY client's invoices — src/app/api/invoices/route.ts) and
// getPurchases() (which is always scoped to the caller's OWN uploads —
// src/app/api/purchases/route.ts). For a bookkeeper that meant an
// "OUTSTANDING BALANCE" card summing up every client's invoices as if it
// were their own money owed, and a "recent activity" feed that was
// usually empty, since bookkeepers rarely upload purchases under their
// own account. Splitting into ClientHome/StaffHome — while keeping this
// as one screen file per the "shared components/screens when
// functionality is genuinely shared" instruction — fixes both: the
// client dashboard is byte-for-byte the same experience as before, and
// staff get a dashboard about their actual job (managed clients, items
// needing attention, cross-client activity).
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const { isStaff } = useAuth();
  return isStaff ? <StaffHome /> : <ClientHome />;
}

function ClientHome() {
  const { profile } = useAuth();
  const router = useRouter();

  const invoicesQuery = useQuery({ queryKey: ["invoices", "all"], queryFn: () => getInvoices() });
  const purchasesQuery = useQuery({ queryKey: ["purchases"], queryFn: getPurchases });

  const isRefetching = invoicesQuery.isRefetching || purchasesQuery.isRefetching;
  const refetchAll = () => {
    invoicesQuery.refetch();
    purchasesQuery.refetch();
  };

  // Purely a display sum of amounts the backend already computed and
  // stored on each invoice (total / paidAmount) — no new accounting logic
  // is derived here, same principle as section 13 for the bank screen.
  const outstanding = useMemo(() => {
    if (!invoicesQuery.data) return null;
    return invoicesQuery.data.reduce((sum, inv) => sum + Math.max(inv.total - inv.paidAmount, 0), 0);
  }, [invoicesQuery.data]);

  // Same already-computed per-invoice figures as `outstanding` above, just
  // summing the other side (paidAmount) — for the balance card's
  // Paid/Outstanding split, mirroring the reference design's Income/
  // Expense split with real numbers instead of invented ones.
  const paidTotal = useMemo(() => {
    if (!invoicesQuery.data) return null;
    return invoicesQuery.data.reduce((sum, inv) => sum + inv.paidAmount, 0);
  }, [invoicesQuery.data]);

  const overdueCount = useMemo(
    () => invoicesQuery.data?.filter((inv) => inv.status === "overdue").length ?? 0,
    [invoicesQuery.data]
  );

  const recentActivity = useMemo(() => {
    type Item = { id: string; label: string; amount: number | null; date: string; type: "invoice" | "purchase" };
    const fromInvoices: Item[] =
      invoicesQuery.data?.map((inv) => ({
        id: `inv-${inv.id}`,
        label: `Invoice #${inv.invoiceNumber}`,
        amount: inv.total,
        date: inv.createdAt,
        type: "invoice",
      })) ?? [];
    const fromPurchases: Item[] =
      purchasesQuery.data?.map((p) => ({
        id: `pur-${p.id}`,
        label: p.supplierName || p.fileName,
        amount: p.totalAmount,
        date: p.createdAt,
        type: "purchase",
      })) ?? [];
    return [...fromInvoices, ...fromPurchases]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 6);
  }, [invoicesQuery.data, purchasesQuery.data]);

  const loading = invoicesQuery.isLoading || purchasesQuery.isLoading;
  const initials = (profile?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
      showsVerticalScrollIndicator={false}
    >
      <TopBar
        title={`${greeting()} 👋`}
        subtitle={`${profile?.name ?? ""}${profile?.company ? ` — ${profile.company}` : ""}`}
        initials={initials}
        onAvatarPress={() => router.push("/profile")}
        onBellPress={() => router.push("/notifications")}
        bellDotColor={overdueCount > 0 ? colors.danger : undefined}
      />

      {invoicesQuery.isError ? (
        <ErrorState
          message={invoicesQuery.error instanceof ApiError ? invoicesQuery.error.message : "Could not load your data."}
          onRetry={refetchAll}
        />
      ) : (
        <>
          <FadeSlideIn delay={0}>
            <GradientHeroCard
              eyebrow="Outstanding balance"
              value={loading || outstanding === null ? "—" : formatCurrency(outstanding)}
              badge={overdueCount > 0 ? `${overdueCount} overdue` : undefined}
              caption="Across all your invoices"
              stats={
                loading || outstanding === null || paidTotal === null
                  ? undefined
                  : [
                      { icon: "arrow-down", label: "Paid", value: formatCurrency(paidTotal), tone: "success" },
                      { icon: "arrow-up", label: "Outstanding", value: formatCurrency(outstanding), tone: "danger" },
                    ]
              }
            />
          </FadeSlideIn>

          <FadeSlideIn delay={60}>
            <BannerAction
              icon="scan-outline"
              title="Scan a document"
              subtitle="Quickly scan and add your documents"
              onPress={() => router.push("/purchases/scan")}
            />
          </FadeSlideIn>

          <FadeSlideIn delay={120}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.xl }}>
              <IconTile icon="document-text" label="Invoices" tone="blue" onPress={() => router.push("/invoices")} />
              <IconTile icon="cart" label="Purchases" tone="green" onPress={() => router.push("/purchases")} />
              <IconTile icon="notifications" label="Alerts" tone="orange" onPress={() => router.push("/notifications")} />
              <IconTile icon="person" label="Profile" tone="purple" onPress={() => router.push("/profile")} />
            </View>
          </FadeSlideIn>

          <SectionHeader title="Recent activity" actionLabel="See all" onAction={() => router.push("/invoices")} />
          {loading ? (
            <SkeletonList count={3} />
          ) : recentActivity.length === 0 ? (
            <Card>
              <Text style={typography.bodyMuted}>Nothing yet — new invoices and purchases will show up here.</Text>
            </Card>
          ) : (
            <FadeSlideIn delay={180}>
              <Card style={{ paddingVertical: 0 }}>
                {recentActivity.map((item, i) => (
                  <ListRow
                    key={item.id}
                    icon={item.type === "invoice" ? "arrow-down-circle-outline" : "arrow-up-circle-outline"}
                    tone={item.type === "invoice" ? "green" : "orange"}
                    title={item.label}
                    meta={formatDate(item.date.slice(0, 10))}
                    trailing={item.amount != null ? formatCurrency(item.amount) : "—"}
                    last={i === recentActivity.length - 1}
                  />
                ))}
              </Card>
            </FadeSlideIn>
          )}
        </>
      )}
    </ScrollView>
  );
}

function StatTile({ icon, label, value, tone, onPress, delay = 0 }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone?: "danger" | "warning"; onPress: () => void; delay?: number }) {
  const accent = tone === "danger" ? colors.danger : tone === "warning" ? colors.warning : colors.primary;
  const accentBg = tone === "danger" ? colors.dangerLight : tone === "warning" ? colors.warningLight : colors.primaryLight;
  return (
    <FadeSlideIn delay={delay} style={{ width: "48%", marginBottom: spacing.md }}>
      <Card onPress={onPress}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: accentBg,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: spacing.sm,
          }}
        >
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.textPrimary }}>{value}</Text>
        <Text style={typography.caption}>{label}</Text>
      </Card>
    </FadeSlideIn>
  );
}

// A bookkeeper/admin's dashboard: a portfolio-wide snapshot rather than a
// single account's balance, pulling from the same staff-only,
// permission-checked endpoints used across the rest of the app (see
// services/clients.ts, services/purchases.ts's getAllPurchases,
// services/bank.ts, services/exceptions.ts).
function StaffHome() {
  const { profile } = useAuth();
  const router = useRouter();

  const clientsQuery = useQuery({ queryKey: ["clients"], queryFn: getClients });
  const invoicesQuery = useQuery({ queryKey: ["invoices", "all"], queryFn: () => getInvoices() });
  const purchasesQuery = useQuery({ queryKey: ["purchases-all", "pending"], queryFn: () => getAllPurchases({ status: "uploaded" }) });
  const bankQuery = useQuery({ queryKey: ["bank-transactions", "new"], queryFn: () => getBankTransactions({ status: "new" }) });
  const exceptionsQuery = useQuery({ queryKey: ["exceptions"], queryFn: () => getExceptions() });

  const loading = clientsQuery.isLoading || invoicesQuery.isLoading || purchasesQuery.isLoading || bankQuery.isLoading || exceptionsQuery.isLoading;
  const isRefetching = clientsQuery.isRefetching || invoicesQuery.isRefetching || purchasesQuery.isRefetching || bankQuery.isRefetching || exceptionsQuery.isRefetching;
  const refetchAll = () => {
    clientsQuery.refetch();
    invoicesQuery.refetch();
    purchasesQuery.refetch();
    bankQuery.refetch();
    exceptionsQuery.refetch();
  };
  const hasError = clientsQuery.isError || invoicesQuery.isError || purchasesQuery.isError || bankQuery.isError || exceptionsQuery.isError;

  const overdueCount = invoicesQuery.data?.filter((i) => i.status === "overdue").length ?? 0;
  const openExceptions = exceptionsQuery.data?.filter((e) => e.status !== "resolved").length ?? 0;

  const recentActivity = useMemo(() => {
    if (!invoicesQuery.data || !clientsQuery.data) return [];
    const clientName = new Map(clientsQuery.data.map((c) => [c.id, c.company || c.name]));
    return invoicesQuery.data
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)
      .map((inv) => ({ id: inv.id, label: `Invoice #${inv.invoiceNumber}`, client: clientName.get(inv.clientId) ?? "—", amount: inv.total, date: inv.createdAt }));
  }, [invoicesQuery.data, clientsQuery.data]);

  const initials = (profile?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} />}
      showsVerticalScrollIndicator={false}
    >
      <TopBar
        title={`${greeting()} 👋`}
        subtitle={profile?.name}
        initials={initials}
        onAvatarPress={() => router.push("/profile")}
        onBellPress={() => router.push("/notifications")}
        bellDotColor={overdueCount > 0 || openExceptions > 0 ? colors.danger : undefined}
      />

      {hasError ? (
        <ErrorState message="Could not load your dashboard." onRetry={refetchAll} />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
            <StatTile icon="people" label="Managed clients" value={loading ? "—" : String(clientsQuery.data?.length ?? 0)} onPress={() => router.push("/clients")} delay={0} />
            <StatTile
              icon="cart"
              label="Purchases pending"
              value={loading ? "—" : String(purchasesQuery.data?.length ?? 0)}
              tone={purchasesQuery.data && purchasesQuery.data.length > 0 ? "warning" : undefined}
              onPress={() => router.push("/purchases?status=uploaded")}
              delay={40}
            />
            <StatTile
              icon="business"
              label="Unmatched transactions"
              value={loading ? "—" : String(bankQuery.data?.length ?? 0)}
              tone={bankQuery.data && bankQuery.data.length > 0 ? "warning" : undefined}
              onPress={() => router.push("/bank?status=new")}
              delay={80}
            />
            <StatTile
              icon="alert-circle"
              label="Open exceptions"
              value={loading ? "—" : String(openExceptions)}
              tone={openExceptions > 0 ? "danger" : undefined}
              onPress={() => router.push("/exceptions")}
              delay={120}
            />
          </View>

          {overdueCount > 0 ? (
            <View style={{ marginBottom: spacing.lg }}>
              <StatusBadge label={`${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"} across your clients`} tone="danger" />
            </View>
          ) : null}

          <SectionHeader title="Recent client activity" actionLabel="See all" onAction={() => router.push("/accounting")} />
          {loading ? (
            <SkeletonList count={3} />
          ) : recentActivity.length === 0 ? (
            <Card>
              <Text style={typography.bodyMuted}>Nothing yet — client invoices will show up here.</Text>
            </Card>
          ) : (
            <FadeSlideIn delay={160}>
              <Card style={{ paddingVertical: 0 }}>
                {recentActivity.map((item, i) => (
                  <ListRow
                    key={item.id}
                    icon="document-text-outline"
                    tone="blue"
                    title={item.label}
                    meta={`${item.client} · ${formatDate(item.date.slice(0, 10))}`}
                    trailing={formatCurrency(item.amount)}
                    last={i === recentActivity.length - 1}
                  />
                ))}
              </Card>
            </FadeSlideIn>
          )}
        </>
      )}
    </ScrollView>
  );
}
