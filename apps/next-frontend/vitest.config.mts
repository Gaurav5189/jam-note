import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig's `@/*` path alias so tests can import app modules.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});