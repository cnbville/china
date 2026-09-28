// Runs INSIDE the product page (main world), so it can read 1688's own
// `window.gallery` like the bookmarklet does. Must stay self-contained — it's
// serialised by chrome.scripting.executeScript, so no imports or outer vars.
export function extractPage(): {
  v: 1;
  title: string;
  url: string;
  price: string;
  images: string[];
} {
  const seen: Record<string, 1> = {};
  const images: string[] = [];
  const norm = (u: string) => u.replace(/\.(jpg|jpeg|png|webp)[^/?]*(\?.*)?$/i, ".$1");
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    let u = raw.trim();
    if (u.indexOf("//") === 0) u = "https:" + u;
    if (!/^https?:/i.test(u)) return;
    u = norm(u);
    if (seen[u]) return;
    seen[u] = 1;
    images.push(u);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const G = (window as any).gallery;
  if (G && G.offerImgList && G.offerImgList.length) {
    for (const u of G.offerImgList) add(u);
  } else {
    add(document.querySelector('meta[property="og:image"]')?.getAttribute("content"));
    document.querySelectorAll("img").forEach((im) => {
      const s =
        im.getAttribute("src") || im.getAttribute("data-src") || im.getAttribute("data-lazy-src") || "";
      if (!/alicdn\.com|yupoo|vpimg|geilicdn/i.test(s)) return;
      const w = im.naturalWidth || im.width || 0;
      const h = im.naturalHeight || im.height || 0;
      if (w && h && w < 200 && h < 200) return;
      add(s);
    });
  }
  const ot = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
  const title = ((G && G.subject) || ot || document.title || "").trim();
  const pm = (document.body.innerText || "").match(/[¥￥]\s*([0-9]+(?:\.[0-9]+)?)/);
  return { v: 1, title, url: location.href, price: pm ? pm[1] : "", images };
}
