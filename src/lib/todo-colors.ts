// The optional colors on the Today screen's To do list. No fixed meaning:
// Faith decides what each one stands for ("next week", "less important").
export const TODO_COLORS = ["red", "yellow", "green", "blue"] as const;
export type TodoColor = (typeof TODO_COLORS)[number];

/** Dot color, and the soft background tint a colored item gets. */
export const TODO_COLOR_STYLES: Record<TodoColor, { dot: string; tint: string; name: string }> = {
  red: { dot: "#e5484d", tint: "#fdecec", name: "Red" },
  yellow: { dot: "#f1b400", tint: "#fff7d6", name: "Yellow" },
  green: { dot: "#30a46c", tint: "#e6f6ed", name: "Green" },
  blue: { dot: "#3e7bfa", tint: "#e8f0ff", name: "Blue" },
};
