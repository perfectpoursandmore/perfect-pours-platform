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
