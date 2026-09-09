// KVK (Kamer van Koophandel) API Client
// Based on official documentation: https://developers.kvk.nl/documentation

// ── Types ──

export interface KvkSearchParams {
  kvkNummer?: string;
  rsin?: string;
  vestigingsnummer?: string;
  naam?: string;
  straatnaam?: string;
  huisnummer?: number;
  huisletter?: string;
  postcode?: string;
  plaats?: string;
  postbusnummer?: number;
  type?: string;
  inclusiefInactieveRegistraties?: boolean;
  pagina?: number;
  resultatenPerPagina?: number;
}

export interface KvkLink {
  rel: string;
  href: string;
}

export interface KvkAddress {
  type?: string;
  indAfgeschermd?: string;
  volledigAdres?: string;
  straatnaam?: string;
  huisnummer?: string;
  huisnummerToevoeging?: string;
  huisletter?: string;
  toevoegingAdres?: string;
  postcode?: string;
  postbusnummer?: number;
  plaats?: string;
  straatHuisnummer?: string;
  postcodeWoonplaats?: string;
  regio?: string;
  land?: string;
}

export interface KvkSbiActiviteit {
  sbiCode: string;
  sbiOmschrijving: string;
  indHoofdactiviteit: string;
}

export interface KvkSearchResult {
  kvkNummer: string;
  rsin?: string;
  vestigingsnummer?: string;
  naam: string;
  adres?: KvkAddress;
  type: string;
  actief: string;
  vervallenNaam?: string;
  links: KvkLink[];
}

export interface KvkSearchResponse {
  pagina: number;
  resultatenPerPagina: number;
  totaal: number;
  vorige?: string;
  volgende?: string;
  resultaten: KvkSearchResult[];
}

export interface KvkHoofdvestiging {
  vestigingsnummer: string;
  kvkNummer: string;
  rsin?: string;
  eersteHandelsnaam: string;
  indHoofdvestiging: string;
  indCommercieleVestiging: string;
  voltijdWerkzamePersonen?: number;
  totaalWerkzamePersonen?: number;
  deeltijdWerkzamePersonen?: number;
  handelsnamen: string[];
  adressen: KvkAddress[];
  websites: string[];
  sbiActiviteiten: KvkSbiActiviteit[];
  links: KvkLink[];
}

export interface KvkEigenaar {
  rsin?: string;
  rechtsvorm: string;
  uitgebreideRechtsvorm?: string;
  adressen: KvkAddress[];
  websites: string[];
  links: KvkLink[];
}

export interface KvkBasisprofiel {
  kvkNummer: string;
  indNonMailing?: string;
  naam: string;
  formeleRegistratiedatum?: string;
  statutaireNaam?: string;
  handelsnamen?: string[];
  sbiActiviteiten?: KvkSbiActiviteit[];
  hoofdvestiging?: KvkHoofdvestiging;
  eigenaar?: KvkEigenaar;
  links?: KvkLink[];
}

export interface KvkVestigingsprofiel {
  vestigingsnummer: string;
  kvkNummer: string;
  rsin?: string;
  indNonMailing?: string;
  formeleRegistratiedatum?: string;
  eersteHandelsnaam?: string;
  indHoofdvestiging?: string;
  indCommercieleVestiging?: string;
  voltijdWerkzamePersonen?: number;
  totaalWerkzamePersonen?: number;
  deeltijdWerkzamePersonen?: number;
  handelsnamen?: string[];
  adressen?: KvkAddress[];
  websites?: string[];
  sbiActiviteiten?: KvkSbiActiviteit[];
  links?: KvkLink[];
}

export interface KvkNaamgevingVestiging {
  vestigingsnummer: string;
  eersteHandelsnaam?: string;
  handelsnamen?: string[];
  naam?: string;
  ookGenoemd?: string;
  links?: KvkLink[];
}

export interface KvkNaamgeving {
  kvkNummer: string;
  rsin?: string;
  statutaireNaam?: string;
  naam?: string;
  ookGenoemd?: string;
  startdatum?: string;
  einddatum?: string;
  vestigingen?: KvkNaamgevingVestiging[];
  links?: KvkLink[];
}

// Normalized company data for use in the application
export interface NormalizedCompanyData {
  kvkNumber: string;
  company: string;
  legalForm: string;
  address: string;
  sbiCode: string;
  sbiDescription: string;
  mainBranchNumber: string;
}

// ── Error handling ──

