import { getSession } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { getLastScanStats } from "@/app/api/ai/scan-purchase-document/route";
import { getGroqQuotaSnapshot } from "@/lib/ai";

// Read-only diagnostic for the Admin panel: surfaces the before/after resolution
// and file size of the most recent invoice/receipt scan, plus which quota tier
// produced it, so the effect of the progressive resolution logic (see
// chooseScanResolution in lib/ai.ts) is visible without digging through server
// logs. In-memory only (see lastScanStats in the sibling route) — returns null
// until at least one scan has run since the last server restart. `quota` is the
// last real Groq headers seen for the vision model — also null until a scan
// has actually called Groq at least once.
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const check = await requirePermission(session, "admin.settings");
  if (!check.ok) return Response.json({ error: "No access" }, { status: check.status });

  return Response.json({ lastScan: getLastScanStats(), quota: getGroqQuotaSnapshot() });
}
