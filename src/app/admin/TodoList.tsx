"use client";

import { useRef, useState, useTransition } from "react";
import { addTodoItem, clearDoneTodos, deleteTodo, editTodoText, setTodoColor, setTodoDone } from "./actions";
import { TODO_COLORS, TODO_COLOR_STYLES, type TodoColor } from "@/lib/todo-colors";

export type TodoItem = {
  id: string;
  item: string;
  is_done: boolean;
  color: TodoColor | null;
  created_at: string;
};

/**
 * One running list. Type, press Enter, keep typing: the box stays ready for
 * the next line. Tap the circle to check an item off (it gets crossed out
 * and stays where it is). Tap the little color dot to color it, only if
 * you want to. Everything saves on its own; no Save buttons.
 */
export function TodoList({ initialItems, colorsReady }: { initialItems: TodoItem[]; colorsReady: boolean }) {
  const [items, setItems] = useState<TodoItem[]>(initialItems);
  const [text, setText] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [popped, setPopped] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const value = text.trim();
    if (!value) return;
    const tempId = `temp-${Date.now()}`;
    setItems((prev) => [...prev, { id: tempId, item: value, is_done: false, color: null, created_at: new Date().toISOString() }]);
    setText("");
    inputRef.current?.focus();
    startTransition(async () => {
      const saved = await addTodoItem(value);
      setItems((prev) =>
        saved ? prev.map((t) => (t.id === tempId ? { ...t, id: saved.id, created_at: saved.created_at } : t)) : prev.filter((t) => t.id !== tempId)
      );
    });
  }

  function toggle(t: TodoItem) {
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_done: !x.is_done } : x)));
    setPopped(t.is_done ? null : t.id); // a little "pop" when it gets checked
    startTransition(() => setTodoDone(t.id, !t.is_done));
  }

  function color(t: TodoItem, c: TodoColor | null) {
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, color: c } : x)));
    setPickerFor(null);
    startTransition(() => setTodoColor(t.id, c));
  }

  function remove(t: TodoItem) {
    setItems((prev) => prev.filter((x) => x.id !== t.id));
    startTransition(() => deleteTodo(t.id));
  }

  function saveEdit(t: TodoItem, value: string) {
    setEditing(null);
    const v = value.trim();
    if (!v || v === t.item) return;
    setItems((prev) => prev.map((x) => (x.id === t.id ? { ...x, item: v } : x)));
    startTransition(() => editTodoText(t.id, v));
  }

  function clearDone() {
    setItems((prev) => prev.filter((x) => !x.is_done));
    startTransition(() => clearDoneTodos());
  }

  const doneCount = items.filter((t) => t.is_done).length;
  const open = items.filter((t) => !t.is_done && !t.id.startsWith("temp-"));
  // "Just one thing": the top unchecked item (red ones first), skipping any
  // she said "not now" to. When everything's been skipped, start over.
  const ordered = [...open.filter((t) => t.color === "red"), ...open.filter((t) => t.color !== "red")];
  const focusItem = ordered.find((t) => !skipped.includes(t.id)) ?? null;

  return (
    <div id="todo" className="card" style={{ display: "grid", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>To do</h2>
        {doneCount > 0 && <span className="done-count">🎉 {doneCount} done</span>}
        {open.length > 0 && (
          <button
            type="button"
            className="button-secondary"
            style={{ marginLeft: "auto", padding: "0.35rem 0.85rem", fontSize: "0.85rem" }}
            onClick={() => {
              setSkipped([]);
              setFocus(true);
            }}
          >
            Just one thing
          </button>
        )}
      </div>

      {focus && (
        <div className="focus-overlay" role="dialog" aria-label="Just one thing">
          {focusItem ? (
            <>
              <div className="muted" style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "0.85rem" }}>
                Just this one
              </div>
              <div className="focus-item">{focusItem.item}</div>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
                <button type="button" className="button" style={{ fontSize: "1.05rem", padding: "0.8rem 1.6rem" }} onClick={() => toggle(focusItem)}>
                  Done ✓
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  style={{ fontSize: "1.05rem", padding: "0.8rem 1.6rem" }}
                  onClick={() => setSkipped((s) => (ordered.every((t) => t.id === focusItem.id || s.includes(t.id)) ? [] : [...s, focusItem.id]))}
                >
                  Not now
                </button>
              </div>
            </>
          ) : (
            <div className="focus-item">All done. 🎉</div>
          )}
          <button type="button" className="link-button" onClick={() => setFocus(false)}>
            Back to my list
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="todo-list">
          {items.map((t) => {
            const tint = t.color ? TODO_COLOR_STYLES[t.color] : null;
            const temp = t.id.startsWith("temp-");
            return (
              <li
                key={t.id}
                className="todo-row"
                style={{
                  background: tint ? tint.tint : undefined,
                  borderLeft: `4px solid ${tint ? tint.dot : "transparent"}`,
                }}
              >
                <button
                  type="button"
                  className={`todo-check${t.is_done ? " done" : ""}${popped === t.id ? " pop" : ""}`}
                  aria-label={t.is_done ? "Mark not done" : "Mark done"}
                  onClick={() => toggle(t)}
                  disabled={temp}
                >
                  {t.is_done ? "✓" : ""}
                </button>

                {editing === t.id ? (
                  <input
                    autoFocus
                    defaultValue={t.item}
                    className="todo-edit"
                    onBlur={(e) => saveEdit(t, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                ) : (
                  <span
                    className="todo-text"
                    onClick={() => !temp && setEditing(t.id)}
                    title="Click to edit"
                    style={{
                      textDecoration: t.is_done ? "line-through" : "none",
                      color: t.is_done ? "var(--color-muted)" : "inherit",
                    }}
                  >
                    {t.item}
                  </span>
                )}

                {colorsReady && !temp && (
                  <span style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="todo-color-button"
                      aria-label="Color"
                      title="Color (optional)"
                      onClick={() => setPickerFor(pickerFor === t.id ? null : t.id)}
                      style={{ background: tint ? tint.dot : "#fff" }}
                    />
                    {pickerFor === t.id && (
                      <span className="todo-color-picker">
                        {TODO_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={TODO_COLOR_STYLES[c].name}
                            title={TODO_COLOR_STYLES[c].name}
                            onClick={() => color(t, c)}
                            style={{ background: TODO_COLOR_STYLES[c].dot }}
                          />
                        ))}
                        <button type="button" aria-label="No color" title="No color" onClick={() => color(t, null)} className="none">
                          ✕
                        </button>
                      </span>
                    )}
                  </span>
                )}

                <button type="button" className="todo-delete" aria-label="Delete" title="Delete" onClick={() => remove(t)} disabled={temp}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        enterKeyHint="enter"
        placeholder={items.length === 0 ? "Type something and press Enter" : "Add another… (press Enter)"}
        className="todo-input"
      />

      {doneCount > 0 && (
        <div>
          <button type="button" className="link-button" onClick={clearDone}>
            Clear {doneCount} checked {doneCount === 1 ? "item" : "items"}
          </button>
        </div>
      )}
    </div>
  );
}
