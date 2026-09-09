import { getSession } from "@/lib/auth";
import { searchCompanies, KvkApiError } from "@/lib/kvk";

// Test KVK API connection by performing a simple search
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  // Check if API key is configured
  if (!process.env.KVK_API_KEY) {
    return Response.json({
      connected: false,
      error: "KVK API key is not configured. Add KVK_API_KEY to the environment variables.",
    });
  }

  try {
    // Do a minimal search to verify the key works
    await searchCompanies({ naam: "test", resultatenPerPagina: 1 });
    return Response.json({
      connected: true,
      message: "KVK API connection is active and working correctly.",
      baseUrl: process.env.KVK_API_BASE_URL || "https://api.kvk.nl/test/api",
    });
  } catch (error) {
    if (error instanceof KvkApiError) {
      if (error.status === 401) {
        return Response.json({
          connected: false,
          error: "KVK API key is invalid or expired. Check your API key.",
        });
      }
      // A "no results" error still means the connection works
      if (error.code === "IPD5200") {
        return Response.json({
          connected: true,
          message: "KVK API connection is active and working correctly.",
          baseUrl: process.env.KVK_API_BASE_URL || "https://api.kvk.nl/test/api",
        });
      }
      return Response.json({
        connected: false,
        error: `KVK API-fout: ${error.message}`,
      });
    }
    return Response.json({
      connected: false,
      error: "Could not connect to the KVK API. Check your network and settings.",
    });
  }
}
