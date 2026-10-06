import { labelsFor, SERVICES } from "@/lib/event-details";
import {
  type PriceList,
  bartendersNeeded,
  customQuoteReason,
  gratuityLabel,
  packageIncludes,
  tierBelow,
  tierFor,
} from "@/lib/price-list";

// Turns an event's details (guest count, services checked, food style...)
// into proposal lines using the price list. Pure function: no database,
// so the booking page can also call it just to show Faith the heads-ups.

export type EventForPricing = {
  event_type: string | null;
  guest_count: number | null;
  services_interested: string[] | null;
  service_style: string | null;
  dishware: string | null;
  extra_help: string[] | null;
  staff_arrival_time: string | null;
  staff_end_time: string | null;
};

export type DraftLine = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  note: string | null; // shown to the client under the line
  /** null = always included. Otherwise the name of the option this line belongs to
   *  (e.g. package vs bartender only); the client picks one option. */
  option: string | null;
};

export type DraftResult = {
  lines: DraftLine[];
  customQuote: string | null; // reason, when this event shouldn't be auto-priced
  headsUps: string[]; // for Faith only, never shown to the client
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function scheduledHours(e: EventForPricing): number | null {
  if (!e.staff_arrival_time || !e.staff_end_time) return null;
  const ms = new Date(e.staff_end_time).getTime() - new Date(e.staff_arrival_time).getTime();
  if (!(ms > 0)) return null;
  return Math.round((ms / 3600000) * 2) / 2; // nearest half hour
}

function line(
  description: string,
  quantity: number,
  unitPrice: number,
  note: string | null = null,
  option: string | null = null
): DraftLine {
  return { description, quantity, unit_price: unitPrice, line_total: round2(quantity * unitPrice), note, option };
}

export const BARTENDER_ONLY_OPTION = "Bartender only";

export function buildDraftProposal(e: EventForPricing, pl: PriceList): DraftResult {
  const RATES = pl.rates;
  const MIN_HOURS = pl.minHours;
  const PACKAGE_HOURS = pl.packageHours;
  const BARTENDER_ONLY = pl.bartenderOnly;
  const SERVER = pl.server;
  const services = e.services_interested ?? [];
  const guests = e.guest_count ?? 0;
  const headsUps: string[] = [];
  const lines: DraftLine[] = [];

  const customQuote = customQuoteReason(pl, e.event_type, e.guest_count);
  if (customQuote) {
    return {
      lines: [],
      customQuote,
      headsUps: [`${customQuote}: this one needs a custom quote, so add the lines yourself.`],
    };
  }
  if (!guests) headsUps.push("No guest count yet. Add it on the Overview tab first.");
  if (services.length === 0) headsUps.push("No services are checked on the Overview tab yet.");

  const hours = scheduledHours(e);
  const hourlyHours = Math.max(MIN_HOURS, hours ?? MIN_HOURS);

  const wantsPackage = services.includes("signature_cocktails");
  const wantsBartender = services.includes("bartender");
  // Checked both? Offer both, side by side, and let the client choose.
  const offerBoth = wantsPackage && wantsBartender && guests > 0 && tierFor(pl, guests) !== null;
  const PKG = offerBoth ? pl.package.name : null;
  const BAR = offerBoth ? BARTENDER_ONLY_OPTION : null;
  // Gratuity owed on hourly staff, kept per option so each option's total is right.
  const gratuity = new Map<string | null, number>();
  const addGratuity = (option: string | null, amount: number) => gratuity.set(option, (gratuity.get(option) ?? 0) + amount);
  if (offerBoth) {
    headsUps.push("They asked about both the package and bartender only, so this shows both as options. After your call, set which one they chose.");
  }

  if (wantsPackage && guests) {
    const tier = tierFor(pl, guests);
    if (tier) {
      const lower = tierBelow(pl, tier);
      lines.push(
        line(
          [`${pl.package.name}: up to ${tier.upTo} guests`, ...packageIncludes(pl, tier.bartenders).map((i) => `• ${i}`)].join("\n"),
          1,
          tier.price,
          lower ? `If your final count is ${lower.upTo} or fewer, this package is ${money(lower.price)}.` : null,
          PKG
        )
      );
      // Top 1-bartender tier, right before the tiers switch to 2: worth a second look.
      const next = pl.package.tiers[pl.package.tiers.indexOf(tier) + 1];
      if (lower && tier.bartenders === 1 && next && next.bartenders > 1) {
        headsUps.push(`${lower.upTo + 1}–${tier.upTo} guests is priced with 1 bartender. Switch to 2 if it's a night event or a heavy-drinking crowd.`);
      }
      const extra = hours !== null ? hours - PACKAGE_HOURS : 0;
      if (extra > 0) {
        lines.push(
          line(
            `Extra bar time: ${extra} hr × ${tier.bartenders} bartender${tier.bartenders > 1 ? "s" : ""} at ${money(RATES.bartender)}/hr`,
            extra * tier.bartenders,
            RATES.bartender,
            null,
            PKG
          )
        );
        addGratuity(PKG, extra * tier.bartenders * RATES.bartender);
      }
    }
  }
  if (wantsBartender && (!(wantsPackage && guests) || offerBoth)) {
    const count = guests ? bartendersNeeded(pl, guests) : 1;
    lines.push(
      line(
        `${BARTENDER_ONLY.name}${count > 1 ? `s × ${count}` : ""}: ${hourlyHours} hrs at ${money(RATES.bartender)}/hr\n${BARTENDER_ONLY.description}`,
        hourlyHours * count,
        RATES.bartender,
        offerBoth ? null : BARTENDER_ONLY.note, // the note pitches the package, which is right next to it
        BAR
      )
    );
    addGratuity(BAR, hourlyHours * count * RATES.bartender);
    if (count > 1) headsUps.push(`Priced with ${count} bartenders because of the guest count. Adjust if needed.`);
  }

  if (services.includes("server")) {
    const reasons = [
      e.service_style === "plated" && "plated dinner",
      e.service_style === "family_style" && "family-style service",
      e.service_style === "appetizers" && "appetizers, if they're passed",
      e.dishware === "real" && "real dishes",
      (e.extra_help ?? []).includes("passed_apps") && "passed appetizers",
    ].filter(Boolean);
    lines.push(
      line(
        `${SERVER.name}: ${hourlyHours} hrs at ${money(RATES.server)}/hr\n${SERVER.description}`,
        hourlyHours,
        RATES.server,
        reasons.length > 0 ? SERVER.note : null // only mention extra staff when it's likely
      )
    );
    addGratuity(null, hourlyHours * RATES.server);
    if (reasons.length > 0) {
      headsUps.push(`Might need a 2nd server (${reasons.join(", ")}). Priced with 1 for now. Add another if needed.`);
    }
  }

  const hasHourlyStaff = (!wantsPackage && wantsBartender) || offerBoth || services.includes("server");
  if (hasHourlyStaff && hours === null) {
    headsUps.push(`No staff arrival/end times yet, so hourly staff are priced at the ${MIN_HOURS}-hour minimum.`);
  }

  const g = gratuityLabel(pl);
  if (!offerBoth) {
    const base = Array.from(gratuity.values()).reduce((a, b) => a + b, 0);
    if (base > 0) lines.push(line(`Gratuity (${g}) on hourly staff`, 1, round2(base * pl.gratuityRate)));
  } else {
    const labels = new Map<string | null, string>([
      [PKG, `Gratuity (${g}) on extra bar time`],
      [BAR, `Gratuity (${g}) on bartender`],
      [null, `Gratuity (${g}) on server`],
    ]);
    for (const [option, base] of Array.from(gratuity.entries())) {
      if (base > 0) lines.push(line(labels.get(option)!, 1, round2(base * pl.gratuityRate), null, option));
    }
  }

  const unpriced = services.filter((s) => !["signature_cocktails", "bartender", "server"].includes(s));
  if (unpriced.length > 0) {
    headsUps.push(`No set price for: ${labelsFor(SERVICES, unpriced)}. Add those lines yourself.`);
  }

  return { lines, customQuote: null, headsUps };
}
