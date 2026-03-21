/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#c084fc",
          light: "#e0b0ff",
          dark: "#1a0a1e",
        },
        surface: {
          DEFAULT: "#0f0f17",
          raised: "#16161f",
          overlay: "#1c1c28",
        },
        border: {
          DEFAULT: "rgba(139, 92, 246, 0.15)",
          hover: "rgba(139, 92, 246, 0.30)",
          active: "rgba(139, 92, 246, 0.50)",
        },
      },
      boxShadow: {
        glow: "0 0 12px rgba(192,132,252,0.10), 0 0 32px rgba(192,132,252,0.05)",
        "glow-md": "0 0 16px rgba(192,132,252,0.15), 0 0 40px rgba(192,132,252,0.08)",
        "glow-lg": "0 0 24px rgba(192,132,252,0.20), 0 0 48px rgba(192,132,252,0.10)",
        "glow-btn": "0 0 14px rgba(192,132,252,0.35)",
        "inner-glow": "inset 0 1px 0 rgba(255,255,255,0.05)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "spin-slow": "spin 2s linear infinite",
        shimmer: "shimmer 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
