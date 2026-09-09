// Helper to create notifications from server-side code
import { prisma } from "./prisma";

export type NotificationType =
  | "invoice_booked"
  | "invoice_sent"
  | "invoice_overdue"
  | "reminder_sent"
  | "payment_received"
  | "bank_import"
  | "bank_reconciled"
  | "purchase_booked"
  | "exception_created"
  | "exception_responded"
  | "task_assigned"
  | "task_completed"
  | "client_registered"
  | "system";

export type NotificationCategory =
  | "critical"
  | "warning"
  | "success"
  | "info"
  | "reminder"
  | "task"
  | "bookkeeping"
  | "payment"
  | "system";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  priority?: number; // 0=normal, 1=high, 2=critical
  actionUrl?: string;
  actionLabel?: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      category: input.category,
      title: input.title,
      message: input.message,
      priority: input.priority ?? 0,
      actionUrl: input.actionUrl ?? null,
      actionLabel: input.actionLabel ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });
}

// Pre-built notification templates for common events
export const notificationTemplates = {
  invoiceBooked: (userId: string, invoiceNumber: string, customerName: string, invoiceId: string) =>
    createNotification({
      userId,
      type: "invoice_booked",
      category: "bookkeeping",
      title: "Invoice booked",
      message: `Invoice ${invoiceNumber} from ${customerName} has been booked successfully.`,
      actionUrl: `/bookkeeper/invoices/${invoiceId}`,
      actionLabel: "View invoice",
      sourceType: "invoice",
      sourceId: invoiceId,
    }),

  invoiceOverdue: (userId: string, invoiceNumber: string, customerName: string, amount: number, invoiceId: string) =>
    createNotification({
      userId,
      type: "invoice_overdue",
      category: "warning",
      title: "Invoice overdue",
      message: `Invoice ${invoiceNumber} from ${customerName} (${formatEur(amount)}) is overdue.`,
      priority: 1,
      actionUrl: `/bookkeeper?section=sales`,
      actionLabel: "View receivables",
      sourceType: "invoice",
      sourceId: invoiceId,
    }),

  reminderSent: (userId: string, invoiceNumber: string, customerName: string, invoiceId: string) =>
    createNotification({
      userId,
      type: "reminder_sent",
      category: "reminder",
      title: "Reminder sent",
      message: `Payment reminder sent to ${customerName} for invoice ${invoiceNumber}.`,
      actionUrl: `/bookkeeper/invoices/${invoiceId}`,
      actionLabel: "View invoice",
      sourceType: "invoice",
      sourceId: invoiceId,
    }),

  paymentReceived: (userId: string, invoiceNumber: string, customerName: string, amount: number, invoiceId: string) =>
    createNotification({
      userId,
      type: "payment_received",
      category: "payment",
      title: "Payment received",
      message: `${formatEur(amount)} received from ${customerName} for invoice ${invoiceNumber}.`,
      actionUrl: `/bookkeeper/invoices/${invoiceId}`,
      actionLabel: "View invoice",
      sourceType: "invoice",
      sourceId: invoiceId,
    }),

  bankImport: (userId: string, count: number, account: string) =>
    createNotification({
      userId,
      type: "bank_import",
      category: "info",
      title: "Bank transactions imported",
      message: `${count} transactie${count !== 1 ? "s" : ""} imported for account ${account}.`,
      actionUrl: "/bookkeeper?section=bank",
      actionLabel: "View transactions",
      sourceType: "bank",
    }),

  bankReconciled: (userId: string, count: number) =>
    createNotification({
      userId,
      type: "bank_reconciled",
      category: "success",
      title: "Reconciliation completed",
      message: `${count} transactie${count !== 1 ? "s" : ""} reconciled successfully.`,
      actionUrl: "/bookkeeper?section=afletteren",
      actionLabel: "View reconciliation",
      sourceType: "bank",
    }),

  purchaseBooked: (userId: string, supplierName: string, docId: string) =>
    createNotification({
      userId,
      type: "purchase_booked",
      category: "bookkeeping",
      title: "Purchase invoice booked",
      message: `Purchase invoice from ${supplierName} has been booked.`,
      actionUrl: "/bookkeeper?section=purchases",
      actionLabel: "View purchases",
      sourceType: "purchase",
      sourceId: docId,
    }),

  exceptionCreated: (userId: string, title: string, clientName: string) =>
    createNotification({
      userId,
      type: "exception_created",
      category: "warning",
      title: "Exception created",
      message: `New exception "${title}" for ${clientName}.`,
      priority: 1,
      actionUrl: "/bookkeeper?section=dashboard",
      actionLabel: "View exceptions",
      sourceType: "exception",
    }),

  exceptionResponded: (userId: string, title: string, clientName: string) =>
    createNotification({
      userId,
      type: "exception_responded",
      category: "info",
      title: "Reply to exception",
      message: `${clientName} heeft gereageerd op "${title}".`,
      actionUrl: "/bookkeeper?section=dashboard",
      actionLabel: "View reply",
      sourceType: "exception",
    }),

  taskAssigned: (userId: string, taskTitle: string) =>
    createNotification({
      userId,
      type: "task_assigned",
      category: "task",
      title: "New task",
      message: `Task "${taskTitle}" has been assigned to you.`,
      actionUrl: "/bookkeeper?section=taken",
      actionLabel: "View tasks",
      sourceType: "task",
    }),

  clientRegistered: (userId: string, clientName: string, companyName: string) =>
    createNotification({
      userId,
      type: "client_registered",
      category: "info",
      title: "New customer registered",
      message: `${clientName} (${companyName}) heeft zich geregistreerd.`,
      actionUrl: "/bookkeeper?section=settings",
      actionLabel: "View customers",
      sourceType: "system",
    }),
};

function formatEur(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}
