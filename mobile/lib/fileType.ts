// ---------------------------------------------------------------------------
// PART 1 fix — document scan/upload MIME detection.
//
// Root cause of "Invalid file type. Only PDF, JPG and PNG are allowed.":
// the scan screen (app/(tabs)/purchases/scan.tsx) hardcoded
// `type: "image/jpeg"` for every camera capture AND every gallery pick,
// instead of reading the type Expo itself reports on the asset
// (`asset.mimeType`). That's fine only as long as the real file is
// actually a plain JPEG — for anything else (a PNG picked from the
// library, a screenshot, a file whose real bytes don't match the
// hardcoded label), the multipart part's declared Content-Type and the
// file's real content disagree, which is exactly the situation the
// backend's `ALLOWED_TYPES.includes(file.type)` check
// (src/app/api/purchases/upload/route.ts) is meant to catch — and on top
// of that, there was no PDF selection path at all, so PDFs (an explicitly
// accepted type) couldn't be uploaded from this screen in the first
// place.
//
// The fix: never assume the type. Detect it from the strongest available
// source, in order — matching the task brief's own priority list:
//   1. asset.mimeType         — what Expo itself read from the file
//   2. extension on asset.fileName
//   3. extension in the URI (least reliable — Expo cache URIs frequently
//      have none, e.g. `ph://…` / `content://…` / `blob:…`)
//   4. a safe fallback appropriate to how the file was captured
// and build a `{uri, name, type}` triple whose name extension and MIME
// type always agree, so the multipart part sent to the backend is
// internally consistent instead of a hardcoded guess.
// ---------------------------------------------------------------------------

export type NormalizedFile = { uri: string; name: string; type: string };

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

// Mirrors ALLOWED_TYPES in src/app/api/purchases/upload/route.ts. Kept as
// a hand-copied constant rather than imported — the mobile app doesn't
// share a package with the backend (see mobile/README.md "Types") — so if
// the backend's allow-list ever changes, this is the one place to update
// on the mobile side too.
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"];

// Friendly one-liner for the client-side pre-check below.
export const ACCEPTED_TYPES_LABEL = "PDF, JPG or PNG";

function extFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const match = /\.([a-zA-Z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : null;
}

function extFromUri(uri: string): string | null {
  // Strip query string / fragment first — cache URIs from the pickers can
  // carry one after the extension, and `blob:`/`data:` URIs (web) never
  // have a real extension at all, which the fallback below handles.
  const clean = uri.split("?")[0].split("#")[0];
  return extFromName(clean);
}

type RawAsset = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  name?: string | null;
};

/**
 * Turn whatever an Expo camera/gallery/document call returned into a
 * `{uri, name, type}` triple with a real, mutually-consistent MIME type —
 * never inferred purely from `uri.endsWith(...)`, and never assumed to be
 * JPEG just because it came from the camera button.
 *
 * `source` only decides the *last-resort* fallback when nothing else
 * identifies the type: camera captures default to JPEG (expo-camera's
 * takePictureAsync always outputs JPEG), library picks also default to
 * JPEG (the most common gallery format), and document picks default to
 * PDF (the only non-image type offered there).
 */
export function normalizeAsset(asset: RawAsset, source: "camera" | "library" | "document"): NormalizedFile {
  const reportedName = asset.fileName || asset.name || null;
  let mime: string | null = null;

  // 1. Trust the asset's own mimeType — this is what Expo read from the
  //    file itself, not a guess. Normalize the non-standard "image/jpg"
  //    some devices report to the real IANA type "image/jpeg".
  if (asset.mimeType) {
    const reported = asset.mimeType === "image/jpg" ? "image/jpeg" : asset.mimeType;
    if (ACCEPTED_MIME_TYPES.includes(reported)) mime = reported;
  }

  // 2. Fall back to the extension on the reported filename.
  if (!mime) {
    const ext = extFromName(reportedName);
    if (ext && EXT_TO_MIME[ext]) mime = EXT_TO_MIME[ext];
  }

  // 3. Fall back to the extension in the URI itself.
  if (!mime) {
    const ext = extFromUri(asset.uri);
    if (ext && EXT_TO_MIME[ext]) mime = EXT_TO_MIME[ext];
  }

  // 4. Safe fallback based on how the file was captured.
  if (!mime) {
    mime = source === "document" ? "application/pdf" : "image/jpeg";
  }

  const ext = MIME_TO_EXT[mime] || "jpg";
  // Always give the file a name whose extension matches the detected
  // MIME type, so the multipart part's filename and Content-Type never
  // disagree — the mismatch that made the old hardcoded-jpeg approach
  // unreliable for anything that wasn't literally a plain JPEG.
  const baseName = (reportedName ? reportedName.replace(/\.[a-zA-Z0-9]+$/, "") : `scan-${Date.now()}`).trim() || `scan-${Date.now()}`;

  return { uri: asset.uri, name: `${baseName}.${ext}`, type: mime };
}

export function isAcceptedType(type: string): boolean {
  return ACCEPTED_MIME_TYPES.includes(type);
}

export function kindOf(type: string): "image" | "pdf" {
  return type === "application/pdf" ? "pdf" : "image";
}
