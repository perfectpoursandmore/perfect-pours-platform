import { createAdminClient } from "@/lib/supabase/admin";

// Server-only. Talks to the QuickBooks Online Accounting API directly over
// fetch — no `intuit-oauth`/`node-quickbooks` SDK dependency, just the REST
// calls this app actually needs: find-or-create a Customer, create an
// Invoice, send it (QuickBooks emails it — and if Faith's QBO account has
// QuickBooks Payments turned on, that email includes a real "Pay Now" link
// hosted entirely by Intuit), and re-read an Invoice's balance to detect
// payment. This app never collects or stores a card number itself.

const QBO_SCOPES = "com.intuit.quickbooks.accounting";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function basicAuthHeader(): string {
  const id = requireEnv("QUICKBOOKS_CLIENT_ID");
  const secret = requireEnv("QUICKBOOKS_CLIENT_SECRET");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

/**
 * Every QuickBooks response (success or failure) carries an `intuit_tid`
 * header — a tracking number Intuit's own support team asks for when
 * troubleshooting a request. We fold it into our error messages so it's
 * right there in the message Faith already sees, instead of being lost.
 */
function intuitTidSuffix(res: Response): string {
  const tid = res.headers.get("intuit_tid");
  return tid ? ` [intuit_tid: ${tid}]` : "";
}

/** The URL that starts Faith's one-time "connect your QuickBooks company" flow. */
export function getQboAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("QUICKBOOKS_CLIENT_ID"),
    redirect_uri: requireEnv("QUICKBOOKS_REDIRECT_URI"),
    response_type: "code",
    scope: QBO_SCOPES,
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: requireEnv("QUICKBOOKS_REDIRECT_URI"),
    }),
  });

  if (!res.ok) {
    throw new Error(
      `QuickBooks token exchange failed: ${res.status} ${await res.text()}${intuitTidSuffix(res)}`
    );
  }

  return res.json();
}

/**
 * Marks (or clears) the "needs reconnect" flag Faith sees as a banner
 * whenever QuickBooks stops accepting the stored connection — an expired or
 * revoked refresh token, an invalid_grant error, or QuickBooks rejecting a
 * request outright. Cleared automatically the moment a request succeeds
 * again, and whenever she reconnects via Settings.
 */
async function setNeedsReconnect(needsReconnect: boolean, reason: string | null): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("qbo_connections")
    .update({ needs_reconnect: needsReconnect, reconnect_reason: reason })
    .eq("id", true);
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(
      `QuickBooks token refresh failed: ${res.status} ${await res.text()}${intuitTidSuffix(res)}`
    );
  }

  return res.json();
}

type QboConnection = {
  accessToken: string;
  realmId: string;
  environment: "sandbox" | "production";
};

/**
 * Returns a valid access token + realm id for Faith's connected QuickBooks
 * company, refreshing and persisting a new one first if the stored token is
 * expired or about to be. Returns null if nothing is connected yet. Reads
 * via the service-role client so it works the same from an admin request or
 * a background sync.
 */
export async function getValidConnection(): Promise<QboConnection | null> {
  const supabase = createAdminClient();

  const { data: connection } = await supabase
    .from("qbo_connections")
    .select("access_token, refresh_token, access_token_expires_at, realm_id, environment")
    .eq("id", true)
    .single();

  if (!connection?.refresh_token || !connection.realm_id) return null;

  const environment = (connection.environment as "sandbox" | "production") ?? "sandbox";
  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0;
  const stillValid = connection.access_token && expiresAt - Date.now() > 60_000; // 1 min margin

  if (stillValid) {
    return { accessToken: connection.access_token, realmId: connection.realm_id, environment };
  }

  let refreshed: TokenResponse;
  try {
    refreshed = await refreshAccessToken(connection.refresh_token);
  } catch (err) {
    // The refresh token itself is expired, revoked, or QuickBooks returned
    // invalid_grant — the stored connection is dead until Faith reconnects.
    // Surface that as a banner rather than letting every invoicing action
    // crash with a raw error.
    await setNeedsReconnect(
      true,
      "QuickBooks disconnected this app (this can happen if the connection " +
        "sat unused for a long time, or was disconnected from QuickBooks' " +
        "side). Reconnect below to keep sending invoices."
    );
    console.error("QuickBooks token refresh failed:", err);
    return null;
  }

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("qbo_connections")
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token, // Intuit rotates the refresh token on every use
      access_token_expires_at: newExpiresAt,
      needs_reconnect: false,
      reconnect_reason: null,
    })
    .eq("id", true);

  return { accessToken: refreshed.access_token, realmId: connection.realm_id, environment };
}

