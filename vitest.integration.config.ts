import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    env: loadEnv("development", process.cwd(), ""),
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
