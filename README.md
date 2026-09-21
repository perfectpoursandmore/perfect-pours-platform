# Perfect Pours & More — Business Management Platform

The custom event booking & staff management system described in the PRD. Built in
phases; this codebase currently has **Phase 1 (auth & roles)**, **Phase 2
(clients/leads/events database)**, **Phase 3 (consultation booking +
Google Calendar)**, **Phase 4 (the admin dashboard, leads, clients, and
events screens)**, **Phase 5 (service catalog, proposals, contracts with
e-signature, and the client's secure document link)**, **Phase 6
(QuickBooks Online invoicing for deposits and balances)**, **Phase 7
(the internal master business calendar)**, **Phase 8 (the staff
calendar)**, **Phase 9 (staff payout tracking)**, and **Phase 10 (email
templates, automatic sending, and per-client history)** in place — the
full 10-phase core roadmap from the original plan.

## What exists right now

- Three login types — **admin**, **staff**, **client** — each landing in its own
  area (`/admin`, `/staff`, `/portal`) after sign-in.
- A Postgres/Supabase schema (`supabase/migrations/`) with Row Level Security on
  every table, so the privacy rules in the PRD (staff never see client contact
  info, pricing, or payments; clients only ever see their own event) are enforced
  by the database itself — not just by hiding buttons in the interface.
- A `profiles` table that tags every login with its role, plus a trigger that
  refuses to let anyone but an admin change a role.
- Sensitive data lives in its own tables (`client_notes`, `staff_details`,
  `event_notes`, `event_financials`, `event_staff_payouts`), each with an
  admin-only policy — so there's no shared table where a bug could leak a
  column that shouldn't be visible.
- A public **consultation booking page** at `/book` — a prospective client
  picks an open time and fills in the intake form from the PRD (name, email,
  phone, event date/type, venue, guest count, how they heard about us). It
  checks Faith's actual Google Calendar for conflicts, applies the configured
  buffers/minimum notice/maximum advance window, creates the consultation on
  her calendar, and drops a new lead straight into the CRM — no retyping.
- An **admin settings area** (`/admin/settings`) to configure weekly hours,
  appointment length, buffers, minimum notice, maximum advance booking,
  vacation mode, and blocked-out dates, plus a page to connect Google Calendar.
- A real **Leads** pipeline (`/admin/leads`) — filter by stage, open a lead to
  see everything from the intake form, change its status, and turn it into a
  real client + event record with one click once the consultation's done.
- A real **Clients** area (`/admin/clients`) — contact info, private notes
  (from texts/calls/in person — never shown to the client or to staff), and
  every event linked to that client.
- A real **Events** area (`/admin/events`) — each event has Overview (venue,
  date, guest count, indoor/outdoor, dress code, parking/venue instructions),
  private admin-only Notes, and a Staff tab to manually assign people (or
  leave a role marked "open" so it's visible on the future staff calendar).
- A **Staff directory** (`/admin/staff`) so there's someone to assign —
  name, roles, phone/email/pay rate (admin-only, never exposed to a staff
  login).
- A **real Dashboard** — this week's booked events, upcoming consultations,
  and leads still waiting on you, pulled from live data instead of a
  placeholder.
- A **Service Catalog** (`/admin/catalog`) — the reusable menu of things you
  sell (bartender hours, cocktail packages, rentals, etc.) with a default
  price, so building a proposal is picking from a list instead of retyping
  numbers every time.
- **Contract Templates** (`/admin/templates`) — write your agreement once
  with `{{client_name}}`, `{{event_date}}`, `{{total_amount}}`-style
  placeholders; the app fills them in per event when a contract is generated.
- A full **Proposal & Contract builder** on every event's new **Booking** tab
  (`/admin/events/[id]/booking`) — add line items from the catalog or type a
  custom one, apply a discount/fee/tax rate/deposit, and the total recalculates
  automatically; generate a contract from any active template; then **Send
  Booking Documents**, which hands you a secure one-time link to text or
  email the client (real automatic sending is Phase 10).
- The client's own **secure document page** (`/client/[token]`) — no login
  required, just their private link — showing their proposal, their contract,
  and a canvas-based signature pad to sign it. Once signed, the event's
  booking status updates automatically; once you mark the deposit received
  (a manual button for now, until Phase 6 wires up QuickBooks), the event
  flips to **Booked** on its own.

- **QuickBooks Online invoicing** (`/admin/settings/quickbooks` to connect) —
  from an event's Booking tab, create and send a real QuickBooks invoice for
  the deposit or the balance with one click. If your QuickBooks company has
  **QuickBooks Payments** turned on, Intuit's own invoice email includes a
  secure "Pay Now" link — this app never touches a card number itself, it
  just tells QuickBooks what to invoice and re-checks the invoice's balance
  when you click **Refresh payment status**. A manual "mark received"
  fallback stays available on both the deposit and the balance for anyone
  who pays by cash, check, or Zelle instead.

- The **master business calendar** (`/admin/calendar`) — Month, Week, and
  Agenda views of every real booking (booked, completed, or cancelled —
  cancelled shows crossed out rather than looking like an open slot).
  Click any event to jump straight to its full record. Bare inquiries that
  haven't converted yet don't clutter it.
- The **staff calendar** (`/staff`, what a staff login sees after signing
  in) — every booked event automatically, no individual invitations needed:
  date, location, indoor/outdoor, guest count, arrival/end times, dress
  code, parking/venue instructions, and the full roster for that event
  (their own assignment bolded, teammates by name, any still-open position
  called out). Verified at the database level (not just hidden in the
  interface) that this login gets real rows back for events/roster/staff
  directory and a hard zero for clients, proposals, contracts,
  event_financials, pay rates, and payouts — even when those tables aren't
  empty.

- **Payout tracking** — on any event's Staff tab, enter hours and a pay rate
  for each assigned person (defaults to their saved rate, overridable per
  event) and the expected pay calculates itself; mark it paid with a date,
  method, and note (e.g. "Paid September 20 via Zelle"). The standalone
  **Payouts** page (`/admin/payouts`) rolls this up across every event at
  once — Unpaid (with a running total owed), Paid, or All — so answering
  "who do I owe this week" doesn't mean opening each event one at a time.

- **Email templates & sending** (`/admin/email-templates`, status at
  `/admin/settings/email`) — two starter templates are seeded
  ("Consultation Confirmed" and "Proposal & Contract Ready"), editable
  freely, with `{{variable}}` placeholders filled in the same way contracts
  are. Once connected (see the Email setup section below), a consultation
  booking sends a real confirmation automatically, and sending an event's
  proposal/contract emails the client the secure link directly (a template
  picker appears right on the Booking tab) instead of only showing it to
  copy/paste — that fallback still works if email isn't connected. Every
  send, successful or failed, is logged; a client's own page shows their
  full email history and lets you send them anything else on the spot.

## What's not built yet

The full 10-phase core roadmap is now complete, including **global
search** (`/api/admin/search`, the box at the top of every admin page) —
matches clients, leads, and events by name, email, phone, venue, or
event type, and finding a client also surfaces their events even when
the event's own name doesn't mention them.

QuickBooks payment status is pulled by clicking **Refresh payment
status** rather than pushed automatically — real-time webhooks need a
public HTTPS URL, which now exists since the app is deployed, so this is
doable whenever it's worth doing (see the QuickBooks setup section
above). Beyond the core roadmap, the "Later" bucket — cocktail
selection, an alcohol inventory calculator, rental inventory, expense
tracking, bank/card transaction import, and deeper reporting — hasn't
been started; the database schema for those hasn't been designed yet
either.

## One-time setup (you only do this once)

You don't need to write any code for this part — just create a couple of
free accounts and paste a few values into one file.

1. **Create a Supabase project** at supabase.com (free to start). Once it's
   created, go to *Project Settings → API* and copy:
   - Project URL
   - `anon` public key
   - `service_role` key (keep this one secret — never share it or commit it)
2. Copy `.env.example` to `.env.local` and paste those three values in.
3. Run the SQL files in `supabase/migrations/` against your project, **in
   order** — in the Supabase dashboard, open the **SQL Editor** and paste each
   file's contents in, or use the Supabase CLI (`supabase db push`) if you're
   comfortable with it.
4. Install dependencies and start the app:

   ```bash
   npm install
   npm run dev
   ```

5. Invite yourself as the first admin login:

   ```bash
   node scripts/invite-user.mjs --email faith@perfectpoursandmore.com --role admin --name "Faith"
   ```

   You'll get an email with a link to set your password, then sign in at
   `/login`.

### Connecting Google Calendar (needed for the `/book` page to work)

This is the one step that's genuinely yours to do, since it's your calendar.
About five minutes, all clicking:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a new project (any name is fine, e.g. "Perfect Pours Platform").
2. In the sidebar, go to **APIs & Services → Library**, search for
   **Google Calendar API**, and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen**. Choose **External**,
   fill in the required app name/support email, and add yourself as a test
   user (this keeps it private to you while in testing mode — that's fine,
   it doesn't need to be published for this app since only you connect it).
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client
   ID**. Choose **Web application**, and under **Authorized redirect URIs**
   add the exact value of `GOOGLE_CALENDAR_REDIRECT_URI` from your `.env.local`
   (once deployed, that becomes `https://yourdomain.com/api/google/callback`).
5. Copy the **Client ID** and **Client secret** it gives you into
   `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` in
   `.env.local`.
6. Restart the app, sign in as admin, go to **Settings → Google Calendar**,
   and click **Connect Google Calendar** — you'll see Google's real "Allow"
   screen, exactly like connecting any app to your calendar.

Once connected, go to **Settings → Consultation availability** to set your
real weekly hours before sharing the `/book` link anywhere.

### Connecting QuickBooks Online (needed for real deposit/balance invoices)

Also genuinely yours to do, since it's your QuickBooks account. About ten
minutes:

1. Go to [developer.intuit.com](https://developer.intuit.com) and sign in
   with the same Intuit account you use for QuickBooks (or create a free
   developer account — it doesn't cost anything and doesn't touch your real
   company data until you tell it to).
2. Click **Create an app**, choose **QuickBooks Online and Payments**, give
   it any name (e.g. "Perfect Pours Platform"), and create it.
3. In the app's **Keys & OAuth** page, under the **Development** tab, copy
   the **Client ID** and **Client Secret** into `QUICKBOOKS_CLIENT_ID` and
   `QUICKBOOKS_CLIENT_SECRET` in `.env.local`.
4. On the same page, under **Redirect URIs**, add the exact value of
   `QUICKBOOKS_REDIRECT_URI` from your `.env.local` (once deployed, that
   becomes `https://yourdomain.com/api/quickbooks/callback`).
5. Leave `QUICKBOOKS_ENVIRONMENT=sandbox` for now — Intuit gives every app a
   free sandbox company automatically, so you can test the whole flow
   (connect, send an invoice, mark it paid) without touching your real
   QuickBooks books. Intuit's developer dashboard has a **Sandbox** tab
   showing that test company's login if you want to peek at the invoices
   this app creates there.
6. Restart the app, sign in as admin, go to **Settings → QuickBooks Online**,
   and click **Connect QuickBooks** — you'll see Intuit's real "Connect"
   screen, exactly like connecting any app to QuickBooks.
7. When you're ready to send real invoices against your actual QuickBooks
   company: in the Intuit developer dashboard, request **production
   keys** for the app (a short questionnaire — Intuit reviews it, usually
   quickly), swap the sandbox Client ID/Secret for the production ones,
   set `QUICKBOOKS_ENVIRONMENT=production`, and reconnect from Settings.
   Real card payments through the "Pay Now" link on an invoice additionally
   require **QuickBooks Payments** to be turned on for your QuickBooks
   company (Intuit will prompt you for this in your QuickBooks account if
   it isn't already) — without it, invoices still send, just without the
   built-in "Pay Now" button.

### Connecting email (needed for automatic sending)

About five minutes:

1. Go to [resend.com](https://resend.com) and create a free account (their
   free tier covers a small business's real volume — 3,000 emails/month at
   the time of writing, worth double-checking on their pricing page).
2. Under **Domains**, add the domain you want emails to come from (e.g.
   `perfectpoursandmore.com`) and add the DNS records Resend shows you at
   your domain registrar (where you bought/manage the domain — GoDaddy,
   Namecheap, wherever your WordPress site's domain lives). This step is
   what lets email sent through this app actually come from your own
   domain instead of looking suspicious to spam filters; it can take a few
   minutes to a few hours to verify after you add the records.
3. Under **API Keys**, create one and copy it into `RESEND_API_KEY` in
   `.env.local`.
4. Set `RESEND_FROM_EMAIL` to an address at your verified domain, in the
   format `"Perfect Pours & More <hello@perfectpoursandmore.com>"` — the
   part before `@` can be anything (`hello`, `bookings`, your own name), it
   just needs to be at the domain you verified in step 2.
5. Set `NEXT_PUBLIC_APP_URL` to your real domain once deployed (stays
   `http://localhost:3000` for local testing).
6. Restart the app and check **Settings → Email** — it'll show whether
   both variables are set. No further connecting/clicking needed; unlike
   Google and QuickBooks, Resend doesn't use a per-login OAuth flow.

Until this is connected, nothing is broken — consultation confirmations
just don't send, and the secure client link stays copy/paste-only on the
Booking tab, exactly like before this phase.

Deployment (making it live on the internet, e.g. via Vercel) happens in a
later phase, and is also the point where QuickBooks' payment webhook
becomes usable so payment status updates on its own instead of needing the
"Refresh payment status" click — I'll walk you through that when we get
there.

## Project layout

```
src/
  app/
    login/                    sign-in page
    admin/                     admin area (role-gated)
      leads/                    pipeline list, detail, convert-to-client/event
      clients/                  list + profile (contact info, private notes, events)
      events/[id]/               Overview / Notes / Staff / Booking tabs for one event
        booking/                  proposal + contract builder, send-to-client
      staff/                    staff directory (admin-only contact/pay info)
      payouts/                  cross-event payout rollup (unpaid/paid/all)
      catalog/                  service catalog (items you sell, with default prices)
      templates/                contract templates ({{variable}} placeholders)
      email-templates/          email templates ({{variable}} placeholders)
      settings/consultations/  weekly hours, buffers, blocked dates
      settings/calendar/       Google Calendar connect/disconnect
      settings/quickbooks/     QuickBooks Online connect/disconnect
      settings/email/          shows whether Resend is configured
      calendar/                 master calendar — month/week/agenda views
    staff/                     staff calendar — every booked event, roster, no client/financial data
    portal/                    client portal (role-gated)
    book/                      public consultation booking page
    client/[token]/            public secure proposal/contract/sign page (no login)
    api/auth/                  sign-out route
    api/book/                  slots lookup + booking submission (public)
    api/google/                Google OAuth connect/callback (admin-only)
    api/quickbooks/            QuickBooks OAuth connect/callback (admin-only)
    api/admin/search/          global search across clients/leads/events (admin-only)
  components/
    BookingFlow.tsx             the interactive date/time picker + intake form
    SignaturePad.tsx            canvas-based e-signature capture
    GlobalSearch.tsx            search box + results dropdown, top of every admin page
  lib/
    supabase/                  Supabase client helpers (browser/server/admin)
    auth/                       role-lookup helper used by every server page
    google-calendar.ts          Google Calendar REST client (free/busy, create event)
    quickbooks.ts                QuickBooks Online REST client (customer, invoice, send, status)
    scheduling/
      timezone.ts               DST-safe local-time <-> UTC conversion
      availability.ts           pure slot-computation logic
      load-availability.ts      wires settings + blocked dates + Google together
    contracts.ts                {{variable}} substitution for contract bodies
    proposals.ts                proposal subtotal/discount/fee/tax/total math
    event-financials.ts         keeps event_financials + booked-status in sync
    calendar-dates.ts            pure month/week grid arithmetic for /admin/calendar
    email.ts                    Resend REST client + render/send/log-in-one helper
  middleware.ts                 session refresh + role-based redirects
supabase/
  migrations/                   the actual database schema, in order
scripts/
  invite-user.mjs               admin tool to create a staff/client/admin login
```
