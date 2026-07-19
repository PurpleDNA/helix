import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward websocket/API traffic to the FastAPI backend so the frontend
    // can talk to ws://localhost:5173/ws/... without CORS or hardcoded hosts.
    proxy: {
      "/ws": {
        target: "http://127.0.0.1:8000",
        ws: true,
      },
    },
    allowedHosts: [".outray.app"],
  },
});
