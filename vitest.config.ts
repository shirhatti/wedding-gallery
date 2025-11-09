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
          // Override bindings to use local mode (not remote)
          // This allows tests to run without authentication in CI
          r2Buckets: ["PHOTOS_BUCKET"],
          d1Databases: ["DB"],
        },
      },
    },
    // Exclude Node-based script tests, which run in a separate config
    exclude: [
      "scripts/test/**/*.spec.ts",
    ],
  },
});
