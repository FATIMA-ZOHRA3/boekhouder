"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Voice-driven invoicing — Phase 1+2 prototype.
 *
 * Design decision (see technical proposal): only the "which line items go on
 * this invoice" step is handled by Claude (via /api/ai/voice-invoice/parse-item),
 * because that's the one place a free-form sentence needs real understanding.
 * Customer lookup/creation and dates are handled deterministically in this
 * component against the existing /api/customers data — no LLM needed there,
 * which keeps that part fast, cheap, and 100% predictable.
 *
 * Every voice question also has a text fallback input, so this can be fully
 * tested on machines/browsers without a working microphone or without
 * SpeechRecognition support (Safari/Firefox).
 *
 * Supported languages: English and Dutch only.
 *
 * At the end of the conversation, the collected data is rendered as a real
 * invoice preview — the exact same layout used elsewhere in the app for a
 * manually created invoice — so the reviewer sees precisely what will be
 * saved before confirming.
 */

import { matchCustomer, type MatchCandidate } from "@/lib/customerMatch";

export interface VoiceCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  vatNumber: string | null;
  paymentTermValue: number | null;
  paymentTermUnit: string | null;
  defaultVatRate: number | null;
}

export interface VoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface VoiceCompanyInfo {
  company: string;
  logoUrl: string | null;
  vatNumber: string | null;
  kvkNumber: string | null;
  iban: string | null;
  bankName: string | null;
  accountHolder: string | null;
}

interface TranscriptEntry {
  id: number;
  role: "assistant" | "user" | "system";
  text: string;
}

// A single conceptual state machine step. Used to (a) know what's already
// collected vs. still missing, (b) drive the "current question" progress
// indicator, and (c) decide which suggestion chips (if any) belong to the
// question currently on screen.
type ConversationStep =
  | "customer"
  | "newCustomerDetails"
  | "items"
  | "date"
  | "dueDate"
  | "notes"
  | "review";

// The four visible stages of the progress indicator. "newCustomerDetails",
// "dueDate" and "notes" collapse into "customer" / "date" respectively for
// display purposes — they're sub-steps of the same visible stage.
const STEP_ORDER: ConversationStep[] = ["customer", "items", "date", "review"];

type Lang = "nl-NL" | "en-US";

const LANG_LABELS: Record<Lang, string> = {
  "nl-NL": "Nederlands",
  "en-US": "English",
};

const YES_WORDS = ["yes", "ja", "ok", "okay", "correct", "juist", "klopt"];
const SKIP_WORDS = ["skip", "overslaan", "none", "none"];
const DONE_WORDS = ["done", "that's all", "klaar", "that's all"];

function isYes(text: string) {
  const t = text.toLowerCase();
  return YES_WORDS.some((w) => t.includes(w));
}
function isSkip(text: string) {
  const t = text.toLowerCase().trim();
  return t === "" || SKIP_WORDS.some((w) => t.includes(w));
}

interface Prompts {
  askCustomer: string;
  confirmCustomer: (name: string) => string;
  noMatch: string;
  askCompany: string;
  askAddress: string;
  askVat: string;
  askEmail: string;
  askPhone: string;
  askItems: string;
  askItemsAgain: string;
  askDate: string;
  askDueDate: string;
  askNotes: string;
  reviewIntro: string;
  reviewConfirm: string;
  cancelled: string;
  creatingCustomer: string;
  didntCatch: string;
}

