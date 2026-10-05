// Faith's price list -- the ONE place prices, package contents, and
// client-facing wording live. Automatic proposals and the client's pricing
// page both read from here, so a change here updates everything.
// (Approved with Faith, Oct 2026.)

export const GRATUITY_RATE = 0.2; // added to hourly staff; built into packages
export const MIN_HOURS = 4; // includes the setup hour
export const PACKAGE_HOURS = 5; // 4 hours of service + 1 hour setup
export const CUSTOM_QUOTE_OVER_GUESTS = 100;
export const CUSTOM_QUOTE_EVENT_TYPES = ["wedding", "corporate"];

export const RATES = {
  bartender: 70, // per hour, per bartender, + gratuity
  server: 50, // per hour, per server, + gratuity
};

export type PackageTier = { upTo: number; price: number; bartenders: number };

export const PACKAGE_TIERS: PackageTier[] = [
  { upTo: 30, price: 1400, bartenders: 1 },
  { upTo: 50, price: 1600, bartenders: 1 },
  { upTo: 60, price: 1700, bartenders: 1 },
  { upTo: 75, price: 2200, bartenders: 2 },
  { upTo: 100, price: 2600, bartenders: 2 },
];

export function tierFor(guests: number): PackageTier | null {
  return PACKAGE_TIERS.find((t) => guests <= t.upTo) ?? null;
}

/** The next tier down, for the "if your count ends up lower" line. */
export function tierBelow(tier: PackageTier): PackageTier | null {
  const i = PACKAGE_TIERS.indexOf(tier);
  return i > 0 ? PACKAGE_TIERS[i - 1] : null;
}

export function bartendersNeeded(guests: number): number {
  return guests > 60 ? 2 : 1;
}

export const PACKAGE = {
  name: "Perfect Pours Package",
  tagline: "Our full-service bar. Gratuity included.",
  includes: (bartenders: number) => [
    `${bartenders === 1 ? "1 bartender" : `${bartenders} bartenders`}, gratuity included`,
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
};

export const BARTENDER_ONLY = {
  name: "Bartender",
  priceLine: `$${RATES.bartender}/hr + 20% gratuity (4-hour minimum)`,
  description:
    "A professional bartender who carries general and liquor liability insurance, with bar tools and a certificate of insurance for your venue if needed. You provide the alcohol, mixers, ice and cups, and we make it all run smoothly.",
  note: "Signature cocktail menus are part of the Perfect Pours Package, made with our fresh-squeezed juices and housemade syrups.",
};

export const SERVER = {
  name: "Server",
  priceLine: `$${RATES.server}/hr + 20% gratuity (4-hour minimum)`,
  description:
    "You'll feel like a guest, not the host. Your server handles food setup, warming food, switching courses, clearing plates, cutting cake, wrapping leftovers, trash, and kitchen cleanup.",
  note: "Passed hors d'oeuvres, plated dinners and real dishware usually need an additional server. We'll confirm the right staffing for your event.",
};

/** Add-ons are always "pricing available upon request" -- Faith prices them per event. */
export const ADD_ONS = [
  { value: "ice", label: "Ice for the whole event" },
  { value: "mixers", label: "Mixers (club soda, tonic, Coke, Diet Coke, ginger ale, cranberry juice)" },
  { value: "custom_cups", label: "Custom cups" },
  { value: "extra_cocktail", label: "Additional signature cocktail" },
  { value: "acrylic_cups", label: "Acrylic cups (beer, wine, champagne, cocktail)" },
  { value: "custom_paper_goods", label: "Customizable cups, napkins and stirrers" },
  { value: "bar_sign", label: "Elevated bar sign (linen, acrylic, etc.)" },
  { value: "custom_decor", label: "Custom bar decor to match your theme" },
];

export const TIMING_POLICIES = [
  "Staff time starts when we arrive, usually 1 hour before guests, for setup. That hour counts toward the 4-hour minimum. Example: guests arrive at 1pm, we arrive at 12pm, and we stay until at least 4pm.",
  "Bartenders begin cleaning up the bar about 30 minutes before the end time, but keep serving until the last 10 minutes.",
  `Want us longer? Extra hours are the same rate: $${RATES.bartender}/hr per bartender or $${RATES.server}/hr per server, + 20% gratuity. Book them ahead of time to guarantee them. Day-of extensions depend on staff availability, since our team may have another event that day.`,
];

export function customQuoteReason(eventType: string | null, guests: number | null): string | null {
  if (guests && guests > CUSTOM_QUOTE_OVER_GUESTS) return `More than ${CUSTOM_QUOTE_OVER_GUESTS} guests`;
  if (eventType === "wedding") return "Wedding";
  if (eventType === "corporate") return "Corporate event";
  return null;
}
