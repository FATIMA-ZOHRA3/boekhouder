import { Badge, type BadgeTone } from "./Badge";

// ---------------------------------------------------------------------------
// One status→label/tone map shared by every list view (invoices, purchase
// documents, bank transactions, tasks, exceptions...) instead of each page
// re-declaring its own copy of `statusLabels` / `colors`. Extends the sets
// that used to live separately in app/client/page.tsx and
// app/bookkeeper/page.tsx — every key that existed in either is preserved.
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  partial: "Partially paid",
  overdue: "Expired",
  pending: "Pending",
  processing: "Processing",
  processed: "Processed",
  uploaded: "Uploaded",
  booked: "Booked",
  to_book: "To book",
  new: "New",
  matched: "Matched",
  reconciled: "Reconciled",
  waiting: "Waiting",
  responded: "Responded",
  resolved: "Resolved",
  accepted: "Accepted",
  expired: "Expired",
  rejected: "Rejected",
  converted: "Converted",
  open: "Open",
  in_progress: "In progress",
  critical: "Critical",
  needs_review: "Needs review",
};

const STATUS_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  sent: "info",
  paid: "success",
  partial: "warning",
  overdue: "danger",
  pending: "warning",
  processing: "info",
  processed: "success",
  uploaded: "info",
  booked: "success",
  to_book: "warning",
  new: "info",
  matched: "success",
  reconciled: "success",
  waiting: "warning",
  responded: "info",
  resolved: "success",
  accepted: "success",
  expired: "danger",
  rejected: "danger",
  converted: "primary",
  open: "warning",
  in_progress: "info",
  critical: "danger",
  needs_review: "warning",
};

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status] || "neutral"} className={className}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}
