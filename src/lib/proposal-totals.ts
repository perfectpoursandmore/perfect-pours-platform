import { computeProposalTotals, effectiveOption, linesForOption } from "@/lib/proposals";

// Shared by the admin booking actions and the client's pricing page (which
// uses the service-role client). `any` for the same reason as
// event-financials.ts: the real Supabase client type is too deep to check.
type SupabaseLike = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Recalculates and saves a proposal's totals, counting only the chosen option's lines. */
export async function recomputeProposalTotals(supabase: SupabaseLike, proposalId: string) {
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", proposalId).single();

  // select("*") so this keeps working before the options migration has run.
  const { data: allItems } = await supabase.from("proposal_items").select("*").eq("proposal_id", proposalId);
  const all = (allItems ?? []) as { option_label?: string | null; line_total: number }[];
  const items = linesForOption(all, effectiveOption(all, proposal?.chosen_option));

  const totals = computeProposalTotals({
    lineTotals: items.map((i) => Number(i.line_total)),
    discountAmount: Number(proposal?.discount_amount ?? 0),
    feeAmount: Number(proposal?.fee_amount ?? 0),
    gratuityRatePercent: Number(proposal?.gratuity_rate ?? 0),
    taxRatePercent: Number(proposal?.tax_rate ?? 0),
  });

  await supabase
    .from("proposals")
    .update({
      subtotal: totals.subtotal,
      gratuity_amount: totals.gratuityAmount,
      tax_amount: totals.taxAmount,
      total_amount: totals.totalAmount,
    })
    .eq("id", proposalId);
}
