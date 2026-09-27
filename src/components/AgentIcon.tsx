"use client";

import { useState } from "react";

// An agent's favicon in a small white tile (falls back to its first letter).
export function AgentIcon({ host, name, size = "md" }: { host: string; name: string; size?: "sm" | "md" | "lg" }) {
  const [ok, setOk] = useState(true);
  const box = size === "lg" ? "h-12 w-12 rounded-[12px]" : size === "sm" ? "h-5 w-5 rounded-[5px]" : "h-8 w-8 rounded-[8px]";
  const img = size === "lg" ? "h-7 w-7" : size === "sm" ? "h-3.5 w-3.5" : "h-[18px] w-[18px]";
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden border border-white/10 bg-white ${box}`}>
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          className={`${img} object-contain`}
          onError={() => setOk(false)}
          loading="lazy"
        />
      ) : (
        <span
          className={
            "font-semibold text-paper " +
            (size === "lg" ? "text-xl" : size === "sm" ? "text-[10px]" : "text-sm")
          }
        >
          {name[0]}
        </span>
      )}
    </span>
  );
}
