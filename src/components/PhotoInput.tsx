"use client";

import { useEffect, useRef, useState } from "react";
import { imageFromDataTransfer } from "@/lib/image";

// Photo first, since that's the anchor (plan section 5). Accepts paste (primary
// path), drag & drop, file picker, and the phone camera roll — and now several
// photos at once. The first photo is the cover (what the grid shows).
//
// "Keep only N": after an import drops 30 photos in, pick the few you want
// (tap order = photo order, first pick = cover) and the rest go in one click.
// The page bumps `pickRequest` to open it automatically after a big import.

const KEEP_KEY = "photo-keep-count";

export function PhotoInput({
  files,
  onFiles,
  pickRequest = 0,
}: {
  files: File[];
  onFiles: (f: File[]) => void;
  pickRequest?: number;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [keep, setKeep] = useState(3);

  // Remember how many you like to keep.
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(KEEP_KEY));
      if (n >= 1 && n <= 20) setKeep(n);
    } catch {
      /* ignore */
    }
  }, []);
  function changeKeep(n: number) {
    const v = Math.max(1, Math.min(20, n));
    setKeep(v);
    setPicked((p) => p.slice(0, v));
    try {
      localStorage.setItem(KEEP_KEY, String(v));
    } catch {
      /* ignore */
    }
  }

  function startPicking() {
    setPicked([]);
    setPicking(true);
  }
  // Opened by the page (e.g. right after an import).
  useEffect(() => {
    if (pickRequest > 0) startPicking();
  }, [pickRequest]);
  // A changed photo list invalidates the picks.
  useEffect(() => {
    setPicked([]);
    if (files.length <= 1) setPicking(false);
  }, [files]);

  function togglePick(i: number) {
    setPicked((p) =>
      p.includes(i)
        ? p.filter((x) => x !== i)
        : p.length >= keep
          ? p
          : [...p, i],
    );
  }
  function applyPicks() {
    if (!picked.length) return;
    onFiles(picked.map((i) => files[i]));
    setPicking(false);
  }
  // Enter keeps · Esc cancels, while picking.
  useEffect(() => {
    if (!picking) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") setPicking(false);
      if (e.key === "Enter" && picked.length) {
        e.preventDefault();
        applyPicks();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
        <>
          {picking ? (
            <div className="sticky top-16 z-10 -mx-1 mb-3 rounded-card border border-accent/40 bg-paper/90 px-3 py-2.5 shadow-glow backdrop-blur">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="flex items-center gap-2 text-body text-ink">
                  Select
                  <span className="inline-flex items-center rounded-pill border border-line bg-surface2/70">
                    <button
                      type="button"
                      onClick={() => changeKeep(keep - 1)}
                      className="px-2 py-0.5 text-muted hover:text-ink"
                      aria-label="Fewer"
                    >
                      −
                    </button>
                    <span className="min-w-[1.25rem] text-center tnum">
                      {keep}
                    </span>
                    <button
                      type="button"
                      onClick={() => changeKeep(keep + 1)}
                      className="px-2 py-0.5 text-muted hover:text-ink"
                      aria-label="More"
                    >
                      +
                    </button>
                  </span>
                  to keep
                </div>
                <span className="text-meta text-muted tnum">
                  {picked.length}/{Math.min(keep, files.length)} picked · first
                  pick is the cover
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPicking(false)}
                    className="text-meta text-muted hover:text-ink"
                  >
                    Keep all
                  </button>
                  <button
                    type="button"
                    onClick={applyPicks}
                    disabled={!picked.length}
                    className={
                      "btn-accent px-3 py-1.5 text-meta disabled:opacity-40 " +
                      (picked.length >= Math.min(keep, files.length)
                        ? "animate-pop"
                        : "")
                    }
                  >
                    Keep {picked.length || keep}
                    {files.length - (picked.length || keep) > 0 &&
                      ` · delete ${files.length - (picked.length || keep)}`}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            files.length > 3 && (
              <div className="mb-3 flex items-center justify-between gap-3 text-meta">
                <span className="text-muted tnum">{files.length} photos</span>
                <button
                  type="button"
                  onClick={startPicking}
                  className="text-accentSoft hover:underline"
                >
                  Keep only {keep}…
                </button>
              </div>
            )
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {files.map((_, i) => {
              const n = picked.indexOf(i);
              return picking ? (
                <button
                  type="button"
                  key={i}
                  onClick={() => togglePick(i)}
                  className={
                    "relative aspect-[4/5] overflow-hidden rounded-[8px] border bg-[#05060a] transition-all " +
                    (n >= 0
                      ? "border-accent ring-2 ring-accent"
                      : picked.length >= keep
                        ? "border-line opacity-35"
                        : "border-line opacity-75 hover:opacity-100")
                  }
                >
                  {previews[i] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previews[i]}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  <span
                    className={
                      "absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold " +
                      (n >= 0
                        ? "animate-pop border-accent bg-accent text-white"
                        : "border-white/70 bg-black/40 text-transparent")
                    }
                  >
                    {n >= 0 ? n + 1 : ""}
                  </span>
                  {n === 0 && (
                    <span className="absolute left-1 top-1 rounded-pill bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Cover
                    </span>
                  )}
                </button>
              ) : (
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
              );
            })}

            {!picking && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-[4/5] items-center justify-center rounded-[8px] border border-dashed border-line text-2xl text-muted transition-colors hover:border-accent hover:text-ink"
                title="Add more photos"
              >
                +
              </button>
            )}
          </div>
        </>
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