const PROMPTS: Record<Lang, Prompts> = {
  "nl-NL": {
    didntCatch: "Sorry, I didn't quite understand that.",
    askCustomer: "Which customer would you like to invoice?",
    confirmCustomer: (n: string) => `Bedoelt u ${n}? Zeg ja of nee.`,
    noMatch: "I couldn't find this customer. Would you like to create a new customer? Say yes or no.",
    askCompany: "What is the company or contact person?",
    askAddress: "What is the address? Say 'skip' to skip this.",
    askVat: "What is the VAT number? Say 'skip' to skip this.",
    askEmail: "What is the email address? Say 'skip' to skip this.",
    askPhone: "What is the phone number? Say 'skip' to skip this.",
    askItems: "Which product or service would you like to invoice? State the description, quantity and price.",
    askItemsAgain: "Anything else to add? Or say 'done' if you're finished.",
    askDate: "What is the invoice date? Say 'today' for today.",
    askDueDate: "What is the due date? Say 'default' to use the default term.",
    askNotes: "Would you like to add a note? Say 'skip' to skip this.",
    reviewIntro: "Here is the invoice overview.",
    reviewConfirm: "Shall I fill this into the form? Say yes or no.",
    cancelled: "No problem, I haven't filled anything in.",
    creatingCustomer: "Creating the customer...",
  },
  "en-US": {
    didntCatch: "Sorry, I didn't quite catch that.",
    askCustomer: "Which customer would you like to invoice?",
    confirmCustomer: (n: string) => `Do you mean ${n}? Say yes or no.`,
    noMatch: "I couldn't find this customer. Would you like to create a new customer? Say yes or no.",
    askCompany: "What is the company or contact name?",
    askAddress: "What is the address? Say 'skip' to leave this blank.",
    askVat: "What is the VAT number? Say 'skip' to leave this blank.",
    askEmail: "What is the email address? Say 'skip' to leave this blank.",
    askPhone: "What is the phone number? Say 'skip' to leave this blank.",
    askItems: "What product or service would you like to invoice? Please state the description, quantity, and price.",
    askItemsAgain: "Anything else to add? Or say 'done' if you're finished.",
    askDate: "What is the invoice date? Say 'today' for today.",
    askDueDate: "What is the due date? Say 'default' to use the standard term.",
    askNotes: "Would you like to add a note? Say 'skip' to leave this blank.",
    reviewIntro: "Here is the invoice summary.",
    reviewConfirm: "Shall I fill this into the form? Say yes or no.",
    cancelled: "No problem, I haven't filled in anything.",
    creatingCustomer: "Creating the customer...",
  },
};

interface UiStrings {
  modalTitle: string;
  prototypeBadge: string;
  chooseLangIntro: string;
  sttWarning: string;
  startButton: string;
  typingPlaceholderWaiting: string;
  typingPlaceholderListening: string;
  sendButton: string;
  speakingLabel: string;
  listeningLabel: string;
  emptyUtterance: string;
  confirmButton: string;
  editButton: string;
  cancelButton: string;
  micError: string;
  searchCustomer: string;
  stepCustomer: string;
  stepItems: string;
  stepDates: string;
  stepReview: string;
}

const UI: Record<Lang, UiStrings> = {
  "nl-NL": {
    modalTitle: "Voice invoicing",
    prototypeBadge: "prototype",
    chooseLangIntro: "Choose a language and start the conversation. If speech recognition doesn't work in your browser, you can also type.",
    sttWarning: "Speech recognition is not supported in this browser (use Chrome/Edge for full voice input). You can still type.",
    startButton: "Start conversation",
    typingPlaceholderWaiting: "Waiting for the next question...",
    typingPlaceholderListening: "Type here as an alternative to speaking...",
    sendButton: "Send",
    speakingLabel: "speaking...",
    listeningLabel: "listening...",
    emptyUtterance: "(empty)",
    confirmButton: "Confirm and fill in",
    editButton: "Edit",
    cancelButton: "Cancel",
    micError: "I couldn't hear you well. Please try again or type your answer.",
    searchCustomer: "Search customer",
    stepCustomer: "Customer",
    stepItems: "Products/services",
    stepDates: "Dates & notes",
    stepReview: "Overview",
  },
  "en-US": {
    modalTitle: "Voice invoicing",
    prototypeBadge: "prototype",
    chooseLangIntro: "Choose a language and start the conversation. If speech recognition doesn't work in your browser, you can also type.",
    sttWarning: "Speech recognition is not supported in this browser (use Chrome/Edge for full voice input). You can still type.",
    startButton: "Start conversation",
    typingPlaceholderWaiting: "Waiting for the next question...",
    typingPlaceholderListening: "Type here as an alternative to speaking...",
    sendButton: "Send",
    speakingLabel: "speaking...",
    listeningLabel: "listening...",
    emptyUtterance: "(empty)",
    confirmButton: "Confirm and fill in",
    editButton: "Edit",
    cancelButton: "Cancel",
    micError: "I couldn't hear you clearly. Please try again or type your answer.",
    searchCustomer: "Search customer",
    stepCustomer: "Customer",
    stepItems: "Products/services",
    stepDates: "Dates & notes",
    stepReview: "Review",
  },
};

