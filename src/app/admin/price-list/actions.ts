"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/roles";
import { EVENT_TYPE_LABELS } from "@/lib/labels";
import { type AddOn, type PackageTier, type PriceList, DEFAULT_PRICE_LIST, getPriceList } from "@/lib/price-list";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lines = (f: FormData, k: string) =>
  text(f, k)
    .split(/\r?\n/)
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
const num = (f: FormData, k: string) => {
  const raw = text(f, k).replace(/[$,%\s]/g, "");
  if (raw === "") return NaN;
  return Number(raw);
};

function fail(message: string): never {
  redirect(`/admin/price-list?error=${encodeURIComponent(message)}`);
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "addon"
  );
}

export async function savePriceList(formData: FormData) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/login");
  const supabase = createClient();
  const current = await getPriceList(supabase);

  // --- Rates and rules ---
  const bartender = num(formData, "bartenderRate");
  const server = num(formData, "serverRate");
  const gratuityPct = num(formData, "gratuityPct");
  const minHours = num(formData, "minHours");
  const packageHours = num(formData, "packageHours");
  const overGuests = num(formData, "customQuoteOverGuests");
  for (const [label, v] of [
    ["Bartender rate", bartender],
    ["Server rate", server],
    ["Gratuity", gratuityPct],
    ["Minimum hours", minHours],
    ["Package hours", packageHours],
    ["Custom quote guest count", overGuests],
  ] as const) {
    if (!Number.isFinite(v) || v < 0) fail(`${label} needs to be a number.`);
  }

  // --- Package tiers (blank "up to" = row removed) ---
  const upTos = formData.getAll("tierUpTo").map(String);
  const prices = formData.getAll("tierPrice").map(String);
  const barts = formData.getAll("tierBartenders").map(String);
  const tiers: PackageTier[] = [];
  upTos.forEach((u, i) => {
    const upTo = Number(u.replace(/[,\s]/g, ""));
    if (!u.trim()) return;
    const price = Number((prices[i] ?? "").replace(/[$,\s]/g, ""));
    const bartenders = Number(barts[i] || 1);
    if (!Number.isFinite(upTo) || upTo <= 0 || !Number.isFinite(price) || price < 0) {
      fail(`Check package tier ${i + 1}: guest count and price need to be numbers.`);
    }
    tiers.push({ upTo, price, bartenders: bartenders > 0 ? bartenders : 1 });
  });
  if (tiers.length === 0) fail("The package needs at least one price tier.");
  tiers.sort((a, b) => a.upTo - b.upTo);

  // --- Add-ons (blank = removed; new ones get a stable id from their name) ---
  const addonValues = formData.getAll("addonValue").map(String);
  const addonLabels = formData.getAll("addonLabel").map((l) => String(l).trim());
  const addOns: AddOn[] = [];
  const used = new Set<string>();
  addonLabels.forEach((label, i) => {
    if (!label) return;
    let value = addonValues[i] || slug(label);
    if (used.has(value)) {
      let n = 2;
      while (used.has(`${value}_${n}`)) n++;
      value = `${value}_${n}`;
    }
    used.add(value);
    addOns.push({ value, label });
  });

  const eventTypes = formData
    .getAll("customQuoteEventTypes")
    .map(String)
    .filter((t) => t in EVENT_TYPE_LABELS);

  const pl: PriceList = {
    rates: { bartender, server },
    gratuityRate: gratuityPct / 100,
    minHours,
    packageHours,
    customQuoteOverGuests: overGuests,
    customQuoteEventTypes: eventTypes,
    package: {
      name: text(formData, "packageName") || current.package.name,
      tiers,
      includes: lines(formData, "packageIncludes"),
      fullBarNote: text(formData, "fullBarNote"),
      customize: lines(formData, "customize"),
    },
    bartenderOnly: {
      name: text(formData, "bartenderName") || DEFAULT_PRICE_LIST.bartenderOnly.name,
      description: text(formData, "bartenderDescription"),
      note: text(formData, "bartenderNote"),
    },
    server: {
      name: text(formData, "serverName") || DEFAULT_PRICE_LIST.server.name,
      description: text(formData, "serverDescription"),
      note: text(formData, "serverNote"),
    },
    addOns,
    timingPolicies: lines(formData, "timingPolicies"),
  };

  const { error } = await supabase
    .from("price_list")
    .upsert({ id: true, data: pl, updated_at: new Date().toISOString(), updated_by: user.id });
  if (error) {
    console.error("savePriceList:", error);
    fail(
      error.code === "42P01" || /price_list/.test(error.message)
        ? "Couldn't save: the price_list table isn't set up yet. Run supabase/migrations/0020_price_list.sql in the Supabase SQL Editor first."
        : `Couldn't save: ${error.message}`
    );
  }

  revalidatePath("/admin/price-list");
  revalidatePath("/admin");
  redirect("/admin/price-list?saved=1");
}
