/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: "#1a1a2e",
          grid: "#2d2d44",
          gridLight: "#3d3d5c",
        },
        tile: {
          default: "#252538",
          hover: "#2f2f4a",
          selected: "#3a3a5c",
          border: "#4a4a6a",
          borderSelected: "#6366f1",
        },
        ui: {
          bg: "#16162a",
          bgLight: "#1e1e36",
          border: "#2d2d44",
          text: "#e2e8f0",
          textMuted: "#94a3b8",
        },
        terminal: {
          bg: "#0d0d1a",
          text: "#22c55e",
        },
      },
      animation: {
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-out-right": "slideOutRight 0.3s ease-in",
        "expand-up": "expandUp 0.3s ease-out",
      },
      keyframes: {
        slideInRight: {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        slideOutRight: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        expandUp: {
          "0%": { transform: "scaleY(0)", transformOrigin: "bottom" },
          "100%": { transform: "scaleY(1)", transformOrigin: "bottom" },
        },
      },
    },
  },
  plugins: [],
};
