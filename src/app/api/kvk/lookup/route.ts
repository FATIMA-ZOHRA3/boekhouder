import { NextRequest } from "next/server";
import { validateKvk } from "@/lib/auth";
import { getBasisprofiel, normalizeCompanyData, KvkApiError } from "@/lib/kvk";

// Public endpoint for KVK lookup (used during registration, no session required)
export async function GET(request: NextRequest) {
  const kvkNummer = request.nextUrl.searchParams.get("kvkNummer");
  if (!kvkNummer) return Response.json({ error: "KVK number is required" }, { status: 400 });

  const validationError = validateKvk(kvkNummer);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  try {
    const profiel = await getBasisprofiel(kvkNummer);
    const normalized = normalizeCompanyData(profiel);
    // Return only normalized data (no raw data for public endpoint)
    return Response.json(normalized);
  } catch (error) {
    if (error instanceof KvkApiError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "Something went wrong while fetching the profile" }, { status: 500 });
  }
}
