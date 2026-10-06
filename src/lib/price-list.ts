// Faith's price list -- prices, package contents, and the client-facing
// wording. It's edited from the admin "Price List" page and saved in the
// `price_list` table. Automatic proposals and the client's pricing page
// both read it from there, so one edit updates everything going forward.
//
// DEFAULT_PRICE_LIST below is the starting list (approved with Faith,
// Oct 2026). The app falls back to it if nothing has been saved yet.

import { EVENT_TYPE_LABELS } from "@/lib/labels";

type SupabaseLike = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type PackageTier = { upTo: number; price: number; bartenders: number };
export type AddOn = { value: string; label: string };
export type StaffService = { name: string; description: string; note: string };

export type PriceList = {
  rates: { bartender: number; server: number }; // per hour, per person, + gratuity
  gratuityRate: number; // 0.2 = 20%; added to hourly staff, built into packages
  minHours: number; // includes the setup hour
  packageHours: number; // service + setup hours included in the package
  customQuoteOverGuests: number;
  customQuoteEventTypes: string[];
  package: {
    name: string;
    tiers: PackageTier[];
    /** One bullet per line. "{bartenders}" becomes "1 bartender" / "2 bartenders". */
    includes: string[];
    fullBarNote: string;
    customize: string[];
  };
  bartenderOnly: StaffService;
  server: StaffService;
  /** Always "pricing available upon request" -- Faith prices them per event. */
  addOns: AddOn[];
  /** "{bartender_rate}", "{server_rate}", "{min_hours}", "{gratuity}" fill in automatically. */
  timingPolicies: string[];
};

export const DEFAULT_PRICE_LIST: PriceList = {
  rates: { bartender: 70, server: 50 },
  gratuityRate: 0.2,
  minHours: 4,
  packageHours: 5,
  customQuoteOverGuests: 100,
  customQuoteEventTypes: ["wedding", "corporate"],
  package: {
    name: "Perfect Pours Package",
    tiers: [
      { upTo: 30, price: 1400, bartenders: 1 },
      { upTo: 50, price: 1600, bartenders: 1 },
      { upTo: 60, price: 1700, bartenders: 1 },
      { upTo: 75, price: 2200, bartenders: 2 },
      { upTo: 100, price: 2600, bartenders: 2 },
    ],
    includes: [
      "{bartenders}, gratuity included",
      "4 hours of service, plus 1 hour for setup",
      "Bar tools",
      "Disposable cups, napkins, straws",
      "2 signature cocktails + full bar service",
      "Fresh-squeezed juices and housemade syrups",
      "Premium garnishes for signature cocktails, plus fresh lemons, limes and oranges",
      "Custom framed bar menu. We'll name the drinks and design the menu to match your theme.",
      "Shopping list with suggested alcohol inventory",
      "5ft wooden bar",
      "Standard bar decor",
      "General and liquor liability insurance",
      "Certificate of insurance available if your venue requires one",
    ],
    fullBarNote:
      "Full bar service means your bartender will make whatever they can from what's on hand. You're not limited to the two signature drinks.",
    customize: [
      "Have your own bar? Subtract $250.",
      "Providing your own cups or renting glassware? Subtract $25.",
      "Liquor coordination: we'll send your inventory list to a local liquor store and coordinate delivery for a $25 fee (+ the store's delivery charge).",
    ],
  },
  bartenderOnly: {
    name: "Bartender",
    description:
      "A professional bartender who carries general and liquor liability insurance, with bar tools and a certificate of insurance for your venue if needed. You provide the alcohol, mixers, ice and cups, and we make it all run smoothly.",
    note: "Signature cocktail menus are part of the Perfect Pours Package, made with our fresh-squeezed juices and housemade syrups.",
  },
  server: {
    name: "Server",
    description:
      "You'll feel like a guest, not the host. Your server handles food setup, warming food, switching courses, clearing plates, cutting cake, wrapping leftovers, trash, and kitchen cleanup.",
    note: "Passed hors d'oeuvres, plated dinners and real dishware usually need an additional server. We'll confirm the right staffing for your event.",
  },
  addOns: [
    { value: "ice", label: "Ice for the whole event" },
    { value: "mixers", label: "Mixers (club soda, tonic, Coke, Diet Coke, ginger ale, cranberry juice)" },
    { value: "custom_cups", label: "Custom cups" },
    { value: "extra_cocktail", label: "Additional signature cocktail" },
    { value: "acrylic_cups", label: "Acrylic cups (beer, wine, champagne, cocktail)" },
    { value: "custom_paper_goods", label: "Customizable cups, napkins and stirrers" },
    { value: "bar_sign", label: "Elevated bar sign (linen, acrylic, etc.)" },
    { value: "custom_decor", label: "Custom bar decor to match your theme" },
  ],
  timingPolicies: [
    "Staff time starts when we arrive, usually 1 hour before guests, for setup. That hour counts toward the {min_hours}-hour minimum. Example: guests arrive at 1pm, we arrive at 12pm, and we stay until at least 4pm.",
    "Bartenders begin cleaning up the bar about 30 minutes before the end time, but keep serving until the last 10 minutes.",
    "Want us longer? Extra hours are the same rate: {bartender_rate}/hr per bartender or {server_rate}/hr per server, + {gratuity} gratuity. Book them ahead of time to guarantee them. Day-of extensions depend on staff availability, since our team may have another event that day.",
  ],
};

