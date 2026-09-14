/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Static export so the whole app is plain files GitHub Pages can serve — no
  // server. Every screen already fetches from Supabase in the browser, so this
  // loses no functionality; auth and routing move fully client-side.
  output: "export",

  // GitHub Pages serves this project under /china (cnbville.github.io/china).
  basePath: "/china",
  assetPrefix: "/china",

  // next/image optimization needs a server; we use plain <img>, so turn it off.
  images: { unoptimized: true },

  // Folder-style URLs (/items/) so deep links resolve to index.html on Pages.
  trailingSlash: true,
};

module.exports = nextConfig;
