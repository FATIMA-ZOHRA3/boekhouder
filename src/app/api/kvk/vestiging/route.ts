import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getVestigingsprofiel, validateVestigingsnummer, KvkApiError } from "@/lib/kvk";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const vestigingsnummer = request.nextUrl.searchParams.get("vestigingsnummer");
  if (!vestigingsnummer) return Response.json({ error: "Establishment number is required" }, { status: 400 });

  const validationError = validateVestigingsnummer(vestigingsnummer);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const geoData = request.nextUrl.searchParams.get("geoData") === "true";

  try {
    const profiel = await getVestigingsprofiel(vestigingsnummer, geoData);
    return Response.json(profiel);
  } catch (error) {
    if (error instanceof KvkApiError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "Something went wrong while fetching the establishment profile" }, { status: 500 });
  }
}
