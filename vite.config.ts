import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { DASHBOARD_PORT } from "./server/constants.ts";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": `http://127.0.0.1:${DASHBOARD_PORT}`,
    },
  },
});
