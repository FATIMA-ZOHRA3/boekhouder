// Lightweight fuzzy matching for "find the customer the user just said out loud".
// No external dependency: STT output is often slightly off (accents, missing
// words, mis-transcribed company suffixes like "BV"/"SARL"), so we combine a
// normalized Levenshtein distance with a token-overlap score and take the best.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // strip punctuation (keeps unicode letters, incl. Arabic)
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const dist = levenshtein(na, nb);
  const levScore = 1 - dist / Math.max(na.length, nb.length);

  const tokensA = new Set(na.split(" "));
  const tokensB = new Set(nb.split(" "));
  const overlap = [...tokensA].filter((t) => tokensB.has(t)).length;
  const tokenScore = overlap / Math.max(tokensA.size, tokensB.size);

  // Reward a spoken name that is a clean prefix/substring of the real name
  // (very common: user says "ABC" for "ABC Company B.V.")
  const substringBonus = nb.includes(na) || na.includes(nb) ? 0.15 : 0;

  return Math.min(1, Math.max(levScore, tokenScore) + substringBonus);
}

export interface MatchCandidate {
  id: string;
  name: string;
}

export interface MatchResult {
  customer: MatchCandidate | null;
  score: number;
  alternatives: { customer: MatchCandidate; score: number }[];
}

// score >= CONFIDENT: auto-suggest as "is this the one?"
// score below CONFIDENT but above SOME_HOPE: still list as alternatives
export const CONFIDENT_MATCH_THRESHOLD = 0.55;

export function matchCustomer(spokenName: string, customers: MatchCandidate[]): MatchResult {
  const scored = customers
    .map((c) => ({ customer: c, score: similarity(spokenName, c.name) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < CONFIDENT_MATCH_THRESHOLD) {
    return { customer: null, score: best?.score ?? 0, alternatives: scored.slice(0, 3) };
  }
  return { customer: best.customer, score: best.score, alternatives: scored.slice(1, 3) };
}
