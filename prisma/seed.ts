import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const email = process.env.SEED_OWNER_EMAIL?.toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD;
  if (
    !email ||
    !password ||
    password.length < 12 ||
    password === "replace-with-a-strong-password"
  )
    throw new Error(
      "Set SEED_OWNER_EMAIL and a unique SEED_OWNER_PASSWORD (12+ characters).",
    );
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: process.env.SEED_OWNER_NAME || "Titolare",
      passwordHash: await hash(password, 12),
      role: "OWNER",
    },
  });
  if (process.env.SEED_DEMO === "true") {
    for (const data of [
      {
        brand: "apple",
        model: "iphone 13",
        series: "",
        project: "sostituzione display",
        suggested: "129.00",
        cost: "68.00",
        minutes: 60,
      },
      {
        brand: "apple",
        model: "",
        series: "iphone",
        project: "sostituzione batteria",
        suggested: "59.00",
        cost: "22.00",
        minutes: 30,
      },
      {
        brand: "",
        model: "",
        series: "",
        project: "diagnosi",
        suggested: "20.00",
        cost: "0.00",
        minutes: 30,
      },
    ])
      await db.priceRule.upsert({
        where: {
          brand_series_model_project: {
            brand: data.brand,
            series: data.series,
            model: data.model,
            project: data.project,
          },
        },
        update: {},
        create: data,
      });
  }
  console.log(
    "Initial account ready. Existing accounts and prices were preserved.",
  );
}
main().finally(() => db.$disconnect());
