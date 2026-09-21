import { randomBytes } from "node:crypto";
import { access, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/ngt"
  )
    throw new Error(
      "This helper only initializes the local ngt development database.",
    );
  const email = "owner@ngt.local";
  if (await db.user.findUnique({ where: { email } })) {
    console.log("Local owner already exists; existing password preserved.");
    return;
  }
  await access(".local");
  const password = randomBytes(18).toString("base64url");
  await db.user.create({
    data: {
      email,
      name: "Titolare NGT",
      passwordHash: await hash(password, 12),
      role: "OWNER",
    },
  });
  await writeFile(
    ".local/access.md",
    `# 本机开发访问\n\n地址：http://localhost:3000\n\n账号：${email}\n\n密码：${password}\n\n这是本机随机生成的开发账号，不是生产默认密码。本文件已被 Git 忽略。\n`,
    { flag: "wx" },
  );
  console.log(
    "Local owner created. Credentials saved to .local/access.md (not tracked by Git).",
  );
}
main().finally(() => db.$disconnect());
