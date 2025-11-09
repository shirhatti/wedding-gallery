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
      },
    },
    // Exclude Node-based script tests, which run in a separate config
    exclude: [
      "scripts/test/**/*.spec.ts",
    ],
  },
});
