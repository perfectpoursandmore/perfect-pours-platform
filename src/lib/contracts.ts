/**
 * Fills a contract template's {{variable}} placeholders with real values.
 * Deliberately dumb (no conditionals/loops) — a contract template is legal
 * text, not a programming language, and predictable substitution is exactly
 * what you want to be able to trust before sending something for signature.
 */
export function renderContractBody(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match; // leave unknown placeholders visible, never blank them silently
  });
}
