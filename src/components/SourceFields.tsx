"use client";

import { TagInput } from "./TagInput";
import { ReasonPicker } from "./ReasonPicker";
import type { SourceDraft } from "@/lib/source";

// Shared source editor used by the add-item flow (first source) and the item
// view (add / edit a source). Adding a source is one action — no separate "add
// additional link" flow (plan section 5).
export function SourceFields({
  draft,
  onChange,
}: {
  draft: SourceDraft;
  onChange: (next: SourceDraft) => void;
}) {
  const set = <K extends keyof SourceDraft>(key: K, value: SourceDraft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className="space-y-4">
      <Field label="Listing URL" required>
        <input
          type="url"
          inputMode="url"
          required
          value={draft.url}
          onChange={(e) => set("url", e.target.value)}
          placeholder="https://…"
          className="input"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Seller name">
          <input
            value={draft.seller_name}
            onChange={(e) => set("seller_name", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Price (¥ per unit, CNY)">
          <input
            inputMode="decimal"
            value={draft.price}
            onChange={(e) => set("price", e.target.value)}
            className="input tnum"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="MOQ">
          <input
            inputMode="numeric"
            value={draft.moq}
            onChange={(e) => set("moq", e.target.value)}
            className="input tnum"
          />
        </Field>
        <Field label="Rank (1 = preferred)">
          <input
            inputMode="numeric"
            value={draft.rank}
            onChange={(e) => set("rank", e.target.value)}
            className="input tnum"
          />
        </Field>
      </div>

      <TagInput
        label="Colors this link offers"
        values={draft.colors}
        onChange={(v) => set("colors", v)}
        placeholder="black, ecru, navy…"
      />
      <TagInput
        label="Sizes"
        values={draft.sizes}
        onChange={(v) => set("sizes", v)}
        placeholder="S, M, L…"
      />

      <ReasonPicker
        values={draft.reasons}
        onChange={(v) => set("reasons", v)}
        required={draft.rank.trim() !== ""}
      />

      <Field label="Notes">
        <textarea
          rows={2}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="input"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-meta text-muted">
        {label}
        {required ? " *" : ""}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
