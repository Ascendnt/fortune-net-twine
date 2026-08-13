import { defineConfig } from "vitest/config";
import path from "node:path";

// The pure computation modules (pricing, totals, batches) are plain TypeScript with no DOM
// dependency, so the node environment is enough: no jsdom, no setup file.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
