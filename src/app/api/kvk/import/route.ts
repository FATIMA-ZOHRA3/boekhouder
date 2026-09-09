import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getBasisprofiel, normalizeCompanyData, KvkApiError } from "@/lib/kvk";
import { prisma } from "@/lib/prisma";

// Import or sync a company from KVK into the customer database
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = await request.json();
  const { kvkNummer, customerId, mode } = body as {
    kvkNummer: string;
    customerId?: string; // If provided, update existing customer
    mode?: "import" | "sync"; // sync = refresh existing
  };

  if (!kvkNummer || !/^\d{8}$/.test(kvkNummer.replace(/\s/g, ""))) {
    return Response.json({ error: "Invalid KVK number (8 digits required)" }, { status: 400 });
  }

  const cleanKvk = kvkNummer.replace(/\s/g, "");

  try {
    const profiel = await getBasisprofiel(cleanKvk);
    const normalized = normalizeCompanyData(profiel);

    // Build address from KVK data
    const hoofdvestiging = profiel.hoofdvestiging;
    const bezoekAdres = hoofdvestiging?.adressen?.find((a) => a.type === "bezoekadres") || hoofdvestiging?.adressen?.[0];
    const fullAddress = bezoekAdres?.volledigAdres ||
      [bezoekAdres?.straatnaam, bezoekAdres?.huisnummer, bezoekAdres?.postcode, bezoekAdres?.plaats].filter(Boolean).join(" ");

    const kvkCustomerData = {
      name: normalized.company,
      kvkNumber: normalized.kvkNumber,
      legalForm: normalized.legalForm,
      address: fullAddress || null,
      city: bezoekAdres?.plaats || null,
      postalCode: bezoekAdres?.postcode || null,
      sbiCode: normalized.sbiCode || null,
      sbiDescription: normalized.sbiDescription || null,
      kvkLastSynced: new Date(),
      kvkData: JSON.stringify(normalized),
    };

    if (mode === "sync" && customerId) {
      // Sync mode: update existing customer with KVK data
      const existing = await prisma.customer.findFirst({
        where: { id: customerId, userId: session.userId },
      });
      if (!existing) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      const updated = await prisma.customer.update({
        where: { id: customerId },
        data: kvkCustomerData,
      });

      return Response.json({
        action: "synced",
        customer: updated,
        kvkData: normalized,
        message: "KVK data has been updated.",
      });
    }

    // Import mode: check for duplicate
    const existingByKvk = await prisma.customer.findFirst({
      where: { userId: session.userId, kvkNumber: cleanKvk },
    });

    if (existingByKvk) {
      return Response.json({
        action: "duplicate",
        customer: existingByKvk,
        kvkData: normalized,
        message: `This customer already exists: ${existingByKvk.name}`,
      });
    }

    // Create new customer
    const customer = await prisma.customer.create({
      data: {
        userId: session.userId,
        ...kvkCustomerData,
      },
    });

    return Response.json({
      action: "imported",
      customer,
      kvkData: normalized,
      message: `${normalized.company} was imported successfully.`,
    });
  } catch (error) {
    if (error instanceof KvkApiError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return Response.json({ error: "Something went wrong while fetching KVK data" }, { status: 500 });
  }
}
