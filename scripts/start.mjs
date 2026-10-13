import { access, cp } from "node:fs/promises";
import { spawn } from "node:child_process";
try {
  process.loadEnvFile(".env");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
for (const [source, destination] of [
  [".next/static", ".next/standalone/.next/static"],
  ["public", ".next/standalone/public"],
]) {
  try {
    await access(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await cp(source, destination, { recursive: true });
  }
}
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    HOSTNAME: process.env.APP_HOST || "127.0.0.1",
    NGT_STUDIO_ROOT: process.cwd(),
  },
});
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
