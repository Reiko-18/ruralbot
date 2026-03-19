/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#f9b4fe",
          dark: "#1a0a1e",
        },
      },
      boxShadow: {
        glow: "0 0 12px rgba(249,180,254,0.12), 0 0 32px rgba(249,180,254,0.06)",
        "glow-md": "0 0 16px rgba(249,180,254,0.18), 0 0 40px rgba(249,180,254,0.08)",
        "glow-lg": "0 0 20px rgba(249,180,254,0.25), 0 0 48px rgba(249,180,254,0.10)",
        "glow-btn": "0 0 14px rgba(249,180,254,0.40)",
      },
    },
  },
  plugins: [],
};
