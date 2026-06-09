/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "SFMono-Regular", "Consolas", "monospace"]
      },
      boxShadow: {
        neon: "0 0 32px rgba(34, 211, 238, 0.18)",
        violet: "0 0 38px rgba(139, 92, 246, 0.2)"
      }
    }
  },
  plugins: []
};
