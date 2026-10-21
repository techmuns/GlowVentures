/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Deep indigo chassis (dark theme surfaces)
        ink: {
          950: "#070615",
          900: "#0b0a1f",
          800: "#151233",
          700: "#1f1b45",
          600: "#2b2668",
          500: "#3a3488",
        },
        // Champagne — the premium accent (replaces the old gold)
        champagne: {
          400: "#ecdcae",
          500: "#d9c48f",
          600: "#c3a962",
        },
        // Indigo accent for links / interactive text
        accent: {
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
        },
        gain: "#10b981",
        loss: "#ef4444",
      },
      // Glow Central Research's two faces: Inter for reading, Plus Jakarta Sans
      // for titles and headline figures. JetBrains Mono is gone — figures are
      // Inter with tabular digits (see `.mono` in index.css), which lines up a
      // column exactly as well and reads like the rest of the page.
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ['"Plus Jakarta Sans"', "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 1px 2px 0 rgba(0,0,0,0.5)",
        glow: "0 0 0 1px rgba(217,196,143,0.25), 0 8px 24px -6px rgba(217,196,143,0.18)",
      },
    },
  },
  plugins: [],
};
