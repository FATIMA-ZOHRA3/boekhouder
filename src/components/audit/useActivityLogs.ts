"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditEntity } from "@/lib/auditActivity";

export interface ActivityItem {
  id: string;
  createdAt: string;
  entity: AuditEntity;
  action: string;
  entityId: string;
  description: string;
  actorName: string;
  amountLabel: string | null;
  href: string | null;
}

interface UseActivityLogsParams {
  /** The bookkeeper's currently active administration id, or null. */
  clientId: string | null;
  entity?: AuditEntity | null;
  action?: string | null;
  q?: string;
  limit?: number;
  /** Narrow the feed to specific AuditLog entityIds (e.g. a customer + its invoices). */
  entityIds?: string[];
}

export function useActivityLogs({ clientId, entity = null, action = null, q = "", limit = 20, entityIds }: UseActivityLogsParams) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [availableEntities, setAvailableEntities] = useState<AuditEntity[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  // Guards against a slow earlier request overwriting a faster later one
  // when filters change quickly (same pattern as useGlobalSearch.ts).
  const requestId = useRef(0);

  const entityIdsKey = entityIds && entityIds.length > 0 ? entityIds.join(",") : "";

  const buildParams = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (clientId) params.set("clientId", clientId);
      if (entity) params.set("entity", entity);
      if (action) params.set("action", action);
      if (q.trim()) params.set("q", q.trim());
      if (entityIdsKey) params.set("entityIds", entityIdsKey);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", String(limit));
      return params;
    },
    [clientId, entity, action, q, limit, entityIdsKey]
  );

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(false);
    fetch(`/api/audit-logs?${buildParams().toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("request failed");
        return r.json();
      })
      .then((data) => {
        if (id !== requestId.current) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setAvailableEntities(Array.isArray(data.availableEntities) ? data.availableEntities : []);
        setAvailableActions(Array.isArray(data.availableActions) ? data.availableActions : []);
        setNextCursor(data.nextCursor ?? null);
        setHasMore(!!data.hasMore);
      })
      .catch(() => {
        if (id === requestId.current) setError(true);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [buildParams]);

  // setTimeout defers the setState calls inside load() out of the effect's
  // synchronous body — same pattern used by the debounced fetch in
  // useGlobalSearch.ts — instead of calling them directly on every render.
  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    fetch(`/api/audit-logs?${buildParams(nextCursor).toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("request failed");
        return r.json();
      })
      .then((data) => {
        setItems((prev) => [...prev, ...(Array.isArray(data.items) ? data.items : [])]);
        setNextCursor(data.nextCursor ?? null);
        setHasMore(!!data.hasMore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [buildParams, nextCursor, loadingMore]);

  return {
    items,
    availableEntities,
    availableActions,
    loading,
    loadingMore,
    error,
    hasMore,
    retry: load,
    loadMore,
  };
}
