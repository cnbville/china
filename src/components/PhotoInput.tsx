"use client";

import { useEffect, useRef, useState } from "react";
import { imageFromDataTransfer } from "@/lib/image";

// Photo first, since that's the anchor (plan section 5). Accepts paste (primary
// path), drag & drop, file picker, and the phone camera roll — and now several
// photos at once. The first photo is the cover (what the grid shows).
export function PhotoInput({
  files,
  onFiles,
}: {
  files: File[];
  onFiles: (f: File[]) => void;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Object URL previews, revoked when the file list changes.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(incoming: File[]) {
    const imgs = incoming.filter((f) => f.type.startsWith("image/"));
    if (imgs.length) onFiles([...files, ...imgs]);
  }

  function removeAt(i: number) {
    onFiles(files.filter((_, idx) => idx !== i));
  }

  function makeCover(i: number) {
    if (i === 0) return;
    const next = [...files];
    const [picked] = next.splice(i, 1);
    onFiles([picked, ...next]);
  }

  // Paste anywhere on the page — most images are copied straight from a listing.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const img = imageFromDataTransfer(e.clipboardData);
      if (img) {
        e.preventDefault();
        onFiles([...files, img]);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles, files]);

  const empty = files.length === 0;

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
        addFiles(Array.from(e.dataTransfer.files));
      }}
      className={
        "rounded-card border border-dashed p-3 transition-colors " +
        (dragging ? "border-accent bg-surface2/40" : "border-line")
      }
    >
      {empty ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-40 w-full items-center justify-center px-6 text-center text-meta text-muted"
        >
          Paste an image, drop some here, or click to choose. The first is the
          cover.
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((_, i) => (
            <div
              key={i}
              className="group relative aspect-[4/5] overflow-hidden rounded-[8px] border border-line bg-[#05060a]"
            >
              {previews[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previews[i]}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded-pill bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Cover
                </span>
              )}
              <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
                {i !== 0 ? (
                  <button
                    type="button"
                    onClick={() => makeCover(i)}
                    title="Make cover"
                    className="rounded-pill bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur hover:bg-black/80"
                  >
                    Cover
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  title="Remove"
                  className="rounded-full bg-black/60 p-1 text-white backdrop-blur hover:bg-accent"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[4/5] items-center justify-center rounded-[8px] border border-dashed border-line text-2xl text-muted transition-colors hover:border-accent hover:text-ink"
            title="Add more photos"
          >
            +
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
