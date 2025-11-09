import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
export default defineWorkersConfig({
  test: {
    include: [
      "workers/**/test/**/*.spec.ts",
    ],
    poolOptions: {
      workers: {
        wrangler: {
          configPath: "./workers/album/wrangler.toml",
        },
        miniflare: {
          // Override bindings to use local mode (remove remote = true)
          // This allows tests to run without authentication
          bindings: {
            // Bindings will use local simulations by default
          }
        },
      },
    },
    // Exclude Node-based script tests, which run in a separate config
    exclude: [
      "scripts/test/**/*.spec.ts",
    ],
  },
});
