import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border:      "#1a2d4a",
        input:       "#0a1628",
        ring:        "#60a5fa",
        background:  "#060e1e",
        foreground:  "#f0f4ff",
        primary: {
          DEFAULT:    "#60a5fa",
          foreground: "#060e1e",
        },
        secondary: {
          DEFAULT:    "#0a1628",
          foreground: "#94a8c8",
        },
        destructive: {
          DEFAULT:    "#ef4444",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT:    "#0a1628",
          foreground: "#6b82a8",
        },
        accent: {
          DEFAULT:    "#fbbf24",
          foreground: "#060e1e",
        },
        popover: {
          DEFAULT:    "#0a1628",
          foreground: "#f0f4ff",
        },
        card: {
          DEFAULT:    "#0a1628",
          foreground: "#f0f4ff",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
