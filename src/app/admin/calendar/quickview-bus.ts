import type { MouseEvent } from "react";

// A tiny pub/sub so any event link on the calendar (month grid, week grid,
// agenda table) can open the one shared quick-view modal without threading
// React state/context through three different grid components.

export const QUICKVIEW_OPEN_EVENT = "admin-calendar:open-quickview";

export function openEventQuickView(eventId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ eventId: string }>(QUICKVIEW_OPEN_EVENT, { detail: { eventId } }));
}

// Left-click with no modifier keys and no middle-click -- anything else
// (cmd/ctrl-click, shift-click, middle-click) should fall through to the
// browser's normal "open in new tab" handling on the underlying <a href>.
export function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
