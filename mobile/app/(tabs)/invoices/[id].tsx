import React from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorState, PrimaryButton, StatusBadge, SkeletonDetail } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getInvoice, getInvoicePdfPath } from "@/services/invoices";
import { getApiBaseUrl } from "@/services/api";
import { formatCurrency, formatDate, statusLabel, statusTone } from "@/lib/format";
import { ApiError } from "@/services/api";

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: invoice, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => getInvoice(id),
    enabled: !!id,
  });

  if (isLoading) {
    return <SkeletonDetail />;
  }
  if (isError || !invoice) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : "Could not load this invoice."}
        onRetry={() => refetch()}
      />
    );
  }

  const openPdf = () => {
    Linking.openURL(`${getApiBaseUrl()}${getInvoicePdfPath(invoice.id)}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={typography.h2}>{invoice.customerName}</Text>
            <Text style={[typography.bodyMuted, { marginTop: 2 }]}>#{invoice.invoiceNumber}</Text>
          </View>
          <StatusBadge label={statusLabel(invoice.status)} tone={statusTone(invoice.status)} />
        </View>

        <View style={{ flexDirection: "row", marginTop: spacing.lg, gap: spacing.xl }}>
          <View>
            <Text style={typography.caption}>INVOICE DATE</Text>
            <Text style={typography.body}>{formatDate(invoice.date)}</Text>
          </View>
          <View>
            <Text style={typography.caption}>DUE DATE</Text>
            <Text style={typography.body}>{formatDate(invoice.dueDate)}</Text>
          </View>
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h3, { marginBottom: spacing.md }]}>Lines</Text>
        {invoice.items.map((item, index) => (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              paddingVertical: spacing.sm,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ flex: 1, marginRight: spacing.md }}>
              <Text style={typography.body}>{item.description}</Text>
              <Text style={typography.caption}>
                {item.quantity} × {formatCurrency(item.unitPrice)} · {item.vatRate}% VAT
              </Text>
            </View>
            <Text style={typography.body}>{formatCurrency(item.quantity * item.unitPrice)}</Text>
          </View>
        ))}

        <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={typography.bodyMuted}>Subtotal</Text>
            <Text style={typography.body}>{formatCurrency(invoice.subtotal)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={typography.bodyMuted}>VAT</Text>
            <Text style={typography.body}>{formatCurrency(invoice.vatAmount)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={typography.h3}>Total</Text>
            <Text style={[typography.h3, { color: colors.primary }]}>{formatCurrency(invoice.total)}</Text>
          </View>
          {invoice.paidAmount > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={typography.bodyMuted}>Paid</Text>
              <Text style={typography.body}>{formatCurrency(invoice.paidAmount)}</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {invoice.notes ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h3, { marginBottom: spacing.xs }]}>Notes</Text>
          <Text style={typography.body}>{invoice.notes}</Text>
        </Card>
      ) : null}

      <PrimaryButton title="View PDF" onPress={openPdf} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}
