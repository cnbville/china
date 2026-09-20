// Server-side image proxy for the "import from a link" flow.
//
// The catalog is a static site with no server of its own, and product images
// live on CDNs the browser can't read cross-origin (CORS / tainted canvas). So
// the bookmarklet can grab image *URLs* off a listing page, but not their bytes.
// This function fetches an image server-side — where CORS doesn't apply — and
// hands the bytes back (base64 in JSON, to dodge any content-type sniffing in
// the client) so the app can re-host it as a normal upload.
//
// It is NOT an open proxy. Two guards keep it from being abused as an SSRF
// pivot: Supabase's JWT check (verify_jwt) limits it to the signed-in user, and
// the host allowlist below limits fetches to known garment-CDN hosts, so it
// can't be pointed at internal addresses.

// Base64-encode bytes without a dependency, chunked so a big image doesn't blow
// the argument limit of String.fromCharCode / the call stack.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Only these host suffixes may be fetched. 1688 and Taobao both serve images
// from Alibaba's alicdn CDN; Weidian and Yupoo have their own. Extend as needed.
const ALLOWED_SUFFIXES = [
  ".alicdn.com",
  ".1688.com",
  ".taobao.com",
  ".taobaocdn.com",
  ".tbcdn.cn",
  ".weidian.com",
  ".geilicdn.com",
  ".vpimg2.com",
  ".vpimg3.com",
  ".vpimg4.com",
  ".yupoo.com",
];

const MAX_BYTES = 15 * 1024 * 1024;

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_SUFFIXES.some((s) => h === s.slice(1) || h.endsWith(s));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let url: unknown;
  try {
    ({ url } = await req.json());
  } catch {
    return json({ error: "Body must be JSON { url }" }, 400);
  }
  if (typeof url !== "string" || !url) return json({ error: "Missing url" }, 400);

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return json({ error: "Invalid url" }, 400);
  }
  if (target.protocol !== "https:") {
    return json({ error: "Only https urls are allowed" }, 400);
  }
  if (!hostAllowed(target.hostname)) {
    return json({ error: `Host not allowed: ${target.hostname}` }, 403);
  }

  // A browser UA + a same-host referer satisfies the CDNs' hotlink checks.
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: `https://${target.hostname}/`,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
  } catch (e) {
    return json({ error: `Fetch failed: ${e}` }, 502);
  }
  if (!upstream.ok) return json({ error: `Upstream ${upstream.status}` }, 502);

  const mime = (upstream.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!mime.startsWith("image/")) {
    return json({ error: `Not an image (${mime || "unknown"})` }, 415);
  }
  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return json({ error: "Image too large" }, 413);

  return json({ mime, data: toBase64(new Uint8Array(buf)) });
});
