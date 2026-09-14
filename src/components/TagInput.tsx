"use client";

import { useState } from "react";

// Small tag editor for colors / sizes arrays. Type and press Enter or comma to
// add; click a tag's × to remove.
export function TagInput({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...values];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div>
      <label className="block text-meta text-muted">{label}</label>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-card border border-line bg-card px-2 py-1.5 focus-within:border-accent">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-card border border-line px-2 py-0.5 text-meta"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-muted hover:text-ink"
              aria-label={`Remove ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && draft === "" && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="min-w-[6rem] flex-1 bg-transparent text-body outline-none"
        />
      </div>
    </div>
  );
}
