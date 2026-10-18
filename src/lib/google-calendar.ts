import { createAdminClient } from "@/lib/supabase/admin";

// Server-only. Talks to Google's Calendar API directly over fetch — no
// googleapis SDK dependency, just the REST calls this app actually needs:
// reading Faith's open call times and busy time, and creating the
// consultation event on her calendar. Never import this from a Client Component.

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
  // retry. Try a few times with a short backoff before giving up.
  let refreshed: TokenResponse | undefined;
  const attemptErrors: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      refreshed = await refreshAccessToken(connection.refresh_token);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attemptErrors.push(`attempt ${attempt}: ${msg}`);
      console.error(`Google Calendar token refresh failed (attempt ${attempt}/3):`, err);
      if (attempt < 3) await sleep(attempt * 500);
    }
  }
  if (!refreshed) {
    throw new Error(attemptErrors.join(" | "));
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

/**
 * Every calendar in Faith's Google account that she owns or can edit -- her
 * main calendar plus any extra ones (e.g. a separate "Business" calendar).
 * Read-only subscriptions like holidays or birthdays are skipped so they
 * don't block whole days. Falls back to just `fallbackId` if the list can't
 * be read.
 */
async function getOwnedCalendarIds(accessToken: string, fallbackId: string): Promise<string[]> {
  try {
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = (await res.json()) as { items?: Array<{ id: string; deleted?: boolean }> };
    const ids = (data.items ?? []).filter((c) => !c.deleted).map((c) => c.id);
    if (!ids.includes(fallbackId) && fallbackId !== "primary") ids.push(fallbackId);
    return ids.length > 0 ? ids.slice(0, 50) : [fallbackId];
  } catch (err) {
    console.error("Couldn't list Google calendars, checking only the main one:", err);
    return [fallbackId];
  }
}

/** Title Faith gives a Google Calendar event to open that time up for calls. */
export const CALL_TIMES_TITLE = "Call times";

function isCallTimesEvent(summary: string | undefined): boolean {
  return Boolean(summary && summary.toLowerCase().includes(CALL_TIMES_TITLE.toLowerCase()));
}

type GoogleEvent = {
  summary?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
};

async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      maxResults: "2500",
      fields: "nextPageToken,items(summary,status,transparency,start,end,attendees(self,responseStatus))",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Google events list failed for ${calendarId}: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return events;
}

/**
 * Reads Faith's calendars for the booking page. Events titled "Call times"
 * are the windows she's happy to take calls in; everything else she's
 * attending (and hasn't marked "Free") is busy. Done with a plain event list
 * rather than freeBusy, because freeBusy would count the "Call times" events
 * themselves as busy and swallow the very windows they open up.
 *
 * `allDayToUtc` turns an all-day event's "YYYY-MM-DD" into a real instant in
 * the business's time zone.
 */
export async function getCallWindowsAndBusy(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
  allDayToUtc: (date: string) => Date
): Promise<{ windows: BusyBlock[]; busy: BusyBlock[] }> {
  const calendarIds = await getOwnedCalendarIds(accessToken, calendarId);
  const perCalendar = await Promise.all(
    calendarIds.map((id) =>
      listEvents(accessToken, id, timeMin, timeMax).catch((err) => {
        // One unreadable calendar shouldn't hide every other one.
        console.error(err);
        return [] as GoogleEvent[];
      })
    )
  );

  const windows: BusyBlock[] = [];
  const busy: BusyBlock[] = [];
  for (const event of perCalendar.flat()) {
    if (event.status === "cancelled") continue;
    const startRaw = event.start?.dateTime ?? (event.start?.date ? allDayToUtc(event.start.date) : null);
    const endRaw = event.end?.dateTime ?? (event.end?.date ? allDayToUtc(event.end.date) : null);
    if (!startRaw || !endRaw) continue;
    const block = { start: new Date(startRaw), end: new Date(endRaw) };

    if (isCallTimesEvent(event.summary)) {
      windows.push(block);
      continue;
    }
    if (event.transparency === "transparent") continue; // marked "Free"
    if (event.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
    busy.push(block);
  }
  return { windows, busy };
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
  clientPhone?: string;
  eventType: string;
}): Promise<{ id: string; htmlLink: string }> {
  const { accessToken, calendarId, start, end, timeZone, clientName, clientEmail, clientPhone, eventType } =
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
        description: `Booked through the Perfect Pours & More consultation scheduler.\nClient email: ${clientEmail}${
          clientPhone ? `\nClient phone: ${clientPhone}` : ""
        }`,
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
