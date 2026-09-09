import { NextRequest } from "next/server";
import { searchCompanies, KvkApiError } from "@/lib/kvk";

// Public endpoint for KVK company name search (used during registration)
export async function GET(request: NextRequest) {
  const naam = request.nextUrl.searchParams.get("name");
  if (!naam || naam.length < 2) {
    return Response.json({ error: "Geef minimaal 2 tekens op" }, { status: 400 });
  }

  try {
    const result = await searchCompanies({ naam, resultatenPerPagina: 5 });
    // Return only essential fields for autocomplete
    const results = (result.resultaten || []).map((r) => ({
      kvkNummer: r.kvkNummer,
      naam: r.naam,
      plaats: r.adres?.plaats || "",
      type: r.type,
    }));
    return Response.json({ resultaten: results });
  } catch (error) {
    if (error instanceof KvkApiError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
}
