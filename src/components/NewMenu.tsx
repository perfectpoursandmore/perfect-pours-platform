"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "+ New" button that's on every admin screen (side bar on a computer,
 * top bar on a phone): one tap to start the things Faith does most.
 */
export function NewMenu({ items }: { items: { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="new-menu" ref={ref}>
      <button type="button" className="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        + New
      </button>
      {open && (
        <div className="new-menu-items">
          {items.map((it) => (
            <a key={it.href} href={it.href} onClick={() => setOpen(false)}>
              {it.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
