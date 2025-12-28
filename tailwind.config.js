/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: "rgba(36, 36, 36, 1)",
          grid: "#1a1a1a",
          gridLight: "#2a2a2a",
        },
        tile: {
          default: "#252538",
          hover: "#2f2f4a",
          selected: "#3a3a5c",
          border: "#4a4a6a",
          borderSelected: "#6366f1",
        },
        ui: {
          bg: "#0f0f0f",
          bgLight: "#1a1a1a",
          border: "#2a2a2a",
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
          "0%": { 
            transform: "translateX(100%) translate3d(0, 0, 0)",
            backfaceVisibility: "hidden",
          },
          "100%": { 
            transform: "translateX(0) translate3d(0, 0, 0)",
            backfaceVisibility: "hidden",
          },
        },
        slideOutRight: {
          "0%": { 
            transform: "translateX(0) translate3d(0, 0, 0)",
            backfaceVisibility: "hidden",
          },
          "100%": { 
            transform: "translateX(100%) translate3d(0, 0, 0)",
            backfaceVisibility: "hidden",
          },
        },
        expandUp: {
          "0%": { 
            transform: "scaleY(0) translate3d(0, 0, 0)", 
            transformOrigin: "bottom",
            backfaceVisibility: "hidden",
          },
          "100%": { 
            transform: "scaleY(1) translate3d(0, 0, 0)", 
            transformOrigin: "bottom",
            backfaceVisibility: "hidden",
          },
        },
      },
    },
  },
  plugins: [],
};