interface PreviewLabels {
  invoice: string;
  invoiceDetails: string;
  date: string;
  dueDate: string;
  debtor: string;
  description: string;
  quantity: string;
  price: string;
  vat: string;
  total: string;
  subtotal: string;
  notes: string;
  payment: string;
  yourCompany: string;
}

const PREVIEW: Record<Lang, PreviewLabels> = {
  "nl-NL": {
    invoice: "Invoice",
    invoiceDetails: "Factuurgegevens",
    date: "Datum",
    dueDate: "Due date",
    debtor: "Customer",
    description: "Description",
    quantity: "Aantal",
    price: "Prijs",
    vat: "VAT",
    total: "Total",
    subtotal: "Subtotal",
    notes: "Notes",
    payment: "Payment",
    yourCompany: "Your company",
  },
  "en-US": {
    invoice: "Invoice",
    invoiceDetails: "Invoice details",
    date: "Date",
    dueDate: "Due date",
    debtor: "Bill to",
    description: "Description",
    quantity: "Qty",
    price: "Price",
    vat: "VAT",
    total: "Total",
    subtotal: "Subtotal",
    notes: "Notes",
    payment: "Payment",
    yourCompany: "Your company",
  },
};

const STEP_LABEL: Record<Lang, Record<ConversationStep, string>> = {
  "nl-NL": {
    customer: UI["nl-NL"].stepCustomer,
    newCustomerDetails: UI["nl-NL"].stepCustomer,
    items: UI["nl-NL"].stepItems,
    date: UI["nl-NL"].stepDates,
    dueDate: UI["nl-NL"].stepDates,
    notes: UI["nl-NL"].stepDates,
    review: UI["nl-NL"].stepReview,
  },
  "en-US": {
    customer: UI["en-US"].stepCustomer,
    newCustomerDetails: UI["en-US"].stepCustomer,
    items: UI["en-US"].stepItems,
    date: UI["en-US"].stepDates,
    dueDate: UI["en-US"].stepDates,
    notes: UI["en-US"].stepDates,
    review: UI["en-US"].stepReview,
  },
};

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(dateStr: string) {
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

interface ReviewData {
  customerName: string;
  customerAddress: string;
  items: VoiceLineItem[];
  date: string;
  dueDate: string;
  notes: string;
}

// Generic over the caller's own Customer type (which may have extra fields,
// e.g. defaultDescription/defaultUnitPrice) — as long as it's a superset of
// VoiceCustomer, callbacks like the page's existing handleSelectCustomer can
// be passed straight through without re-typing anything.
interface Props<C extends VoiceCustomer> {
  customers: C[];
  invoiceDate: string;
  invoiceNumber?: string;
  companyInfo?: VoiceCompanyInfo | null;
  onClose: () => void;
  onCustomerSelected: (customer: C) => void;
  onCustomerCreated: (customer: C) => void;
  onItemsReady: (items: VoiceLineItem[]) => void;
  onDatesNotes: (date: string, dueDate: string, notes: string) => void;
  calculateDueDate: (date: string, termValue?: number, termUnit?: string) => string;
  // Items already present on the form (e.g. when the assistant is opened
  // mid-invoice, just to dictate one more line). When provided, the item
  // phase starts from these instead of an empty list, so voice-added items
  // are merged with what's already there rather than replacing it. Blank
  // placeholder rows (no description) are ignored.
  initialItems?: VoiceLineItem[];
}

export default function VoiceInvoiceAssistant<C extends VoiceCustomer>({
  customers,
  invoiceDate,
  invoiceNumber,
  companyInfo,
  onClose,
  onCustomerSelected,
  onCustomerCreated,
  onItemsReady,
  onDatesNotes,
  calculateDueDate,
  initialItems,
}: Props<C>) {
  const [lang, setLang] = useState<Lang>("nl-NL");
  const [started, setStarted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);

  // --- Typing-animation state ---------------------------------------------
  // typingId identifies which transcript entry is currently being revealed
  // progressively (word-by-word, synced to speech where possible). Every
  // other entry renders instantly at full length, exactly as before.
  const [typingId, setTypingId] = useState<number | null>(null);
  const [revealedLength, setRevealedLength] = useState(0);

  // --- Conversation state (section 5 of the brief) ------------------------
  // currentStep drives the small progress indicator and tells us which
  // suggestion chips (if any) belong to the question currently on screen.
  const [currentStep, setCurrentStep] = useState<ConversationStep>("customer");
  const [customerSuggestions, setCustomerSuggestions] = useState<C[]>([]);

  const pendingResolveRef = useRef<((text: string) => void) | null>(null);
  const recognitionRef = useRef<any>(null);
  const runningRef = useRef(false);
  const transcriptIdRef = useRef(0);

  const speechSupported = typeof window !== "undefined" && !!(window as any).speechSynthesis;
  const sttSupported =
    typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const T = UI[lang];
  const PV = PREVIEW[lang];

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, [speechSupported]);

  // Appends one entry to the transcript and returns its stable id — used to
  // know which bubble the typing animation below is currently revealing.
  function pushTranscript(entry: Omit<TranscriptEntry, "id">): number {
    const id = transcriptIdRef.current++;
    setTranscript((prev) => [...prev, { id, ...entry }]);
    return id;
  }

  // Reveals `text` on a fixed timer, character by character, finishing in
  // roughly `durationMs`. Used both as the no-speech-support typing effect
  // and as a fallback when the speech engine doesn't report word boundaries.
  function typeOut(text: string, durationMs: number): () => void {
    const total = text.length || 1;
    const stepMs = Math.max(12, durationMs / total);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setRevealedLength(Math.min(i, total));
      if (i >= total) clearInterval(timer);
    }, stepMs);
    return () => clearInterval(timer);
  }

  // Speaks `text` aloud (if supported) while progressively revealing it in
  // the transcript, word cursor and all. When the browser reports speech
  // word-boundary events we sync the reveal to those; otherwise we fall
  // back to a reading-speed timer so text and voice still finish together.
  function say(text: string): Promise<void> {
    const id = pushTranscript({ role: "assistant", text });
    setTypingId(id);
    setRevealedLength(0);

    const finishTyping = () => {
      setRevealedLength(text.length);
      setTypingId(null);
    };

    if (!speechSupported) {
      const estMs = Math.min(4500, Math.max(500, text.length * 32));
      const stopTyping = typeOut(text, estMs);
      return new Promise((resolve) => {
        setTimeout(() => {
          stopTyping();
          finishTyping();
          resolve();
        }, estMs + 120);
      });
    }

    return new Promise((resolve) => {
      let stopFallbackTimer: (() => void) | null = null;
      let usedBoundary = false;

      setSpeaking(true);
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;

      utter.onboundary = (e: SpeechSynthesisEvent) => {
        usedBoundary = true;
        if (stopFallbackTimer) {
          stopFallbackTimer();
          stopFallbackTimer = null;
        }
        if (typeof e.charIndex === "number") {
          setRevealedLength(Math.min(e.charIndex + (e.charLength || 1), text.length));
        }
      };
      // Some engines (notably some mobile browsers) never fire onboundary.
      // Give it a beat to prove itself, otherwise fall back to a timer so
      // the text still finishes typing in sync with the voice ending.
      utter.onstart = () => {
        setTimeout(() => {
          if (!usedBoundary) {
            const estMs = Math.max(600, text.length * 45);
            stopFallbackTimer = typeOut(text, estMs);
          }
        }, 150);
      };
      utter.onend = () => {
        if (stopFallbackTimer) stopFallbackTimer();
        setSpeaking(false);
        finishTyping();
        resolve();
      };
      utter.onerror = () => {
        if (stopFallbackTimer) stopFallbackTimer();
        setSpeaking(false);
        finishTyping();
        resolve();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    });
  }

  // Resolves with either a spoken result (via SpeechRecognition) or a typed
  // result from the text fallback input — whichever the user provides first.
  function listenOnce(): Promise<string> {
    return new Promise((resolve) => {
      pendingResolveRef.current = (text: string) => {
        pendingResolveRef.current = null;
        setListening(false);
        resolve(text);
      };

      if (!sttSupported) return; // text fallback only

      const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new Ctor();
      recognitionRef.current = recognition;
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        const text = event.results?.[0]?.[0]?.transcript ?? "";
        pendingResolveRef.current?.(text);
      };
      recognition.onerror = (event: { error?: string }) => {
        // Let the user fall back to typing; don't resolve automatically.
        setListening(false);
        // "aborted" fires on our own recognition.stop() calls (e.g. the
        // text-fallback path) — that's not a recognition failure, so only
        // surface a note for genuine mic/recognition problems.
        if (event?.error && event.error !== "aborted") {
          pushTranscript({ role: "system", text: `⚠️ ${T.micError}` });
        }
      };
      recognition.onend = () => setListening(false);

      setListening(true);
      try {
        recognition.start();
      } catch {
        setListening(false);
      }
    });
  }

  function submitTextFallback() {
    if (!pendingResolveRef.current) return;
    const text = textInput.trim();
    setTextInput("");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    pendingResolveRef.current(text);
  }

  // ask() = speak the prompt, then wait for a spoken/typed reply, logging both.
  //
  // When allowEmpty is false, an empty/unrecognized reply does NOT advance
  // the conversation: the assistant stays on the same question, acknowledges
  // it didn't catch the answer, and asks again — see section 8 of the brief.
  // Pass allowEmpty:false only for questions where a blank answer can't mean
  // anything (e.g. "skip"); most prompts default to allowEmpty:true.
  async function ask(prompt: string, opts?: { allowEmpty?: boolean }): Promise<string> {
    const allowEmpty = opts?.allowEmpty !== false;
    let promptToSay = prompt;
    for (;;) {
      await say(promptToSay);
      const reply = await listenOnce();
      if (!reply.trim() && !allowEmpty) {
        pushTranscript({ role: "user", text: T.emptyUtterance });
        promptToSay = `${PROMPTS[lang].didntCatch} ${prompt}`;
        continue;
      }
      pushTranscript({ role: "user", text: reply || T.emptyUtterance });
      return reply;
    }
  }

  async function runConversation() {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setError(null);
    setReviewData(null);
    const P = PROMPTS[lang];

    try {
      // ---- Phase 1: customer ----
      setCurrentStep("customer");
      // Suggestion chips for THIS question only (section 6) — a handful of
      // existing customers to tap instead of speaking/typing a name.
      setCustomerSuggestions(customers.slice(0, 3));
      let selectedCustomer: C | null = null;
      let attempts = 0;
      while (!selectedCustomer && attempts < 3) {
        attempts++;
        const spokenName = await ask(P.askCustomer, { allowEmpty: false });
        setCustomerSuggestions([]); // question answered — chips disappear (section 6)

        const candidates: MatchCandidate[] = customers.map((c) => ({ id: c.id, name: c.name }));
        const match = matchCustomer(spokenName, candidates);

        if (match.customer) {
          const confirmPrompt = P.confirmCustomer(match.customer.name);
          const confirmReply = await ask(confirmPrompt);
          if (isYes(confirmReply)) {
            selectedCustomer = customers.find((c) => c.id === match.customer!.id) || null;
            break;
          }
          // fall through to "create new?" below
        }

        const createReply = await ask(P.noMatch);
        if (!isYes(createReply)) {
          setCustomerSuggestions(customers.slice(0, 3));
          continue; // ask for customer name again
        }

        // ---- Sequential new-customer questions (deterministic, no AI needed) ----
        setCurrentStep("newCustomerDetails");
        const company = spokenName; // what they said first is treated as the name
        const address = await ask(P.askAddress);
        const vatNumber = await ask(P.askVat);
        const email = await ask(P.askEmail);
        const phone = await ask(P.askPhone);

        await say(P.creatingCustomer);
        const res = await fetch("/api/customers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: company,
            address: isSkip(address) ? "" : address,
            vatNumber: isSkip(vatNumber) ? "" : vatNumber,
            email: isSkip(email) ? "" : email,
            phone: isSkip(phone) ? "" : phone,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Could not create customer");
          pushTranscript({ role: "system", text: `⚠️ ${data.error || "Could not create customer"}` });
          setCurrentStep("customer");
          setCustomerSuggestions(customers.slice(0, 3));
          continue;
        }
        const created = (await res.json()) as C;
        onCustomerCreated(created);
        selectedCustomer = created;
      }

      if (!selectedCustomer) {
        await say(P.cancelled);
        return;
      }
      onCustomerSelected(selectedCustomer);

      // ---- Phase 2: line items (this is the part Claude handles) ----
      setCurrentStep("items");
      // Start from whatever real (non-blank) items already exist on the form
      // so opening the assistant mid-invoice doesn't discard them.
      const items: VoiceLineItem[] = (initialItems || []).filter((i) => i.description.trim() !== "");
      if (items.length > 0) onItemsReady([...items]);
      let firstItemPrompt = P.askItems;
      let done = false;
      let safety = 0;
      while (!done && safety < 10) {
        safety++;
        // Empty is only a valid answer once at least one item is on the
        // invoice (it then means "done"); the very first item is required.
        const utterance = await ask(firstItemPrompt, { allowEmpty: items.length > 0 });
        firstItemPrompt = P.askItemsAgain;
        if (!utterance.trim() || DONE_WORDS.some((w) => utterance.toLowerCase().includes(w))) {
          if (items.length > 0) break;
          continue;
        }

        // Each attempt is isolated: a single malformed/failed AI response
        // must never abort the whole conversation and strand already-
        // confirmed items. On failure we just re-prompt and keep whatever
        // was already successfully parsed.
        try {
          const res = await fetch("/api/ai/voice-invoice/parse-item", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              utterance,
              existingItems: items,
              defaultVatRate: selectedCustomer.defaultVatRate ?? 21,
            }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || "AI error while processing the invoice line");
            await say(data.error || "Sorry, that didn't work. Please try again.");
            continue;
          }

          const parsed = await res.json();
          if (!Array.isArray(parsed.items)) {
            throw new Error("AI returned an unexpected response (no items array)");
          }

          items.length = 0;
          items.push(...parsed.items);
          // Push to the parent form immediately, after every successfully
          // parsed utterance — not just once at the end of the loop — so
          // a later failure (or the user just closing the modal) can never
          // lose items that were already correctly extracted.
          onItemsReady([...items]);

          await say(parsed.spoken_confirmation || "Added.");
          if (parsed.clarification_needed) {
            // The next loop iteration's prompt IS the clarification question.
            firstItemPrompt = parsed.clarification_needed;
          }
          if (parsed.done) done = true;
        } catch (itemErr) {
          setError(itemErr instanceof Error ? itemErr.message : "AI error while processing the invoice line");
          await say("Sorry, that didn't work. Please try again.");
          continue;
        }
      }
      onItemsReady([...items]);

      // ---- Phase 3: dates & notes (deterministic) ----
      setCurrentStep("date");
      const dateReply = await ask(P.askDate);
      const date = /vandaag|today/i.test(dateReply) || !dateReply.trim() ? invoiceDate || todayIso() : dateReply;

      setCurrentStep("dueDate");
      const defaultDue = calculateDueDate(date, selectedCustomer.paymentTermValue ?? 1, selectedCustomer.paymentTermUnit ?? "months");
      const dueReply = await ask(P.askDueDate);
      const dueDate = /standaard|default/i.test(dueReply) || !dueReply.trim() ? defaultDue : dueReply;

      setCurrentStep("notes");
      const notesReply = await ask(P.askNotes);
      const notes = isSkip(notesReply) ? "" : notesReply;

      onDatesNotes(date, dueDate, notes);

      // ---- Review: show the same invoice layout used elsewhere in the app ----
      setCurrentStep("review");
      await say(P.reviewIntro);
      setReviewData({
        customerName: selectedCustomer.name,
        customerAddress: selectedCustomer.address || "",
        items,
        date,
        dueDate,
        notes,
      });
      const finalConfirm = await ask(P.reviewConfirm);
      if (isYes(finalConfirm)) {
        onClose();
      } else {
        await say(P.cancelled);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
      runningRef.current = false;
    }
  }

  function confirmFromButton() {
    // Lets the demo proceed even if the mic/TTS round-trip stalls — the
    // reviewer can just click straight from the visual preview.
    if (pendingResolveRef.current) {
      pendingResolveRef.current("yes");
    } else {
      onClose();
    }
  }

  function cancelFromButton() {
    if (pendingResolveRef.current) {
      pendingResolveRef.current("no");
    } else {
      onClose();
    }
  }

  const previewSubtotal = reviewData ? reviewData.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0) : 0;
  const previewVat = reviewData
    ? reviewData.items.reduce((s, i) => s + i.quantity * i.unitPrice * (i.vatRate / 100), 0)
    : 0;
  const previewTotal = previewSubtotal + previewVat;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🎤 {T.modalTitle}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!started ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{T.chooseLangIntro}</p>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${
                    lang === l ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {LANG_LABELS[l]}
                </button>
              ))}
            </div>
            {!sttSupported && (
              <p className="text-xs text-amber-600">⚠️ {T.sttWarning}</p>
            )}
            <button
              onClick={() => {
                setStarted(true);
                runConversation();
              }}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium hover:bg-blue-700"
            >
              {T.startButton}
            </button>
          </div>
        ) : (
          <>
            {/* Current-question progress (section 5/7): a single, minimal
                indicator of where we are in the sequential flow — never the
                full questionnaire, just a "you are here". */}
            {!reviewData && (
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-500 mb-1.5">{STEP_LABEL[lang][currentStep]}</p>
                <div className="flex items-center gap-1.5">
                {STEP_ORDER.map((step) => {
                  const stepIndex = STEP_ORDER.indexOf(step);
                  const activeIndex = STEP_ORDER.indexOf(
                    currentStep === "newCustomerDetails" ? "customer" : currentStep === "dueDate" || currentStep === "notes" ? "date" : currentStep
                  );
                  return (
                    <div
                      key={step}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        stepIndex <= activeIndex ? "bg-blue-500" : "bg-gray-200"
                      }`}
                    />
                  );
                })}
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto border border-gray-100 rounded-lg p-3 space-y-2 bg-gray-50 mb-3 text-sm">
              {transcript.map((entry) => (
                <div
                  key={entry.id}
                  className={`${
                    entry.role === "assistant"
                      ? "text-gray-800"
                      : entry.role === "system"
                      ? "text-red-600 text-xs"
                      : "text-blue-700 font-medium"
                  }`}
                >
                  {entry.role === "assistant" ? "🤖 " : entry.role === "user" ? "🗣️ " : ""}
                  {entry.role === "assistant" && entry.id === typingId ? (
                    <>
                      {entry.text.slice(0, revealedLength)}
                      <span className="voice-typing-cursor">▍</span>
                    </>
                  ) : (
                    entry.text
                  )}
                </div>
              ))}
              {speaking && <div className="text-xs text-gray-400 italic">{T.speakingLabel}</div>}
              {listening && <div className="text-xs text-green-600 italic">{T.listeningLabel}</div>}

              {/* Suggestion chips for the CURRENT question only (section 6) */}
              {typingId === null && customerSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {customerSuggestions.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCustomerSuggestions([]);
                        if (recognitionRef.current) {
                          try {
                            recognitionRef.current.stop();
                          } catch {}
                        }
                        pendingResolveRef.current?.(c.name);
                      }}
                      className="px-2.5 py-1 text-xs rounded-full border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      {c.name}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setCustomerSuggestions([]);
                      // No pre-fill — just clears chips so the user can
                      // speak/type a name freely, e.g. one not shown above.
                    }}
                    className="px-2.5 py-1 text-xs rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  >
                    {T.searchCustomer}
                  </button>
                </div>
              )}

              {/* Live invoice preview — same layout as a manually created invoice */}
              {reviewData && (
                <div className="mt-3 border border-blue-200 rounded-lg p-4 bg-white text-sm" style={{ fontSize: "12px" }}>
                  <div className="flex justify-between mb-4">
                    <div>
                      <p className="text-lg font-bold text-blue-600">{PV.invoice}</p>
                      <p className="text-gray-500">{invoiceNumber || "—"}</p>
                    </div>
                    <div className="text-right text-gray-500" style={{ fontSize: "11px" }}>
                      {companyInfo?.logoUrl && (
                        <img src={companyInfo.logoUrl} alt="Logo" className="ml-auto mb-2" style={{ maxHeight: "36px", maxWidth: "110px", objectFit: "contain" }} />
                      )}
                      <p className="font-semibold text-gray-700">{companyInfo?.company || PV.yourCompany}</p>
                      {companyInfo?.vatNumber && <p>{PV.vat}: {companyInfo.vatNumber}</p>}
                      {companyInfo?.kvkNumber && <p>KVK: {companyInfo.kvkNumber}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 pb-3 border-b border-gray-100">
                    <div>
                      <p className="text-gray-400 uppercase" style={{ fontSize: "10px" }}>{PV.invoiceDetails}</p>
                      <p><strong>{PV.date}:</strong> {reviewData.date ? formatDate(reviewData.date) : "—"}</p>
                      <p><strong>{PV.dueDate}:</strong> {reviewData.dueDate ? formatDate(reviewData.dueDate) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 uppercase" style={{ fontSize: "10px" }}>{PV.debtor}</p>
                      <p className="font-semibold">{reviewData.customerName || "—"}</p>
                      <p>{reviewData.customerAddress || "—"}</p>
                    </div>
                  </div>

                  <table className="w-full mb-3" style={{ fontSize: "11px" }}>
                    <thead>
                      <tr className="text-gray-400 uppercase border-b border-gray-200" style={{ fontSize: "9px" }}>
                        <th className="text-left py-2">{PV.description}</th>
                        <th className="text-right py-2">{PV.quantity}</th>
                        <th className="text-right py-2">{PV.price}</th>
                        <th className="text-right py-2">{PV.vat}</th>
                        <th className="text-right py-2">{PV.total}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewData.items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-2">{item.description || "—"}</td>
                          <td className="text-right py-2">{item.quantity}</td>
                          <td className="text-right py-2">{formatCurrency(item.unitPrice)}</td>
                          <td className="text-right py-2">{item.vatRate}%</td>
                          <td className="text-right py-2 font-medium">{formatCurrency(item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="w-full sm:w-48 sm:ml-auto space-y-1" style={{ fontSize: "11px" }}>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{PV.subtotal}</span>
                      <span>{formatCurrency(previewSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{PV.vat}</span>
                      <span>{formatCurrency(previewVat)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                      <span>{PV.total}</span>
                      <span>{formatCurrency(previewTotal)}</span>
                    </div>
                  </div>

                  {reviewData.notes && (
                    <div className="mt-3 p-2 bg-gray-50 rounded text-gray-500" style={{ fontSize: "11px" }}>
                      <strong>{PV.notes}:</strong> {reviewData.notes}
                    </div>
                  )}

                  {companyInfo?.iban && (
                    <div className="mt-3 pt-2 border-t border-gray-100 text-gray-400" style={{ fontSize: "10px" }}>
                      <p>{PV.payment}: {companyInfo.iban}{companyInfo.bankName ? ` (${companyInfo.bankName})` : ""} {companyInfo.accountHolder || companyInfo.company || ""}</p>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end mt-4 pt-3 border-t border-gray-100">
                    <button
                      onClick={cancelFromButton}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                      {T.cancelButton}
                    </button>
                    <button
                      onClick={confirmFromButton}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                    >
                      {T.confirmButton}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-600 mb-2">⚠️ {error}</p>}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitTextFallback();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={listening ? T.typingPlaceholderListening : T.typingPlaceholderWaiting}
                disabled={!busy}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!busy}
                className="px-3 py-2 bg-gray-800 text-white rounded-lg text-sm disabled:opacity-40"
              >
                {T.sendButton}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
