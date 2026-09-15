import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * WP2.2 contract suite (docs/organiser-ux-review/wp/wp2.2.md §4.2, decision T).
 *
 * Database-backed tests against normal dev (never production — the suite
 * throws on the production host). Kept out of the default `vitest.config.ts`
 * include set so `pnpm test` stays hermetic; run with `pnpm test:contract`
 * and the OUX_CONTRACT_* variables in the shell (never in a file).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/__contract__/**/*.contract.test.ts"],
    globals: false,
    passWithNoTests: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
