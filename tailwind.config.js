/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,vue}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        'scada-dark': '#0a1628',
        'scada-blue': '#00b4d8',
        'scada-orange': '#ff6b35',
        'scada-green': '#22c55e',
        'scada-red': '#ef4444',
        'scada-surface': '#0d1f3c',
        'scada-border': '#1a3a5c',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Noto Sans SC', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'flash': 'data-flash 0.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
