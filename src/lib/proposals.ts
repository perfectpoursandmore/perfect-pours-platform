/** Pure calculation used by both the proposal editor and its tests. */
export function computeProposalTotals(params: {
  lineTotals: number[];
  discountAmount: number;
  feeAmount: number;
  taxRatePercent: number;
}): { subtotal: number; taxAmount: number; totalAmount: number } {
  const subtotal = round2(params.lineTotals.reduce((sum, v) => sum + v, 0));
  const taxableBase = subtotal - params.discountAmount + params.feeAmount;
  const taxAmount = round2(taxableBase * (params.taxRatePercent / 100));
  const totalAmount = round2(taxableBase + taxAmount);

  return { subtotal, taxAmount, totalAmount };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
