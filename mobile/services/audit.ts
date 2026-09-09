import { apiRequest } from "./api";
import type { AuditEntity, AuditLogResponse } from "@/types/api";

// GET /api/audit-logs — staff-only server-side (requireRole(["bookkeeper",
// "admin"])); a client account gets a 403. There is no client-visible
// activity feed anywhere in the backend, so this service (and the screen
// that uses it) is never reachable from a client account — see
// app/audit/index.tsx's guard.
//
// `clientId` narrows to one administration exactly like the web Activity
// Timeline; omitted, the backend only returns firm-wide entries (never
// "everything from every client" — see buildScopeWhere() server-side), so
// mobile doesn't need its own extra guard against over-fetching here.
export function getAuditLogs(params: {
  clientId?: string;
  entity?: AuditEntity;
  action?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
}) {
  return apiRequest<AuditLogResponse>("/api/audit-logs", {
    query: {
      clientId: params.clientId,
      entity: params.entity,
      action: params.action,
      q: params.q,
      cursor: params.cursor ?? undefined,
      limit: params.limit,
    },
  });
}
