/** Pure calculation used by both the proposal editor and its tests. */
export function computeProposalTotals(params: {
  lineTotals: number[];
  discountAmount: number;
  feeAmount: number;
  gratuityRatePercent: number;
  taxRatePercent: number;
}): { subtotal: number; gratuityAmount: number; taxAmount: number; totalAmount: number } {
  const subtotal = round2(params.lineTotals.reduce((sum, v) => sum + v, 0));
  const preGratuityBase = subtotal - params.discountAmount + params.feeAmount;
  const gratuityAmount = round2(preGratuityBase * (params.gratuityRatePercent / 100));
  // Sales tax is calculated on the base plus gratuity, matching how a
  // mandatory service charge is commonly taxed alongside the services it's on.
  const taxableBase = preGratuityBase + gratuityAmount;
  const taxAmount = round2(taxableBase * (params.taxRatePercent / 100));
  const totalAmount = round2(taxableBase + taxAmount);

  return { subtotal, gratuityAmount, taxAmount, totalAmount };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------
// Options (e.g. "Perfect Pours Package" vs "Bartender only"). Lines with no
// option_label are always included; the rest count only for the chosen one.
// ---------------------------------------------------------------------

type OptionLine = { option_label?: string | null; line_total: number | string; sort_order?: number | null };

/** The distinct options on a proposal, in the order they first appear. */
export function proposalOptions(items: OptionLine[]): string[] {
  const seen: string[] = [];
  for (const i of items) if (i.option_label && !seen.includes(i.option_label)) seen.push(i.option_label);
  return seen;
}

/**
 * Which option the totals should use: the chosen one if it still exists,
 * otherwise the first option (so stored totals are never blank).
 */
export function effectiveOption(items: OptionLine[], chosen: string | null | undefined): string | null {
  const options = proposalOptions(items);
  if (options.length === 0) return null;
  return chosen && options.includes(chosen) ? chosen : options[0];
}

/** The lines that count when `option` is the one picked. */
export function linesForOption<T extends OptionLine>(items: T[], option: string | null): T[] {
  return items.filter((i) => !i.option_label || i.option_label === option);
}
