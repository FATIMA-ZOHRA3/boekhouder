import React, { useEffect, useRef } from "react";
import { Animated, FlatList, RefreshControl, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen, Card, EmptyState, ErrorState, PrimaryButton, SkeletonList } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/theme";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/notifications";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/services/api";
import type { AppNotification } from "@/types/api";

const CATEGORY_TONE: Record<string, "success" | "warning" | "danger" | "info"> = {
  critical: "danger",
  warning: "warning",
  success: "success",
};

function NotificationRow({ item, onPress }: { item: AppNotification; onPress: () => void }) {
  const dotColor =
    CATEGORY_TONE[item.category] === "danger"
      ? colors.danger
      : CATEGORY_TONE[item.category] === "warning"
      ? colors.warning
      : CATEGORY_TONE[item.category] === "success"
      ? colors.success
      : colors.primary;

  // Fades to the "read" opacity instead of flipping instantly the moment
  // markNotificationRead resolves and the list refetches (section 8: "un
  // changement d'état doux").
  const opacity = useRef(new Animated.Value(item.isRead ? 0.6 : 1)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: item.isRead ? 0.6 : 1, duration: 220, useNativeDriver: true }).start();
  }, [item.isRead, opacity]);

  return (
    <Card onPress={onPress} style={{ marginBottom: spacing.sm }}>
      <Animated.View style={{ flexDirection: "row", alignItems: "flex-start", opacity }}>
        {!item.isRead ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor, marginTop: 6, marginRight: spacing.sm }} />
        ) : (
          <View style={{ width: 8, marginRight: spacing.sm }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={typography.h3}>{item.title}</Text>
          <Text style={[typography.bodyMuted, { marginTop: 2 }]}>{item.message}</Text>
          <Text style={[typography.caption, { marginTop: spacing.xs }]}>{formatDate(item.createdAt.slice(0, 10))}</Text>
        </View>
      </Animated.View>
    </Card>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
  });

  const onPressNotification = async (item: AppNotification) => {
    if (!item.isRead) {
      // Optimistic-ish: fire the request, then refresh the list. Errors
      // are non-fatal here — worst case the dot just doesn't clear yet.
      markNotificationRead(item.id, true).then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
    }
    // Deep links (actionUrl) point at web app routes like
    // /bookkeeper/invoices/[id] — not usable 1:1 in the mobile router, so
    // navigation is limited to the two source types the mobile app itself
    // has detail screens for.
    if (item.sourceType === "invoice" && item.sourceId) {
      router.push(`/invoices/${item.sourceId}`);
    } else if (item.sourceType === "purchase" && item.sourceId) {
      router.push(`/purchases/${item.sourceId}`);
    }
  };

  const markAllRead = () => {
    markAllNotificationsRead().then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
  };

  return (
    <Screen>
      {isLoading ? (
        <SkeletonList withTrailing={false} />
      ) : isError ? (
        <ErrorState message={error instanceof ApiError ? error.message : "Could not load notifications."} onRetry={() => refetch()} />
      ) : !data || data.notifications.length === 0 ? (
        <EmptyState title="No notifications" subtitle="You're all caught up." />
      ) : (
        <>
          {data.unreadCount > 0 ? (
            <View style={{ marginBottom: spacing.md }}>
              <PrimaryButton title={`Mark all ${data.unreadCount} as read`} onPress={markAllRead} />
            </View>
          ) : null}
          <FlatList
            data={data.notifications}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <NotificationRow item={item} onPress={() => onPressNotification(item)} />}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </Screen>
  );
}
