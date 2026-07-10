import type { Config } from "tailwindcss";

export default {
  content: ["./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#1A3C6E",
          blue: "#2E6DB4",
          light: "#EAF2FB",
          border: "#C5D9F1",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
