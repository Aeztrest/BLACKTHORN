import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Backend default from apps/server; override with VITE_API_TARGET=http://127.0.0.1:9000 */
const apiTarget = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    /** Uzak sunucuda `pnpm dev:web` ile erişim için (127.0.0.1 dışı) */
    host: true,
    /** IP veya alan adı ile gelen isteklerde Vite'ın "Blocked request" vermesini engeller */
    allowedHosts: true,
    port: 5173,
    strictPort: true,
    proxy: {
      "/health": { target: apiTarget, changeOrigin: true },
      "/v1": { target: apiTarget, changeOrigin: true },
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
    port: 5173,
    strictPort: true,
  },
});
