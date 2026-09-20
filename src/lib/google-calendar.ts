import { createAdminClient } from "@/lib/supabase/admin";

// Server-only. Talks to Google's Calendar API directly over fetch — no
// googleapis SDK dependency, just the two REST calls this app actually needs:
// checking free/busy time and creating the consultation event on Faith's
// calendar. Never import this from a Client Component.

const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** The URL that starts Faith's one-time "Allow" consent flow. */
export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
    redirect_uri: requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // ensures a refresh_token is issued even on re-connect
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_CALENDAR_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

/**
 * Returns a valid access token for Faith's connected calendar, refreshing
 * and persisting a new one first if the stored token is expired or about
 * to be. Used by both the admin settings page and the anonymous public
 * booking routes, so it reads via the service-role client rather than
 * assuming an authenticated session.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getValidAccessToken(): Promise<{
  accessToken: string;
  calendarId: string;
} | null> {
  const supabase = createAdminClient();

  const { data: connection } = await supabase
    .from("calendar_connections")
    .select("access_token, refresh_token, access_token_expires_at, google_calendar_id")
    .eq("id", true)
    .single();

  if (!connection?.refresh_token) return null;

  const expiresAt = connection.access_token_expires_at
    ? new Date(connection.access_token_expires_at).getTime()
    : 0;
  const stillValid = connection.access_token && expiresAt - Date.now() > 60_000; // 1 min margin

  if (stillValid) {
    return { accessToken: connection.access_token, calendarId: connection.google_calendar_id };
  }

  // Refreshing has occasionally failed with a transient "invalid_grant" from
  // Google even while the same refresh_token succeeds moments later on a
  // second try (confirmed by hand: an immediate retry with the identical
  // token consistently works). Rather than let one flaky refresh mark the
  // calendar "disconnected" for visitors until the next request happens to
  // succeed, retry once after a short delay before giving up.
  let refreshed;
  try {
    refreshed = await refreshAccessToken(connection.refresh_token);
  } catch (firstErr) {
    console.error("Google Calendar token refresh failed once, retrying:", firstErr);
    await sleep(500);
    refreshed = await refreshAccessToken(connection.refresh_token);
  }

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase
    .from("calendar_connections")
    .update({ access_token: refreshed.access_token, access_token_expires_at: newExpiresAt })
    .eq("id", true);

  return { accessToken: refreshed.access_token, calendarId: connection.google_calendar_id };
}

export interface BusyBlock {
  start: Date;
  end: Date;
}

/** Reads Faith's busy blocks in [timeMin, timeMax) — never event titles/details. */
export async function getBusyBlocks(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<BusyBlock[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Google freeBusy query failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const busy: Array<{ start: string; end: string }> = data.calendars?.[calendarId]?.busy ?? [];

  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

/** Creates the consultation call on Faith's calendar so it becomes a busy block too. */
export async function createConsultationEvent(params: {
  accessToken: string;
  calendarId: string;
  start: Date;
  end: Date;
  timeZone: string;
  clientName: string;
  clientEmail: string;
  eventType: string;
}): Promise<{ id: string; htmlLink: string }> {
  const { accessToken, calendarId, start, end, timeZone, clientName, clientEmail, eventType } =
    params;

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `Consultation: ${clientName} (${eventType})`,
        description: `Booked through the Perfect Pours & More consultation scheduler.\nClient email: ${clientEmail}`,
        start: { dateTime: start.toISOString(), timeZone },
        end: { dateTime: end.toISOString(), timeZone },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Google event creation failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}
