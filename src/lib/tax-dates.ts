// Tax due dates Faith needs a heads-up for. Pure functions, no database.
//
// - Estimated income tax, federal (1040-ES) and New York (IT-2105): Jan 15
//   (for the last quarter of the year before), Apr 15, Jun 15, Sep 15.
// - New York sales tax (ST-100 quarterly / ST-101 annual): quarterly on
//   Mar 20, Jun 20, Sep 20, Dec 20; annual filers once, on Mar 20.
// A date that lands on a weekend moves to the Monday after. (Federal
// holidays are rare on these dates and aren't handled.)

export type TaxDate = { date: string; title: string; detail: string };
export type SalesTaxFiling = "quarterly" | "annual";

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Saturday/Sunday → the following Monday. */
export function nextBusinessDay(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDay();
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function datesForYear(y: number, filing: SalesTaxFiling): TaxDate[] {
  const estimated = (m: number, d: number, which: string) => ({
    date: nextBusinessDay(iso(y, m, d)),
    title: "Estimated taxes due",
    detail: `Federal and New York estimated income tax (${which}).`,
  });
  const sales = (m: number, which: string) => ({
    date: nextBusinessDay(iso(y, m, 20)),
    title: "NY sales tax due",
    detail: `File and pay New York sales tax (${which}).`,
  });
  const list: TaxDate[] = [
    estimated(1, 15, `last payment for ${y - 1}`),
    estimated(4, 15, `1st payment for ${y}`),
    estimated(6, 15, `2nd payment for ${y}`),
    estimated(9, 15, `3rd payment for ${y}`),
  ];
  if (filing === "annual") {
    list.push(sales(3, `annual return, March ${y - 1} to February ${y}`));
  } else {
    list.push(
      sales(3, `December to February`),
      sales(6, `March to May`),
      sales(9, `June to August`),
      sales(12, `September to November`)
    );
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

/** Tax dates from `today` through `today + withinDays`, soonest first. */
export function upcomingTaxDates(today: string, withinDays: number, filing: SalesTaxFiling): TaxDate[] {
  const y = Number(today.slice(0, 4));
  const end = new Date(today + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + withinDays);
  const endIso = end.toISOString().slice(0, 10);
  return [...datesForYear(y, filing), ...datesForYear(y + 1, filing)].filter((t) => t.date >= today && t.date <= endIso);
}

export function daysUntil(today: string, date: string): number {
  return Math.round((new Date(date + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 86400000);
}

export function whenText(today: string, date: string): string {
  const n = daysUntil(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days (${new Date(date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })})`;
}
