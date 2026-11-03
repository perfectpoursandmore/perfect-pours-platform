import { effectiveOption, linesForOption } from "@/lib/proposals";
import type { InvoiceLine } from "@/lib/quickbooks";

// Turns the Quote into separate invoice lines -- one per charge (server,
// bartender, package, gratuity, fee, tax...) -- instead of one lump sum.
// Pure function, no database.

type QuoteItem = {
  description: string;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string;
  option_label?: string | null;
  sort_order?: number | null;
};

type Quote = {
  chosen_option?: string | null;
  discount_amount?: number | string | null;
  fee_amount?: number | string | null;
  gratuity_rate?: number | string | null;
  gratuity_amount?: number | string | null;
  tax_rate?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;
const pct = (v: number) => `${Number(v.toFixed(3))}%`;

/**
 * The Quote's lines for the chosen option, then discount, fee, gratuity and
 * tax as their own lines. Returns null when the lines don't add up to the
 * Quote's total (so the caller can fall back to one line for the total).
 */
export function invoiceLinesFromQuote(quote: Quote, items: QuoteItem[]): InvoiceLine[] | null {
  const chosen = linesForOption(items, effectiveOption(items, quote.chosen_option))
    .slice()
    .sort((a, b) => num(a.sort_order) - num(b.sort_order));

  const lines: InvoiceLine[] = [];
  for (const i of chosen) {
    const amount = round2(num(i.line_total));
    if (amount === 0) continue; // e.g. an hourly rate with no hours yet
    lines.push({
      description: i.description.trim(),
      amount,
      quantity: num(i.quantity),
      unitPrice: num(i.unit_price),
    });
  }

  const discount = round2(num(quote.discount_amount));
  const fee = round2(num(quote.fee_amount));
  const gratuity = round2(num(quote.gratuity_amount));
  const tax = round2(num(quote.tax_amount));
  if (discount > 0) lines.push({ description: "Discount", amount: -discount });
  if (fee > 0) lines.push({ description: "Fee", amount: fee });
  if (gratuity > 0) {
    const rate = num(quote.gratuity_rate);
    lines.push({ description: rate > 0 ? `Gratuity (${pct(rate)})` : "Gratuity", amount: gratuity });
  }
  if (tax > 0) {
    const rate = num(quote.tax_rate);
    lines.push({ description: rate > 0 ? `Sales tax (${pct(rate)})` : "Sales tax", amount: tax });
  }

  const sum = round2(lines.reduce((s, l) => s + l.amount, 0));
  if (lines.length === 0 || Math.abs(sum - round2(num(quote.total_amount))) > 0.01) return null;
  return lines;
}
