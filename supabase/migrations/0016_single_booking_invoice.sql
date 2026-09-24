-- Faith wants one QuickBooks invoicing step instead of a separate deposit
-- invoice and balance invoice: she sends ONE invoice for the full total,
-- with a memo asking for the retainer amount up front, and QuickBooks
-- Payments lets the client type in whatever amount they want to pay first
-- (once Faith turns on "Allow partial payments" in her QuickBooks Payments
-- settings -- that's a one-time setting in her QuickBooks account, not
-- something this app can flip for her). This app then infers "retainer
-- received" vs "paid in full" from how much of the invoice's balance has
-- come in. The old deposit_invoice_*/balance_invoice_* columns from
-- migration 0005 are left in place untouched (for any event that already
-- has one of those on file) -- this just adds where the new single-invoice
-- flow tracks itself.
alter table public.event_financials
  add column invoice_id text,
  add column invoice_status text, -- 'draft' | 'sent' | 'paid'
  add column invoice_sent_at timestamptz;
