// Keep the desktop preview on a dedicated PostgreSQL cluster so test migrations
// and fixture resets can never affect the business database.
import {
  access,
  cp,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.url);
const embeddedRequire = createRequire(require.resolve("embedded-postgres"));
const { Client } = embeddedRequire("pg");
const native = resolve(
  dirname(embeddedRequire.resolve("@embedded-postgres/windows-x64")),
  "../native",
);
const workspace = resolve(".local");
const cache = join(
  tmpdir(),
  `ngt-test-pg-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 10)}`,
);
const secretsFile = join(workspace, "test-secrets.json");
await mkdir(workspace, { recursive: true });
let secrets;
try {
  secrets = JSON.parse(await readFile(secretsFile, "utf8"));
} catch {
  secrets = {
    password: randomBytes(24).toString("hex"),
    authSecret: randomBytes(32).toString("hex"),
  };
  await writeFile(secretsFile, JSON.stringify(secrets));
}
await mkdir(cache, { recursive: true });
try {
  await access(join(cache, "runtime/bin/postgres.exe"));
} catch {
  await cp(native, join(cache, "runtime"), {
    recursive: true,
    dereference: true,
  });
}
function run(exe, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(join(cache, "runtime/bin", exe), args, {
      windowsHide: true,
      stdio: "pipe",
    });
    let error = "";
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(error)),
    );
  });
}
const dataDir = join(cache, "data");
try {
  await access(join(dataDir, "PG_VERSION"));
} catch {
  const passwordFile = join(cache, "init-password");
  await writeFile(passwordFile, secrets.password);
  try {
    await run("initdb.exe", [
      "-D",
      dataDir,
      "-U",
      "ngt",
      "--auth=scram-sha-256",
      "--locale=C",
      "--encoding=UTF8",
      `--pwfile=${passwordFile}`,
    ]);
  } finally {
    await unlink(passwordFile);
  }
}
const postgres = spawn(
  join(cache, "runtime/bin/postgres.exe"),
  ["-D", dataDir, "-h", "127.0.0.1", "-p", "55510"],
  { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
);
postgres.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
let ready = false;
postgres.stderr.on("data", (chunk) => {
  if (String(chunk).includes("FATAL")) console.error(String(chunk));
});
postgres.on("exit", (code) => {
  if (!ready || code) process.exit(code || 1);
});
const connection = `postgresql://ngt:${secrets.password}@127.0.0.1:55510/`;
for (let attempt = 0; attempt < 100; attempt++) {
  const client = new Client({ connectionString: `${connection}postgres` });
  try {
    await client.connect();
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'ngt_test'",
    );
    if (!found.rowCount) await client.query("CREATE DATABASE ngt_test");
    await client.end();
    ready = true;
    break;
  } catch {
    await client.end().catch(() => {});
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
}
if (!ready) {
  postgres.kill();
  throw new Error("Test database did not start.");
}
await writeFile(
  join(workspace, "test.env"),
  `DATABASE_URL="${connection}ngt_test?schema=public"\nAUTH_SECRET="${secrets.authSecret}"\nAUTH_URL="http://127.0.0.1:3236"\nAUTH_TRUST_HOST="true"\n`,
);
await writeFile(join(workspace, "test-database-location.txt"), cache);
console.log("Isolated ngt_test ready on 127.0.0.1:55510.");
async function stop() {
  await run("pg_ctl.exe", ["-D", dataDir, "-m", "fast", "stop"]);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
