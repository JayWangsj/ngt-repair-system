import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const env = { ...process.env };
if (!env.DATABASE_URL) {
  const data = await readFile(".local/test.env", "utf8");
  for (const line of data.trim().split(/\r?\n/)) {
    const split = line.indexOf("=");
    env[line.slice(0, split)] = line.slice(split + 1).replace(/^"|"$/g, "");
  }
}
if (!new URL(env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Verification requires a dedicated *_test database.");
env.AUTH_URL = "http://localhost:3000";
env.AUTH_TRUST_HOST = "true";
env.AUTH_SECRET ||= "ci-test-only-auth-secret-32-characters-minimum";
function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)),
    );
  });
}
await run(require.resolve("prisma/build/index.js"), ["migrate", "deploy"]);
await run(require.resolve("vitest/vitest.mjs"), [
  "run",
  "--config",
  "vitest.integration.config.ts",
]);
if (!process.argv.includes("--integration-only")) {
  await run(require.resolve("tsx/cli"), ["scripts/seed-test.ts"]);
  await run(require.resolve("@playwright/test/cli"), ["test"]);
}
