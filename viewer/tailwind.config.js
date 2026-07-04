/** @type {import('tailwindcss').Config} */
export default {
  content: {
    // Resolve globs relative to this config file, not the process cwd
    // (the build runs from the repo root).
    relative: true,
    files: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  },
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd2ff",
          300: "#8eb4ff",
          400: "#598bff",
          500: "#3366ff",
          600: "#1f4ff5",
          700: "#173de1",
          800: "#1934b6",
          900: "#1a338f",
        },
        status: {
          pass: "#16a34a",
          passBg: "#dcfce7",
          warn: "#d97706",
          warnBg: "#fef3c7",
          fail: "#dc2626",
          failBg: "#fee2e2",
          ai: "#2563eb",
          aiBg: "#dbeafe",
          idle: "#64748b",
          idleBg: "#f1f5f9",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(16, 24, 40, 0.04), 0 1px 3px 0 rgba(16, 24, 40, 0.08)",
        cardHover:
          "0 4px 8px -2px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.06)",
      },
    },
  },
  plugins: [],
};
