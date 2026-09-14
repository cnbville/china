import type { Config } from "tailwindcss";

// "Cold night" — a moody near-black canvas with a cool blue undertone and a
// sharp red accent. Photos glow against the dark like a gallery wall.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#0A0B0E", // app background (cold near-black)
        card: "#13161D", // surfaces
        surface2: "#1A1E27", // inputs, hovered surfaces
        ink: "#ECEDF1", // primary text
        muted: "#8A909C", // secondary text (cool grey)
        line: "#262B36", // hairline borders
        accent: "#FF2E43", // cold red
        accentSoft: "#FF5C6C", // hover / lighter red
        accentInk: "#FFFFFF", // text on the accent
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-instrument-serif)", "ui-serif", "Georgia", "serif"],
      },
      borderRadius: {
        card: "10px",
        pill: "999px",
      },
      fontSize: {
        meta: ["13px", { lineHeight: "1.45" }],
        body: ["14px", { lineHeight: "1.5" }],
      },
      boxShadow: {
        // Soft lift for cards + a faint red glow for accented elements.
        lift: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.45)",
        glow: "0 0 0 1px rgba(255,46,67,0.35), 0 8px 30px rgba(255,46,67,0.20)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
