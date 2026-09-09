import { apiRequest } from "./api";
import type { AppNotification } from "@/types/api";

type NotificationsResponse = {
  notifications: AppNotification[];
  total: number;
  unreadCount: number;
};

export function getNotifications() {
  return apiRequest<NotificationsResponse>("/api/notifications");
}

export function markNotificationRead(id: string, isRead: boolean) {
  return apiRequest<AppNotification>(`/api/notifications/${id}`, { method: "PATCH", body: { isRead } });
}

export function markAllNotificationsRead() {
  return apiRequest<{ success: true }>("/api/notifications/mark-all-read", { method: "POST" });
}
