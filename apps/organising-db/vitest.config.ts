import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for the organising-db app.
 *
 * Tests live next to source under `src/**\/__tests__/**` and use the
 * same `@/` alias as the Next.js app. The alias is wired in here
 * directly (rather than via `vite-tsconfig-paths`) so vitest can pick
 * it up without an extra ESM-only plugin in CJS environments.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    // WP2.2: the database-backed contract suite has its own config
    // (vitest.contract.config.ts, `pnpm test:contract`); keep `pnpm test` hermetic.
    exclude: [...configDefaults.exclude, "src/**/__contract__/**"],
    globals: false,
    passWithNoTests: false,
  },
});
