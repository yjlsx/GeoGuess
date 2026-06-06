import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = process.env.GEOGUESS_API_PORT || "8787";
const webPort = Number(process.env.GEOGUESS_WEB_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  server: {
    port: webPort,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`
    }
  }
});
