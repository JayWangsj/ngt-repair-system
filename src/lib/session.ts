import { db } from "./db";

const operatorEmail = "local-operator@ngt.invalid";
const actorSelect = {
  id: true,
  name: true,
  role: true,
  enabled: true,
} as const;

// Keep audit foreign keys without login. Concurrent first requests may race:
// insert-on-conflict makes initialization safe across server workers.
export async function requireActor() {
  const existing = await db.user.findUnique({
    where: { email: operatorEmail },
    select: actorSelect,
  });
  if (existing) return existing;
  await db.user.createMany({
    data: [
      {
        email: operatorEmail,
        name: "NGT",
        passwordHash: "!disabled",
        role: "OWNER",
      },
    ],
    skipDuplicates: true,
  });
  return db.user.findUniqueOrThrow({
    where: { email: operatorEmail },
    select: actorSelect,
  });
}
