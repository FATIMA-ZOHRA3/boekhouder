export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

// Backend dates are plain YYYY-MM-DD strings (see Invoice.date in
// prisma/schema.prisma) — parsed as UTC to avoid off-by-one-day shifts.
export function formatDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

export type BadgeTone = "success" | "warning" | "danger" | "info";

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case "paid":
    case "booked":
      return "success";
    case "overdue":
      return "danger";
    case "sent":
    case "processing":
      return "info";
    default:
      return "warning"; // draft, pending, uploaded, ...
  }
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}
