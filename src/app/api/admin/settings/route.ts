import { getSession } from "@/lib/auth";
import { requirePermissionWithUser } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clearKvkConfigCache } from "@/lib/kvk";

async function requireAdmin() {
  const session = await getSession();
  const check = await requirePermissionWithUser(session, "admin.settings");
  if (!check.ok) return null;
  return check.user;
}

// Get all system settings (masked values for sensitive keys)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const settings = await prisma.systemSetting.findMany();
  // Secrets (API keys) are never sent back to the browser in full — only a masked
  // preview. Previously the raw `value` was included alongside `masked`, and the
  // admin UI used that raw value to pre-fill the input, so the real key round-tripped
  // to the browser on every page load even when nobody touched the field. Non-sensitive
  // settings (URLs, contract numbers) are unaffected and still returned in full.
  const result: Record<string, { value?: string; masked: string; updatedAt: string }> = {};

  for (const s of settings) {
    const isSensitive = s.key.toLowerCase().includes("key") || s.key.toLowerCase().includes("secret");
    const masked = isSensitive && s.value.length > 8
      ? s.value.slice(0, 4) + "••••" + s.value.slice(-4)
      : isSensitive ? "••••••••" : s.value;
    result[s.key] = {
      ...(isSensitive ? {} : { value: s.value }),
      masked,
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  return Response.json(result);
}

// Save/update system settings
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "No access" }, { status: 403 });

  const body = await request.json();
  const { settings } = body as { settings: Record<string, string> };

  if (!settings || typeof settings !== "object") {
    return Response.json({ error: "Invalid settings" }, { status: 400 });
  }

  const results: Record<string, boolean> = {};

  for (const [key, value] of Object.entries(settings)) {
    // Skip empty values — don't overwrite with blank. (This used to only skip
    // null/undefined; an empty string slipped through and would silently wipe an
    // already-configured secret if a settings form ever submitted "" for a field
    // the admin didn't touch — which is exactly what an unfilled password input does.)
    if (!value) continue;

    await prisma.systemSetting.upsert({
      where: { key },
      update: { value: value.trim() },
      create: { key, value: value.trim() },
    });
    results[key] = true;
  }

  // Clear KVK config cache when KVK settings are updated
  if (results["kvk_api_key"] || results["kvk_api_base_url"]) {
    clearKvkConfigCache();
  }

  return Response.json({ success: true, saved: results });
}
