export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0C0C14",
        surface: "#181829",
        line: "#2A2A40",
        text: "#E7E7F0",
        dim: "#9AA0AF",
        primary: "#6D28D9",
        accent: "#F43F5E",
        up: "#22C55E",
        down: "#EF4444"
      },
      borderRadius: { "2xl": "1rem" },
      boxShadow: { soft: "0 8px 30px rgba(0,0,0,0.25)" }
    }
  },
  plugins: []
}
