"use client";

import { useEffect, useRef, useState } from "react";
import { imageFromDataTransfer } from "@/lib/image";

// Photo first, since that's the anchor (plan section 5). Accepts paste (primary
// path), drag & drop, file picker, and the phone camera roll.
export function PhotoInput({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URL preview, revoked when the file changes.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Paste anywhere on the page — most images are copied straight from a listing.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const img = imageFromDataTransfer(e.clipboardData);
      if (img) {
        e.preventDefault();
        onFile(img);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const img = imageFromDataTransfer(e.dataTransfer);
        if (img) onFile(img);
      }}
      className={
        "photo-frame relative flex items-center justify-center rounded-card border border-dashed " +
        (dragging ? "border-accent" : "border-line")
      }
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Selected garment" />
      ) : (
        <div className="px-6 text-center text-meta text-muted">
          Paste an image, drop one here, or pick a file.
        </div>
      )}

      <div className="absolute bottom-2 right-2 flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-card border border-line bg-card/90 px-2.5 py-1 text-meta backdrop-blur hover:border-ink"
        >
          {file ? "Replace" : "Choose"}
        </button>
        {file && (
          <button
            type="button"
            onClick={() => onFile(null)}
            className="rounded-card border border-line bg-card/90 px-2.5 py-1 text-meta backdrop-blur hover:border-ink"
          >
            Clear
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
