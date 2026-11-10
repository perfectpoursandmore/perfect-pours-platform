// Sorts a forwarded client text into what it's probably asking for, using
// plain keyword rules (no AI service, nothing to pay for or set up). It only
// decides which button shows first in the inbox -- Faith can always pick a
// different one, so a wrong guess costs nothing.

export type InboxKind = "booking" | "send" | "todo";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};

const SEND_WORDS =
  /\b(send|resend|forward|inventory|shopping list|grocery list|liquor list|alcohol list|what (do|should) (i|we) (buy|get)|menu|invoice|contract|receipt|quote|pricing|price list)\b/i;

const BOOKING_WORDS =
  /\b(book|booking|available|availability|free on|are you free|you free|open on|hire you|bartend (for|at|our|my)|another (party|event)|do (it|this) again)\b/i;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Next upcoming occurrence of month/day (this year, or next year if already past). */
function upcoming(month: number, day: number, year?: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const now = new Date();
  let y = year ?? now.getFullYear();
  if (year !== undefined && year < 100) y = 2000 + year;
  const candidate = new Date(y, month - 1, day);
  if (candidate.getMonth() !== month - 1) return null; // e.g. Feb 31
  if (year === undefined) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (candidate < today) y += 1;
  }
  return `${y}-${pad(month)}-${pad(day)}`;
}

/** Pulls the first date out of a text: "March 14", "Mar 14th", "3/14", "3/14/27". */
export function findDate(text: string): string | null {
  const named = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    return upcoming(month, Number(named[2]), named[3] ? Number(named[3]) : undefined);
  }
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/);
  if (numeric) {
    return upcoming(Number(numeric[1]), Number(numeric[2]), numeric[3] ? Number(numeric[3]) : undefined);
  }
  return null;
}

export function sortText(text: string): { kind: InboxKind; guessedDate: string | null } {
  const guessedDate = findDate(text);
  if (SEND_WORDS.test(text)) return { kind: "send", guessedDate };
  if (BOOKING_WORDS.test(text) || guessedDate) return { kind: "booking", guessedDate };
  return { kind: "todo", guessedDate };
}

type ClientLite = { id: string; first_name: string; last_name: string | null; phone: string | null };

function digits(s: string) {
  return s.replace(/\D/g, "").slice(-10);
}

/**
 * Tries to tell who the text is from: a phone number in what was forwarded,
 * or a client's full name, or the "from" name the Shortcut sent. Returns null
 * when unsure -- Faith picks from the list in that case.
 */
export function matchClient(text: string, from: string, clients: ClientLite[]): string | null {
  const haystack = `${from}\n${text}`.toLowerCase();
  const phones = (haystack.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []).map(digits).filter((d) => d.length === 10);
  for (const c of clients) {
    if (c.phone && phones.includes(digits(c.phone))) return c.id;
  }
  const byFullName = clients.filter(
    (c) => c.last_name && haystack.includes(`${c.first_name} ${c.last_name}`.toLowerCase())
  );
  if (byFullName.length === 1) return byFullName[0].id;
  if (from.trim()) {
    const f = from.trim().toLowerCase();
    const byFirst = clients.filter((c) => c.first_name.toLowerCase() === f);
    if (byFirst.length === 1) return byFirst[0].id;
  }
  return null;
}