function apiBase(environment: "sandbox" | "production"): string {
  return environment === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

async function qboFetch(
  conn: QboConnection,
  path: string,
  init?: RequestInit
): Promise<Record<string, unknown>> {
  const res = await fetch(`${apiBase(conn.environment)}/v3/company/${conn.realmId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) {
      // A freshly-refreshed access token was still rejected — QuickBooks has
      // revoked this connection outright (e.g. Faith disconnected the app
      // from the QuickBooks side, or an admin removed access).
      await setNeedsReconnect(
        true,
        "QuickBooks rejected this app's connection. Reconnect below to keep sending invoices."
      );
    }
    throw new Error(`QuickBooks API error (${path}): ${res.status} ${body}${intuitTidSuffix(res)}`);
  }

  return res.json();
}

/** Escapes a value for QuickBooks' SQL-like query language. */
function qboQueryEscape(value: string): string {
  return value.replace(/'/g, "\\'");
}

/**
 * Finds a QuickBooks Customer by email (Faith's client might already exist
 * in her QuickBooks company from before this app existed), or creates one.
 * Always returns the QuickBooks Customer Id.
 */
export async function findOrCreateCustomer(
  conn: QboConnection,
  client: { firstName: string; lastName: string; email: string | null; phone: string | null }
): Promise<string> {
  const displayName = `${client.firstName} ${client.lastName}`.trim();

  if (client.email) {
    const query = `select * from Customer where PrimaryEmailAddr = '${qboQueryEscape(client.email)}'`;
    const result = await qboFetch(conn, `/query?query=${encodeURIComponent(query)}`);
    const existing = (result.QueryResponse as { Customer?: Array<{ Id: string }> } | undefined)
      ?.Customer?.[0];
    if (existing) return existing.Id;
  }

  const created = await qboFetch(conn, "/customer", {
    method: "POST",
    body: JSON.stringify({
      DisplayName: displayName,
      GivenName: client.firstName,
      FamilyName: client.lastName,
      ...(client.email ? { PrimaryEmailAddr: { Address: client.email } } : {}),
      ...(client.phone ? { PrimaryPhone: { FreeFormNumber: client.phone } } : {}),
    }),
  });

  const customer = created.Customer as { Id: string };
  return customer.Id;
}

/**
 * Creates a QuickBooks Invoice for one line item (the deposit, or the
 * balance) against Faith's default "Services" income account/item — see
 * README for the one-time step of confirming that item exists in her
 * QuickBooks company (QuickBooks always has at least one default service
 * item available, so this works out of the box for most accounts).
 */
export async function createInvoice(
  conn: QboConnection,
  params: { customerId: string; description: string; amount: number }
): Promise<{ id: string }> {
  const created = await qboFetch(conn, "/invoice", {
    method: "POST",
    body: JSON.stringify({
      CustomerRef: { value: params.customerId },
      Line: [
        {
          Amount: params.amount,
          DetailType: "SalesItemLineDetail",
          Description: params.description,
          SalesItemLineDetail: {
            // "1" is QuickBooks' universal default service/product item id —
            // present in every QBO company unless it's been deleted. Faith
            // can repoint this to a specific catalog item later if she wants
            // deposits/balances to land on a distinct income account.
            ItemRef: { value: "1" },
          },
        },
      ],
    }),
  });

  const invoice = created.Invoice as { Id: string };
  return { id: invoice.Id };
}

/**
 * Tells QuickBooks to email the invoice to the customer on file. If Faith's
 * QuickBooks company has QuickBooks Payments enabled, Intuit automatically
 * includes a secure "Pay Now" button in that email — no separate payments
 * integration needed on this app's side.
 */
export async function sendInvoice(conn: QboConnection, invoiceId: string): Promise<void> {
  await qboFetch(conn, `/invoice/${invoiceId}/send`, { method: "POST" });
}

/** Reads an invoice back to check whether it's been paid (Balance reaches 0). */
export async function getInvoiceStatus(
  conn: QboConnection,
  invoiceId: string
): Promise<{ balance: number; totalAmount: number; paid: boolean }> {
  const result = await qboFetch(conn, `/invoice/${invoiceId}`);
  const invoice = result.Invoice as { Balance: number; TotalAmt: number };
  return {
    balance: invoice.Balance,
    totalAmount: invoice.TotalAmt,
    paid: invoice.Balance <= 0,
  };
}
