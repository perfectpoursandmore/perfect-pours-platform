"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "@/lib/search-types";

const TYPE_LABELS: Record<SearchResult["type"], string> = {
  client: "Client",
  lead: "Lead",
  event: "Event",
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={containerRef} style={{ position: "relative", maxWidth: 420, marginBottom: "1.5rem" }}>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Search clients, leads, events…"
        aria-label="Search clients, leads, and events"
      />

      {showDropdown && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 0.4rem)",
            left: 0,
            right: 0,
            zIndex: 20,
            padding: "0.5rem",
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          {loading && results.length === 0 && (
            <div style={{ padding: "0.6rem 0.7rem", color: "var(--color-muted)", fontSize: "0.9rem" }}>
              Searching…
            </div>
          )}

          {!loading && results.length === 0 && (
            <div style={{ padding: "0.6rem 0.7rem", color: "var(--color-muted)", fontSize: "0.9rem" }}>
              No matches for &quot;{query.trim()}&quot;.
            </div>
          )}

          {results.map((r) => (
            <a
              key={`${r.type}-${r.id}`}
              href={r.href}
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "0.6rem 0.7rem",
                borderRadius: 8,
                color: "var(--color-text)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
                <span style={{ fontWeight: 500 }}>{r.title}</span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 999,
                    padding: "0.05rem 0.5rem",
                    whiteSpace: "nowrap",
                    height: "fit-content",
                  }}
                >
                  {TYPE_LABELS[r.type]}
                </span>
              </div>
              {r.subtitle && (
                <div style={{ fontSize: "0.85rem", color: "var(--color-muted)", marginTop: "0.15rem" }}>
                  {r.subtitle}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
