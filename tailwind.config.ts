import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      keyframes: {
        "skill-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(45, 212, 191, 0.45)" },
          "50%": { boxShadow: "0 0 0 8px rgba(45, 212, 191, 0.08)" }
        }
      },
      animation: {
        "skill-pulse": "skill-pulse 2.4s ease-in-out infinite"
      },
      colors: {
        border: "hsl(240 3.7% 15.9%)",
        input: "hsl(240 3.7% 15.9%)",
        ring: "hsl(142 70% 45%)",
        background: "hsl(240 10% 3.9%)",
        foreground: "hsl(0 0% 98%)",
        primary: {
          DEFAULT: "hsl(142 71% 45%)",
          foreground: "hsl(0 0% 98%)"
        },
        secondary: {
          DEFAULT: "hsl(240 3.7% 15.9%)",
          foreground: "hsl(0 0% 98%)"
        },
        muted: {
          DEFAULT: "hsl(240 3.7% 15.9%)",
          foreground: "hsl(240 5% 64.9%)"
        },
        accent: {
          DEFAULT: "hsl(240 3.7% 15.9%)",
          foreground: "hsl(0 0% 98%)"
        },
        destructive: {
          DEFAULT: "hsl(0 62.8% 30.6%)",
          foreground: "hsl(0 0% 98%)"
        },
        card: {
          DEFAULT: "hsl(240 10% 3.9%)",
          foreground: "hsl(0 0% 98%)"
        }
      }
    }
  },
  plugins: []
};

export default config;
