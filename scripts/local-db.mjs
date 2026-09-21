import EmbeddedPostgres from "embedded-postgres";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
const directory = resolve(".local");
await mkdir(directory, { recursive: true });
const secretsPath = resolve(directory, "local-secrets.json");
let secrets;
try {
  secrets = JSON.parse(await readFile(secretsPath, "utf8"));
} catch {
  secrets = {
    password: randomBytes(24).toString("hex"),
    authSecret: randomBytes(32).toString("hex"),
  };
  await writeFile(secretsPath, JSON.stringify(secrets), { mode: 0o600 });
}
const pg = new EmbeddedPostgres({
  databaseDir: process.env.LOCAL_DATABASE_DIR || resolve(directory, "postgres"),
  user: "ngt",
  password: secrets.password,
  port: 55432,
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--locale=C", "--encoding=UTF8"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: (message) => {
    if (String(message).includes("FATAL")) console.error(String(message));
  },
});
try {
  await access(
    resolve(
      process.env.LOCAL_DATABASE_DIR || resolve(directory, "postgres"),
      "PG_VERSION",
    ),
  );
} catch {
  await pg.initialise();
}
await pg.start();
const client = pg.getPgClient();
await client.connect();
for (const name of ["ngt", "ngt_test"]) {
  const found = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name],
  );
  if (!found.rowCount) await pg.createDatabase(name);
}
await client.end();
const connection = `postgresql://ngt:${secrets.password}@127.0.0.1:55432/`;
// Never replace a user's configured environment.
try {
  await writeFile(
    ".env",
    `DATABASE_URL="${connection}ngt?schema=public"\nAUTH_SECRET="${secrets.authSecret}"\nAUTH_URL="http://localhost:3000"\nAUTH_TRUST_HOST="true"\n`,
    { flag: "wx", mode: 0o600 },
  );
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
await writeFile(
  resolve(directory, "test.env"),
  `DATABASE_URL="${connection}ngt_test?schema=public"\nAUTH_SECRET="${secrets.authSecret}"\nAUTH_URL="http://localhost:3000"\nAUTH_TRUST_HOST="true"\n`,
  { mode: 0o600 },
);
console.log(
  "Local PostgreSQL ready at 127.0.0.1:55432. Development and isolated test databases available.",
);
async function stop() {
  await pg.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 60000);
