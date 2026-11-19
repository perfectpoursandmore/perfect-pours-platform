import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Where Faith's "Add to my to-do" iPhone Shortcut posts (by Siri or a tap).
// Same secret key as the text inbox (Settings > iPhone buttons), since the
// Shortcut can't log in.
//
// Body (JSON): { "token": "...", "text": "Call the venue about parking" }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 500) : "";

  const supabase = createAdminClient();
  const { data: settings } = await supabase.from("inbox_settings").select("token").eq("id", true).single();

  if (!token || !settings?.token || token !== settings.token) {
    return NextResponse.json({ ok: false, message: "That key doesn't match. Re-copy it from Settings → iPhone buttons." }, { status: 401 });
  }
  if (!text) {
    return NextResponse.json({ ok: false, message: "Nothing to add. Say or type the to-do." }, { status: 400 });
  }

  const { error } = await supabase.from("todos").insert({ list_type: "daily", item: text });
  if (error) {
    return NextResponse.json({ ok: false, message: "Couldn't add it. Try again in a minute." }, { status: 500 });
  }
  // The Shortcut shows this as its confirmation.
  return NextResponse.json({ ok: true, message: "Added to your to-do ✓" });
}