export class KvkApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "KvkApiError";
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  IPD0004: "Invalid KVK number",
  IPD0006: "Invalid establishment number",
  IPD1002: "Data temporarily unavailable (being processed)",
  IPD5200: "No results found for the given search criteria",
  IPD9999: "General technical error at KVK",
};

// ── Validation ──

export function validateVestigingsnummer(nr: string): string | null {
  const digits = nr.replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return "Establishment number may only contain digits";
  if (digits.length !== 12) return "Establishment number must be exactly 12 digits";
  return null;
}

export function validateRsin(rsin: string): string | null {
  const digits = rsin.replace(/\s/g, "");
  if (!/^\d+$/.test(digits)) return "RSIN may only contain digits";
  if (digits.length !== 9) return "RSIN must be exactly 9 digits";
  return null;
}

// ── API client ──

// Simple in-memory cache for DB settings (5 min TTL)
let _configCache: { apiKey: string; baseUrl: string; ts: number } | null = null;
const CONFIG_TTL = 5 * 60 * 1000;

async function getConfig(): Promise<{ apiKey: string; baseUrl: string }> {
  // Return cached config if fresh
  if (_configCache && Date.now() - _configCache.ts < CONFIG_TTL) {
    return { apiKey: _configCache.apiKey, baseUrl: _configCache.baseUrl };
  }

  let apiKey = "";
  let baseUrl = "";

  // Try reading from database first
  try {
    const { prisma } = await import("@/lib/prisma");
    const [dbKey, dbUrl] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: "kvk_api_key" } }),
      prisma.systemSetting.findUnique({ where: { key: "kvk_api_base_url" } }),
    ]);
    if (dbKey?.value) apiKey = dbKey.value;
    if (dbUrl?.value) baseUrl = dbUrl.value;
  } catch {
    // DB not available, fall through to env
  }

  // Fall back to environment variables
  if (!apiKey) apiKey = process.env.KVK_API_KEY || "";
  if (!baseUrl) baseUrl = process.env.KVK_API_BASE_URL || "";
  if (!baseUrl) baseUrl = "https://api.kvk.nl/test/api";

  if (!apiKey) throw new Error("KVK API key is not configured. Set it up via Admin > Settings.");

  _configCache = { apiKey, baseUrl, ts: Date.now() };
  return { apiKey, baseUrl };
}

// Clear config cache (call after saving new settings)
export function clearKvkConfigCache() {
  _configCache = null;
}

