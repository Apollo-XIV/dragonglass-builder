import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // The core engine has no Obsidian dependency; the plugin layer does, so tests
      // that touch the store or the UI resolve "obsidian" to a stub.
      obsidian: resolve(__dirname, "tests/stubs/obsidian.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "node",
  },
});
