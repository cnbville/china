"use client";

import { REASONS } from "@/lib/constants";

// Fixed tag set, picked from a list, never free text (plan section 1).
export function ReasonPicker({
  values,
  onChange,
  required,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  required?: boolean;
}) {
  function toggle(reason: string) {
    if (values.includes(reason)) onChange(values.filter((r) => r !== reason));
    else onChange([...values, reason]);
  }

  return (
    <div>
      <label className="block text-meta text-muted">
        Reasons{required ? " (required when ranked)" : ""}
      </label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {REASONS.map((reason) => {
          const active = values.includes(reason);
          return (
            <button
              key={reason}
              type="button"
              onClick={() => toggle(reason)}
              className={
                "rounded-card border px-2.5 py-1 text-meta transition-colors " +
                (active
                  ? "border-accent bg-accent text-paper"
                  : "border-line bg-card text-muted hover:border-ink hover:text-ink")
              }
            >
              {reason}
            </button>
          );
        })}
      </div>
    </div>
  );
}
