// Invite an admin, staff, or client login by email.
//
// Usage:
//   node scripts/invite-user.mjs --email faith@perfectpoursandmore.com --role admin --name "Faith"
//
// Requires SUPABASE_SERVICE_ROLE_KEY (Project Settings -> API -> service_role
// in your Supabase dashboard) and NEXT_PUBLIC_SUPABASE_URL in your environment
// or a .env.local file. The service role key can create logins and bypasses
// Row Level Security entirely — never expose it in the app, only run this
// script from your own machine.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return args;
}

loadDotEnvLocal();
const { email, role, name } = parseArgs();

if (!email || !role || !["admin", "staff", "client"].includes(role)) {
  console.error(
    'Usage: node scripts/invite-user.mjs --email someone@example.com --role admin|staff|client [--name "Full Name"]'
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in .env.local)."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
  data: { role, full_name: name ?? null },
});

if (error) {
  console.error("Failed to invite user:", error.message);
  process.exit(1);
}

console.log(`Invited ${email} as "${role}". They'll get an email to set their password.`);
console.log("User id:", data.user.id);