async function kvkFetch<T>(endpoint: string, params: Record<string, string | number | boolean> = {}): Promise<T> {
  const { apiKey, baseUrl } = await getConfig();

  const url = new URL(`${baseUrl}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { apikey: apiKey },
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorCode = "";
      let errorMessage = "";
      try {
        const errorBody = await response.json();
        // KVK returns errors as { fout: [{ code, omschrijving }] }
        if (Array.isArray(errorBody?.fout) && errorBody.fout.length > 0) {
          errorCode = errorBody.fout[0].code || "";
          errorMessage = errorBody.fout[0].omschrijving || "";
        } else {
          errorCode = errorBody?.code || "";
          errorMessage = errorBody?.message || "";
        }
      } catch { /* response may not be JSON */ }

      const friendlyMessage = ERROR_MESSAGES[errorCode] || errorMessage || getDefaultErrorMessage(response.status);
      throw new KvkApiError(response.status, errorCode, friendlyMessage);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof KvkApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new KvkApiError(408, "TIMEOUT", "KVK API did not respond in time");
    }
    throw new KvkApiError(500, "NETWORK", "Could not connect to the KVK API");
  } finally {
    clearTimeout(timeout);
  }
}

function getDefaultErrorMessage(status: number): string {
  switch (status) {
    case 400: return "Invalid search query";
    case 401: return "Not authorized for KVK API";
    case 404: return "No data found";
    case 500: return "KVK API is temporarily unavailable";
    default: return `KVK API fout (${status})`;
  }
}

// ── Service methods ──

export async function searchCompanies(params: KvkSearchParams): Promise<KvkSearchResponse> {
  const queryParams: Record<string, string | number | boolean> = {};
  if (params.kvkNummer) queryParams.kvkNummer = params.kvkNummer;
  if (params.rsin) queryParams.rsin = params.rsin;
  if (params.vestigingsnummer) queryParams.vestigingsnummer = params.vestigingsnummer;
  if (params.naam) queryParams.naam = params.naam;
  if (params.straatnaam) queryParams.straatnaam = params.straatnaam;
  if (params.huisnummer) queryParams.huisnummer = params.huisnummer;
  if (params.huisletter) queryParams.huisletter = params.huisletter;
  if (params.postcode) queryParams.postcode = params.postcode;
  if (params.plaats) queryParams.plaats = params.plaats;
  if (params.postbusnummer) queryParams.postbusnummer = params.postbusnummer;
  if (params.type) queryParams.type = params.type;
  if (params.inclusiefInactieveRegistraties) queryParams.inclusiefInactieveRegistraties = true;
  if (params.pagina) queryParams.pagina = params.pagina;
  if (params.resultatenPerPagina) queryParams.resultatenPerPagina = params.resultatenPerPagina;

  return kvkFetch<KvkSearchResponse>("/v2/search", queryParams);
}

export async function getBasisprofiel(kvkNummer: string, geoData = false): Promise<KvkBasisprofiel> {
  const params: Record<string, string | boolean> = {};
  if (geoData) params.geoData = true;
  const raw = await kvkFetch<Record<string, unknown>>(`/v1/basisprofielen/${kvkNummer}`, params);
  // KVK API nests hoofdvestiging and eigenaar under _embedded
  const embedded = (raw._embedded || {}) as Record<string, unknown>;
  return { ...raw, hoofdvestiging: embedded.hoofdvestiging, eigenaar: embedded.eigenaar } as unknown as KvkBasisprofiel;
}

export async function getVestigingsprofiel(vestigingsnummer: string, geoData = false): Promise<KvkVestigingsprofiel> {
  const params: Record<string, string | boolean> = {};
  if (geoData) params.geoData = true;
  return kvkFetch<KvkVestigingsprofiel>(`/v1/vestigingsprofielen/${vestigingsnummer}`, params);
}

export async function getNaamgeving(kvkNummer: string): Promise<KvkNaamgeving> {
  return kvkFetch<KvkNaamgeving>(`/v1/naamgevingen/${kvkNummer}`, {});
}

// ── Response normalization ──

const RECHTSVORM_MAP: Record<string, string> = {
  "Eenmanszaak": "eenmanszaak",
  "eenmanszaak": "eenmanszaak",
  "Besloten Vennootschap": "bv",
  "BeslotenVennootschap": "bv",
  "General partnership (VOF)": "vof",
  "VennootschapOnderFirma": "vof",
  "Commanditaire Vennootschap": "cv",
  "Maatschap": "maatschap",
  "Naamloze Vennootschap": "nv",
  "Stichting": "stichting",
  "Vereniging": "vereniging",
  "Cooperatie": "cooperatie",
  "Cooperative": "cooperatie",
};

function mapRechtsvorm(rechtsvorm: string): string {
  if (!rechtsvorm) return "";
  for (const [key, value] of Object.entries(RECHTSVORM_MAP)) {
    if (rechtsvorm.toLowerCase().includes(key.toLowerCase())) return value;
  }
  return rechtsvorm.toLowerCase();
}

function formatAddress(addr: KvkAddress | undefined): string {
  if (!addr) return "";
  if (addr.volledigAdres) return addr.volledigAdres;
  const parts: string[] = [];
  if (addr.straatnaam) {
    let street = addr.straatnaam;
    if (addr.huisnummer) street += ` ${addr.huisnummer}`;
    if (addr.huisletter) street += addr.huisletter;
    if (addr.huisnummerToevoeging) street += `-${addr.huisnummerToevoeging}`;
    parts.push(street);
  }
  if (addr.postcode && addr.plaats) parts.push(`${addr.postcode} ${addr.plaats}`);
  else if (addr.plaats) parts.push(addr.plaats);
  return parts.join(", ");
}

export function normalizeCompanyData(profiel: KvkBasisprofiel): NormalizedCompanyData {
  const hoofdActiviteit = profiel.sbiActiviteiten?.find((a) => a.indHoofdactiviteit === "Ja") || profiel.sbiActiviteiten?.[0];
  const bezoekAdres = profiel.hoofdvestiging?.adressen?.find((a) => a.type === "bezoekadres") || profiel.hoofdvestiging?.adressen?.[0];

  return {
    kvkNumber: profiel.kvkNummer,
    company: profiel.naam || profiel.statutaireNaam || "",
    legalForm: mapRechtsvorm(profiel.eigenaar?.rechtsvorm || ""),
    address: formatAddress(bezoekAdres),
    sbiCode: hoofdActiviteit?.sbiCode || "",
    sbiDescription: hoofdActiviteit?.sbiOmschrijving || "",
    mainBranchNumber: profiel.hoofdvestiging?.vestigingsnummer || "",
  };
}
