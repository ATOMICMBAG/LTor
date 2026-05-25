/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      colors: {
        ltor: {
          ink: "#0a0a0a",
          paper: "#ffffff",
          line: "#e5e5e5",
          mute: "#737373",
          ok: "#16a34a",
          warn: "#ca8a04",
          alarm: "#dc2626",
          info: "#2563eb",
        },
      },
    },
  },
  plugins: [],
};
