// MT940 Parser for Dutch bank statements
// Based on SWIFT MT940 standard used by Dutch banks (ING, ABN AMRO, Rabobank, etc.)

export interface MT940Transaction {
  date: string;          // YYYY-MM-DD
  amount: number;        // absolute value
  direction: "debit" | "credit";
  description: string;
  counterparty: string;
  counterpartyAccount: string;
  bankAccount: string;
  rawData: string;
}

export interface MT940ParseResult {
  success: boolean;
  bankAccount: string;
  transactions: MT940Transaction[];
  error?: string;
  dateRange?: { from: string; to: string };
}

function parseDate(yymmdd: string): string {
  if (yymmdd.length !== 6) return "";
  const yy = parseInt(yymmdd.substring(0, 2));
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);
  const year = yy > 80 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

function parseAmount(amountStr: string): number {
  // MT940 uses comma as decimal separator
  return Math.abs(parseFloat(amountStr.replace(",", ".")));
}

export function parseMT940(content: string): MT940ParseResult {
  const lines = content.split(/\r?\n/);
  const transactions: MT940Transaction[] = [];
  let bankAccount = "";
  let currentTransaction: Partial<MT940Transaction> | null = null;
  let descriptionLines: string[] = [];

  try {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // :25: Account identification
      if (line.startsWith(":25:")) {
        const accountInfo = line.substring(4);
        // Could be IBAN or legacy format
        bankAccount = accountInfo.replace(/\//g, "");
      }

      // :61: Transaction line
      // Format: :61:YYMMDD[MMDD]D/CAmount[N]Reference
      if (line.startsWith(":61:")) {
        // Save previous transaction if exists
        if (currentTransaction?.date) {
          currentTransaction.description = descriptionLines.join(" ").trim();
          transactions.push(currentTransaction as MT940Transaction);
        }

        const data = line.substring(4);
        const date = parseDate(data.substring(0, 6));

        // Find D or C for direction (may be at position 6 or 10)
        let dirPos = 6;
        // Check if there's a second date (MMDD) at position 6
        if (/^\d{4}/.test(data.substring(6, 10)) && (data[10] === "D" || data[10] === "C" || data[10] === "R")) {
          dirPos = 10;
        }

        let direction: "debit" | "credit" = "debit";
        const dirChar = data[dirPos];
        if (dirChar === "C" || dirChar === "R") {
          direction = dirChar === "R" ? "debit" : "credit"; // RD = reversal debit, RC = reversal credit
        }
        if (data[dirPos] === "R") {
          direction = data[dirPos + 1] === "C" ? "debit" : "credit";
          dirPos++;
        }

        // Extract amount (after D/C, before N or next field)
        const afterDir = data.substring(dirPos + 1);
        const amountMatch = afterDir.match(/^(\d+,\d*)/);
        const amount = amountMatch ? parseAmount(amountMatch[1]) : 0;

        currentTransaction = {
          date,
          amount,
          direction,
          description: "",
          counterparty: "",
          counterpartyAccount: "",
          bankAccount,
          rawData: line,
        };
        descriptionLines = [];
      }

      // :86: Transaction description (can span multiple lines)
      if (line.startsWith(":86:")) {
        const descData = line.substring(4);
        descriptionLines = [descData];

        // Read continuation lines (lines that don't start with :XX:)
        while (i + 1 < lines.length && !lines[i + 1].trim().startsWith(":") && lines[i + 1].trim() !== "-") {
          i++;
          descriptionLines.push(lines[i].trim());
        }

        if (currentTransaction) {
          const fullDesc = descriptionLines.join(" ");
          currentTransaction.description = fullDesc;

          // Try to extract counterparty name from description
          // Common formats: /NAME/..., NAAM: ..., or structured fields
          const nameMatch = fullDesc.match(/\/NAME\/([^/]+)/i) || fullDesc.match(/NAAM:\s*(.+?)(?:\/|$)/i);
          if (nameMatch) currentTransaction.counterparty = nameMatch[1].trim();

          // Try to extract counterparty account (IBAN)
          const ibanMatch = fullDesc.match(/([A-Z]{2}\d{2}[A-Z]{4}\d{10})/);
          if (ibanMatch) currentTransaction.counterpartyAccount = ibanMatch[1];
          else {
            const acctMatch = fullDesc.match(/\/REMI\/[^/]*\/([^/]+)/i) || fullDesc.match(/\/CNTP\/([^/]+)/i);
            if (acctMatch) currentTransaction.counterpartyAccount = acctMatch[1].trim();
          }
        }
      }
    }

    // Don't forget last transaction
    if (currentTransaction?.date) {
      currentTransaction.description = descriptionLines.join(" ").trim();
      transactions.push(currentTransaction as MT940Transaction);
    }

    if (transactions.length === 0) {
      return { success: false, bankAccount, transactions: [], error: "No transactions found in the file." };
    }

    const dates = transactions.map((t) => t.date).filter(Boolean).sort();
    return {
      success: true,
      bankAccount,
      transactions,
      dateRange: dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : undefined,
    };
  } catch (err) {
    return { success: false, bankAccount: "", transactions: [], error: `Error processing the MT940 file: ${err instanceof Error ? err.message : "Unknown error"}` };
  }
}

// Generate a unique hash for duplicate detection
export function transactionHash(userId: string, t: MT940Transaction): string {
  const raw = `${userId}|${t.bankAccount}|${t.date}|${t.amount}|${t.direction}|${t.description.substring(0, 100)}`;
  // Simple hash — good enough for duplicate detection
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
