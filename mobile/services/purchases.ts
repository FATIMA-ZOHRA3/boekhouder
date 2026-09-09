import { Platform } from "react-native";
import { apiRequest } from "./api";
import type { PurchaseDocument, PurchaseScanResult } from "@/types/api";

// GET /api/purchases — always scoped server-side to the current user
// (client and staff alike only see their own uploads here). This is what
// the client role's Purchases tab uses. For the bookkeeper's cross-client
// queue, see getAllPurchases() below (GET /api/purchases/all), which is
// what the mobile app now uses for staff — it used to call this same
// function for every role, which is why a bookkeeper's Purchases tab
// used to show only their own (usually empty) uploads instead of the
// clients' documents actually needing review.
export function getPurchases() {
  return apiRequest<PurchaseDocument[]>("/api/purchases");
}

export function getPurchase(id: string) {
  return apiRequest<PurchaseDocument>(`/api/purchases/${id}`);
}

// GET /api/purchases/all — staff-only (requires "purchase.read", which
// only bookkeeper/admin have). Cross-client purchase queue used by the
// bookkeeper's Accounting tab and Client detail screen; every document
// comes back with its owning `user` populated so the UI can show whose
// purchase it is. Optional `clientId` scopes it to one client (used from
// the Client detail screen); omitted, it returns every client's uploads —
// this is the real "purchases requiring validation" queue a bookkeeper
// needs, which the mobile app never called before this fix (it only ever
// showed the staff member's own — usually empty — uploads via
// getPurchases()).
export function getAllPurchases(params?: { clientId?: string; status?: string }) {
  return apiRequest<PurchaseDocument[]>("/api/purchases/all", { query: params });
}

// POST /api/purchases/upload — multipart form, same endpoint the web
// upload dialog posts to.
//
// On iOS/Android, `file` must be the React Native file object shape
// ({ uri, name, type }) — RN's native networking layer recognizes this
// object and streams the file from `uri` itself.
//
// On web (react-native-web, e.g. `npm run web`), there is no such native
// networking layer: `formData.append` is the browser's real DOM FormData,
// which only accepts a string or a Blob/File as the value. Handed the RN
// object shape instead, the browser silently calls `String(value)` on it
// ("[object Object]") and appends that as a text field — the file itself
// never reaches the request body. The server then sees no real file part,
// `file.type` comes back undefined, and every upload fails the allowed-type
// check with "Invalid file type", regardless of what was actually picked.
// The fix is to fetch() the local uri (a blob:/data: URL from the picker on
// web) into a real Blob first, and append that.
async function buildFilePart(file: { uri: string; name: string; type: string }): Promise<FormData> {
  const formData = new FormData();
  if (Platform.OS === "web") {
    const blob = await fetch(file.uri).then((r) => r.blob());
    formData.append("file", blob, file.name);
  } else {
    // @ts-expect-error React Native's FormData accepts this shape; the DOM
    // File type FormData expects doesn't exist in this environment.
    formData.append("file", { uri: file.uri, name: file.name, type: file.type });
  }
  return formData;
}

// `userId` lets a staff account upload on behalf of a selected client (the
// backend already supported this — see the `requestedUserId`/`targetUserId`
// handling in src/app/api/purchases/upload/route.ts — the mobile scan
// screen just didn't send it before). Ignored server-side for client
// accounts, same as the PATCH fields below.
export async function uploadPurchaseDocument(
  file: { uri: string; name: string; type: string },
  options?: { label?: string; userId?: string }
) {
  const formData = await buildFilePart(file);
  if (options?.label) formData.append("label", options.label);
  if (options?.userId) formData.append("userId", options.userId);
  return apiRequest<PurchaseDocument>("/api/purchases/upload", {
    method: "POST",
    body: formData,
    isFormData: true,
  });
}

// PATCH /api/purchases/[id] — the route itself only lets bookkeeper/admin
// set bookkeeping fields (supplierName, amount, ...); a client caller
// gets those fields silently ignored server-side and can only move
// `status`. Same "AI proposes, accountant confirms" contract as the web
// app — nothing here bypasses that.
export type PurchaseUpdate = Partial<
  Pick<
    PurchaseDocument,
    "status" | "supplierName" | "invoiceNumber" | "amount" | "vatAmount" | "totalAmount" | "documentDate" | "category"
  >
>;

export function updatePurchaseDocument(id: string, data: PurchaseUpdate) {
  return apiRequest<PurchaseDocument>(`/api/purchases/${id}`, { method: "PATCH", body: data });
}

// POST /api/ai/scan-purchase-document — staff-only server-side
// (`ai.use` permission); calling this as a client account gets a 403 from
// the backend. The mobile UI only shows the "Recognize with AI" action to
// bookkeeper/admin accounts (see purchases/[id].tsx) to match.
//
// `force` requests a fresh Groq call even if the document already has scanned/
// filled-in data — without it, the backend returns the existing data straight
// from the database (`fromCache: true`) instead of calling Groq again. Default
// is false: a rescan must be explicitly requested by the user.
export function scanPurchaseDocument(purchaseDocumentId: string, force = false) {
  return apiRequest<PurchaseScanResult>("/api/ai/scan-purchase-document", {
    method: "POST",
    body: { purchaseDocumentId, force },
  });
}
