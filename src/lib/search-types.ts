// Shared between the admin search API route and the GlobalSearch client
// component -- kept in its own file (no server-only imports) so the
// client component never risks bundling server code just to get this type.
export type SearchResult = {
  type: "client" | "lead" | "event";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};
