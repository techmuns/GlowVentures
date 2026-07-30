import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The Data Audit archive lives in public/audit/ so Vite serves it at /audit/*
// in dev, preview and the production build alike. On the hosted site every
// request (including /audit/*) is gated by the edge password check in
// functions/_middleware.js, so the archive is only reachable after sign-in.

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          recharts: ["recharts"],
        },
      },
    },
  },
});
