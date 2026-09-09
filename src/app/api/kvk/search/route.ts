import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { searchCompanies, KvkApiError } from "@/lib/kvk";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const kvkNummer = params.get("kvkNummer") || undefined;
  const naam = params.get("name") || undefined;
  const rsin = params.get("rsin") || undefined;
  const vestigingsnummer = params.get("vestigingsnummer") || undefined;
  const plaats = params.get("city") || undefined;
  const postcode = params.get("zip code") || undefined;
  const pagina = params.get("page") ? parseInt(params.get("page")!) : undefined;
  const resultatenPerPagina = params.get("resultatenPerPagina") ? parseInt(params.get("resultatenPerPagina")!) : undefined;

  if (!kvkNummer && !naam && !rsin && !vestigingsnummer) {
    return Response.json({ error: "Provide at least one search field (KVK number, name, RSIN, or establishment number)" }, { status: 400 });
  }

  try {
    const result = await searchCompanies({ kvkNummer, naam, rsin, vestigingsnummer, plaats, postcode, pagina, resultatenPerPagina });
    return Response.json(result);
  } catch (error) {
    if (error instanceof KvkApiError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "Something went wrong while searching" }, { status: 500 });
  }
}
