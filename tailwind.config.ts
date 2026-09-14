import type { Config } from "tailwindcss";

// Palette and type scale come straight from section 6 of the build plan.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAF9F7",
        card: "#FFFFFF",
        ink: "#1A1917",
        muted: "#6B6764",
        line: "#E3E0DA",
        accent: "#8B4A2B",
      },
      fontFamily: {
        // Inter for UI, Instrument Serif for headings. Wired up in layout.tsx
        // via next/font, which sets these CSS variables.
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "ui-serif", "Georgia", "serif"],
      },
      borderRadius: {
        // "2px radius, not 12px" — one small radius, used everywhere.
        card: "2px",
      },
      fontSize: {
        meta: ["13px", { lineHeight: "1.4" }],
        body: ["14px", { lineHeight: "1.5" }],
      },
    },
  },
  plugins: [],
};

export default config;
