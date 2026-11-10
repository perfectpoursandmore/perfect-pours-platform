import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addInboxItem } from "@/lib/inbox";

// Where Faith's iPhone Shortcut ("Send to Perfect Pours") posts a client
// text she copied or shared. Not behind a login (the Shortcut can't log in),
// so it's guarded by the secret key from Settings > Text inbox instead.
//
// Body (JSON): { "token": "...", "text": "...", "from": "optional name" }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const text = typeof body?.text === "string" ? body.text : "";
  const from = typeof body?.from === "string" ? body.from : "";

  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("inbox_settings").select("token").eq("id", true).single();

  if (!token || !settings?.token || token !== settings.token) {
    return NextResponse.json({ ok: false, message: "That key doesn't match. Re-copy it from Settings → Text inbox." }, { status: 401 });
  }

  const { error } = await addInboxItem(supabase, text, from);
  if (error) {
    return NextResponse.json({ ok: false, message: error }, { status: 400 });
  }
  // The Shortcut shows this message as its confirmation.
  return NextResponse.json({ ok: true, message: "Added to your Perfect Pours inbox ✓" });
}
