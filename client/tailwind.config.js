/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        aether: {
          bg: "#0a0a0f",
          panel: "#15151e",
          border: "#2a2a3a",
          accent: "#c9a14b",
          accent2: "#7d5cff",
          danger: "#e05d5d",
          good: "#5dc88a",
        },
      },
      fontFamily: {
        display: ["'Cinzel'", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