/**
 * Loads the saved price list. Anything missing (or the table not existing
 * yet) falls back to DEFAULT_PRICE_LIST, so the app never breaks over it.
 */
export async function getPriceList(supabase: SupabaseLike): Promise<PriceList> {
  try {
    const { data, error } = await supabase.from("price_list").select("data").eq("id", true).maybeSingle();
    if (error || !data?.data) return DEFAULT_PRICE_LIST;
    return mergePriceList(data.data as Partial<PriceList>);
  } catch {
    return DEFAULT_PRICE_LIST;
  }
}

export function mergePriceList(saved: Partial<PriceList>): PriceList {
  const d = DEFAULT_PRICE_LIST;
  return {
    ...d,
    ...saved,
    rates: { ...d.rates, ...(saved.rates ?? {}) },
    package: { ...d.package, ...(saved.package ?? {}) },
    bartenderOnly: { ...d.bartenderOnly, ...(saved.bartenderOnly ?? {}) },
    server: { ...d.server, ...(saved.server ?? {}) },
  };
}

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
export const gratuityLabel = (pl: PriceList) => `${Math.round(pl.gratuityRate * 100)}%`;

export function tierFor(pl: PriceList, guests: number): PackageTier | null {
  return pl.package.tiers.find((t) => guests <= t.upTo) ?? null;
}

/** The next tier down, for the "if your count ends up lower" line. */
export function tierBelow(pl: PriceList, tier: PackageTier): PackageTier | null {
  const i = pl.package.tiers.indexOf(tier);
  return i > 0 ? pl.package.tiers[i - 1] : null;
}

/** How many hourly bartenders a guest count needs -- follows the package tiers. */
export function bartendersNeeded(pl: PriceList, guests: number): number {
  return tierFor(pl, guests)?.bartenders ?? (guests > 60 ? 2 : 1);
}

export function packageIncludes(pl: PriceList, bartenders: number): string[] {
  const who = bartenders === 1 ? "1 bartender" : `${bartenders} bartenders`;
  return pl.package.includes.map((line) => line.replace(/\{bartenders\}/g, who));
}

export function staffPriceLine(pl: PriceList, rate: number): string {
  return `${money(rate)}/hr + ${gratuityLabel(pl)} gratuity (${pl.minHours}-hour minimum)`;
}

export function timingPolicies(pl: PriceList): string[] {
  return pl.timingPolicies.map((t) =>
    t
      .replace(/\{bartender_rate\}/g, money(pl.rates.bartender))
      .replace(/\{server_rate\}/g, money(pl.rates.server))
      .replace(/\{min_hours\}/g, String(pl.minHours))
      .replace(/\{gratuity\}/g, gratuityLabel(pl))
  );
}

export function customQuoteReason(pl: PriceList, eventType: string | null, guests: number | null): string | null {
  if (guests && guests > pl.customQuoteOverGuests) return `More than ${pl.customQuoteOverGuests} guests`;
  if (eventType && pl.customQuoteEventTypes.includes(eventType)) return EVENT_TYPE_LABELS[eventType] ?? "This event type";
  return null;
}
