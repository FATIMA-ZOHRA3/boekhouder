import { apiRequest } from "./api";
import type { Customer } from "@/types/api";

// GET /api/customers — scoped server-side to the current user; staff can
// pass ?clientId= to view a specific client's customers (the web
// bookkeeper Customers page). Now used from the bookkeeper's Client
// detail screen — a client account calling this without clientId still
// just gets their own, unchanged.
export function getCustomers(clientId?: string) {
  return apiRequest<Customer[]>("/api/customers", { query: clientId ? { clientId } : undefined });
}

// POST /api/customers — only `name` is required server-side; userId is
// always the caller's session, never trusted from the request body (see
// src/app/api/customers/route.ts). Used by Voice Invoice when the
// dictated customer name doesn't match an existing one.
export function createCustomer(params: { name: string }) {
  return apiRequest<Customer>("/api/customers", { method: "POST", body: params });
}
