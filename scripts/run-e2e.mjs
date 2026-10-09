import { spawn } from "node:child_process";
import { cp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = { ...process.env };
const distDir = env.NEXT_DIST_DIR || ".next";
const port = env.E2E_PORT || "3000";

if (!env.DATABASE_URL) {
  const data = await readFile(".local/test.env", "utf8");
  for (const line of data.trim().split(/\r?\n/)) {
    const split = line.indexOf("=");
    env[line.slice(0, split)] = line.slice(split + 1).replace(/^"|"$/g, "");
  }
}

if (!new URL(env.DATABASE_URL).pathname.endsWith("_test")) {
  throw new Error("End-to-end tests require a dedicated *_test database.");
}

env.AUTH_URL = `http://localhost:${port}`;
env.AUTH_TRUST_HOST = "true";
env.AUTH_SECRET ||= "ci-test-only-auth-secret-32-characters-minimum";
env.NGT_TEST_TOOLS = "true";
env.HOSTNAME = "127.0.0.1";
env.PORT = port;
env.PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${port}`;

await cp(`${distDir}/static`, `${distDir}/standalone/${distDir}/static`, {
  recursive: true,
});

const server = spawn(process.execPath, [`${distDir}/standalone/server.js`], {
  env,
  stdio: "inherit",
  windowsHide: true,
});

function waitForExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

async function stopServer() {
  if (server.exitCode !== null) return;
  const exited = waitForExit(server);
  server.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 1000)),
  ]);
  if (server.exitCode === null) {
    server.kill("SIGKILL");
    await exited;
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Application server exited ${server.exitCode}.`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Application server did not become ready.");
}

function runPlaywright() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        require.resolve("@playwright/test/cli"),
        "test",
        ...process.argv.slice(2),
      ],
      {
        env: { ...env, PLAYWRIGHT_REUSE_SERVER: "1" },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Playwright exited ${code}.`)),
    );
  });
}

try {
  await waitForServer();
  await runPlaywright();
} finally {
  await stopServer();
}
