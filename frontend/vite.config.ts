import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // aceptar cualquier Host (incluye *.ngrok-free.dev)
    allowedHosts: true,
    // HMR detrás de túneles HTTPS
    hmr: { clientPort: 443 },
    // proxy al backend local
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
