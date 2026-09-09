import React from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Card, ErrorState, PrimaryButton, StatusBadge, SkeletonDetail } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getQuotation, getQuotationPdfPath } from "@/services/quotations";
import { getApiBaseUrl } from "@/services/api";
import { formatCurrency, formatDate, statusLabel, statusTone } from "@/lib/format";
import { ApiError } from "@/services/api";

// Mirrors app/(tabs)/invoices/[id].tsx exactly — same read-only detail +
// "View PDF" pattern, just for the Quotation resource.
export default function QuotationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: quotation, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["quotation", id],
    queryFn: () => getQuotation(id),
    enabled: !!id,
  });

  if (isLoading) {
    return <SkeletonDetail />;
  }
  if (isError || !quotation) {
    return (
      <ErrorState
        message={error instanceof ApiError ? error.message : "Could not load this quotation."}
        onRetry={() => refetch()}
      />
    );
  }

  const openPdf = () => {
    Linking.openURL(`${getApiBaseUrl()}${getQuotationPdfPath(quotation.id)}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg }} style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: `#${quotation.quotationNumber}`, headerStyle: { backgroundColor: colors.surface } }} />
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={typography.h2}>{quotation.customerName}</Text>
            <Text style={[typography.bodyMuted, { marginTop: 2 }]}>#{quotation.quotationNumber}</Text>
          </View>
          <StatusBadge label={statusLabel(quotation.status)} tone={statusTone(quotation.status)} />
        </View>

        <View style={{ flexDirection: "row", marginTop: spacing.lg, gap: spacing.xl }}>
          <View>
            <Text style={typography.caption}>QUOTATION DATE</Text>
            <Text style={typography.body}>{formatDate(quotation.date)}</Text>
          </View>
          <View>
            <Text style={typography.caption}>VALID UNTIL</Text>
            <Text style={typography.body}>{formatDate(quotation.validUntil)}</Text>
          </View>
        </View>
      </Card>

      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h3, { marginBottom: spacing.md }]}>Lines</Text>
        {quotation.items.map((item, index) => (
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
            <Text style={typography.body}>{formatCurrency(quotation.subtotal)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={typography.bodyMuted}>VAT</Text>
            <Text style={typography.body}>{formatCurrency(quotation.vatAmount)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            <Text style={typography.h3}>Total</Text>
            <Text style={[typography.h3, { color: colors.primary }]}>{formatCurrency(quotation.total)}</Text>
          </View>
        </View>
      </Card>

      {quotation.status === "converted" && quotation.convertedInvoiceId ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={typography.bodyMuted}>This quotation was converted into an invoice.</Text>
        </Card>
      ) : null}

      {quotation.notes ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h3, { marginBottom: spacing.xs }]}>Notes</Text>
          <Text style={typography.body}>{quotation.notes}</Text>
        </Card>
      ) : null}

      <PrimaryButton title="View PDF" onPress={openPdf} />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}
