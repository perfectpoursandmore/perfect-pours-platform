// The event-detail options shared by the public inquiry form and the admin
// event page. Edit the labels here and both places update. The `value`s
// are what's stored in the database, so leave those alone once in use.

export type Option = { value: string; label: string; hint?: string };

/** What the client is interested in. Starter list; edit freely. */
export const SERVICES: Option[] = [
  {
    value: "signature_cocktails", // = the Perfect Pours Package (value kept for pricing)
    label: "Perfect Pours Package",
    hint: "All the things: 2 signature cocktails & full bar service, custom menu, disposables, shopping list, bar rental",
  },
  { value: "bartender", label: "Bartender only", hint: "You provide the alcohol, mixers, ice and cups" },
  {
    value: "server",
    label: "Server",
    hint: "The cheat code to hosting stress-free… Food setup, clearing plates, cleanup and more, all handled by us",
  },
  { value: "mocktails", label: "Mocktails, Wellness Bar, Coffee Bar" },
  { value: "interactive", label: "Interactive event: Beer/Wine Tasting, Mixology Class, etc." },
  { value: "setup_decor", label: "Event set up, decor, and design services" },
  { value: "not_sure", label: "Not sure yet, help me decide" },
];

/** How food is served. Drives how many servers an event needs. */
export const SERVICE_STYLES: Option[] = [
  { value: "no_food", label: "No food, drinks only" },
  { value: "appetizers", label: "Appetizers only (passed or stationary)" },
  { value: "buffet", label: "Buffet" },
  { value: "family_style", label: "Family style" },
  { value: "plated", label: "Plated sit-down dinner" },
  { value: "not_sure", label: "Not sure yet" },
];

export const DISHWARE: Option[] = [
  { value: "disposable", label: "Disposable plates, cups, and cutlery" },
  { value: "real", label: "Real dishes, glassware, and cutlery" },
  { value: "not_sure", label: "Not sure yet" },
];

/** Extra jobs that add to a server's workload. */
export const EXTRA_HELP: Option[] = [
  { value: "passed_apps", label: "Passing appetizers" },
  { value: "clearing_plates", label: "Clearing guests' plates" },
  { value: "cake_cutting", label: "Cutting and serving cake" },
  { value: "leftovers", label: "Wrapping leftovers" },
  { value: "trash", label: "Trash and final cleanup" },
];

export function labelFor(options: Option[], value: string | null | undefined): string {
  if (!value) return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

export function labelsFor(options: Option[], values: string[] | null | undefined): string {
  if (!values || values.length === 0) return "—";
  return values.map((v) => labelFor(options, v)).join(", ");
}

/** Keeps only known values, so a tampered form can't store junk. */
export function cleanValues(options: Option[], values: unknown[]): string[] {
  const allowed = new Set(options.map((o) => o.value));
  return Array.from(new Set(values.map(String).filter((v) => allowed.has(v))));
}

export function cleanValue(options: Option[], value: unknown): string | null {
  const v = String(value ?? "");
  return options.some((o) => o.value === v) ? v : null;
}
