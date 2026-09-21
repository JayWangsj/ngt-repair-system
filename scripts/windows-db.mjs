// Windows PostgreSQL cannot bootstrap UTF-8 clusters from a non-ASCII binary path.
// Copy only the database runtime to an ASCII temporary path; application files stay put.
import {
  cp,
  mkdir,
  readFile,
  writeFile,
  access,
  unlink,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes, createHash } from "node:crypto";
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
  `ngt-pg-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 10)}`,
);
if (/[^\x00-\x7F]/.test(cache))
  throw new Error(
    "Set TEMP to an ASCII-only directory for the Windows PostgreSQL runtime.",
  );
await mkdir(workspace, { recursive: true });
let secrets;
try {
  secrets = JSON.parse(
    await readFile(join(workspace, "local-secrets.json"), "utf8"),
  );
} catch {
  secrets = {
    password: randomBytes(24).toString("hex"),
    authSecret: randomBytes(32).toString("hex"),
  };
  await writeFile(
    join(workspace, "local-secrets.json"),
    JSON.stringify(secrets),
  );
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
  return new Promise((resolve, reject) => {
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
      code === 0 ? resolve() : reject(new Error(error)),
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
  ["-D", dataDir, "-h", "127.0.0.1", "-p", "55432"],
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
const connection = `postgresql://ngt:${secrets.password}@127.0.0.1:55432/`;
for (let attempt = 0; attempt < 100; attempt++) {
  const client = new Client({ connectionString: `${connection}postgres` });
  try {
    await client.connect();
    for (const name of ["ngt", "ngt_test"]) {
      const found = await client.query(
        "SELECT 1 FROM pg_database WHERE datname=$1",
        [name],
      );
      if (!found.rowCount) await client.query(`CREATE DATABASE ${name}`);
    }
    await client.end();
    ready = true;
    break;
  } catch {
    await client.end().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
if (!ready) {
  postgres.kill();
  throw new Error("Database did not start.");
}
const env = (name) =>
  `DATABASE_URL="${connection}${name}?schema=public"\nAUTH_SECRET="${secrets.authSecret}"\nAUTH_URL="http://localhost:3000"\nAUTH_TRUST_HOST="true"\n`;
try {
  await writeFile(".env", env("ngt"), { flag: "wx" });
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
await writeFile(join(workspace, "test.env"), env("ngt_test"));
await writeFile(join(workspace, "database-location.txt"), cache);
console.log(
  "PostgreSQL ready on 127.0.0.1:55432. Local environment and separate test database configured.",
);
async function stop() {
  await run("pg_ctl.exe", ["-D", dataDir, "-m", "fast", "stop"]);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
