import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement, l'API et le thème viennent du daemon local.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:7777", "/theme.css": "http://127.0.0.1:7777" },
  },
});
