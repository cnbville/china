import type { SupabaseClient } from "@supabase/supabase-js";

// The "import from a link" flow. A bookmarklet (installed from /import) scrapes a
// listing page you're viewing — title, source URL, a price guess, and the image
// URLs — and opens the add-item page with that payload in the URL hash. The page
// prefills the form and re-hosts the images through the `fetch-image` Edge
// Function (the browser can't read them cross-origin; see that function).
//
// It's deliberately "assisted capture, not magic import": whatever the
// bookmarklet gets lands in the normal form for you to fix and confirm.

export type ImportPayload = {
  v: 1;
  title?: string;
  url?: string; // the source link
  seller?: string;
  price?: string; // CNY, as typed text
  moq?: string;
  colors?: string[];
  sizes?: string[];
  images?: string[]; // remote image URLs to re-host
};

const MAX_IMPORT_IMAGES = 12;

/** Read an import payload out of the current URL hash, if the bookmarklet set one. */
export function readImportFromHash(): ImportPayload | null {
  if (typeof window === "undefined") return null;
  const m = window.location.hash.match(/[#&]import=([^&]+)/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    if (parsed && parsed.v === 1) return parsed as ImportPayload;
  } catch {
    /* malformed — ignore */
  }
  return null;
}

/** How many images (capped) the payload wants re-hosted. */
export function importImageUrls(p: ImportPayload): string[] {
  return (p.images ?? [])
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .slice(0, MAX_IMPORT_IMAGES);
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Re-host one remote image URL: fetch its bytes server-side via the Edge
 * Function (CORS-free) and wrap them in a File the add-item flow can upload like
 * any other photo. Returns null on any failure — a missed image isn't fatal.
 */
export async function fetchImportImage(
  supabase: SupabaseClient,
  url: string,
  index: number,
): Promise<File | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      mime: string;
      data: string;
    }>("fetch-image", { body: { url } });
    if (error || !data?.data) return null;
    const mime = data.mime?.startsWith("image/") ? data.mime : "image/jpeg";
    const bytes = base64ToBytes(data.data);
    // Cast: the lib's generic Uint8Array<ArrayBufferLike> isn't structurally a
    // BlobPart, though at runtime it always is.
    return new File(
      [bytes as unknown as BlobPart],
      `import-${index}.${extFromMime(mime)}`,
      { type: mime },
    );
  } catch {
    return null;
  }
}

/**
 * Build the bookmarklet source, with the add-item URL baked in. Kept as one
 * self-contained IIFE so it survives being stored as a `javascript:` bookmark.
 * Extraction is best-effort and never throws: it always at least captures the
 * page URL, its title, and og:image, then lands you in the form to confirm.
 */
export function buildBookmarklet(addItemUrl: string): string {
  // NOTE: keep this body ES5-ish and quote-safe — it's stringified into an href.
  const body = `(function(){try{
var A=${JSON.stringify(addItemUrl)};
function norm(u){try{return u.replace(/\\.(jpg|jpeg|png|webp)[^\\/?]*(\\?.*)?$/i,'.$1')}catch(e){return u}}
var seen={},imgs=[];
function add(u){if(!u)return;if(u.indexOf('//')===0)u='https:'+u;if(!/^https?:/i.test(u))return;u=norm(u);if(seen[u])return;seen[u]=1;imgs.push(u)}
var og=document.querySelector('meta[property="og:image"]');if(og)add(og.getAttribute('content'));
var n=document.querySelectorAll('img');
for(var i=0;i<n.length;i++){var s=n[i].getAttribute('src')||n[i].getAttribute('data-src')||n[i].getAttribute('data-lazy-src')||'';if(/alicdn\\.com|yupoo|vpimg|geilicdn/i.test(s))add(s)}
imgs=imgs.slice(0,12);
var ot=document.querySelector('meta[property="og:title"]');
var title=(ot&&ot.getAttribute('content'))||document.title||'';
var price='';var pm=(document.body.innerText||'').match(/[\\u00a5\\uffe5]\\s*([0-9]+(?:\\.[0-9]+)?)/);if(pm)price=pm[1];
var payload={v:1,title:(title||'').trim(),url:location.href,price:price,images:imgs};
window.open(A+'#import='+encodeURIComponent(JSON.stringify(payload)),'_blank');
}catch(e){alert('Import failed: '+e)}})();`;
  return "javascript:" + body.replace(/\n/g, "");
}
