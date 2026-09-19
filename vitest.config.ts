import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // src/**: frontend component tests (jsdom). *.test.js at repo root:
    // backend logic tests (server.js) — plain Node, doesn't need jsdom,
    // but sharing one config/runner is simpler than a second test setup.
    include: ["src/**/*.{test,spec}.{ts,tsx}", "*.test.js"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
