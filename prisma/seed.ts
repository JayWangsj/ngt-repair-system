import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  await db.user.upsert({
    where: { email: "local-operator@ngt.invalid" },
    update: {},
    create: {
      email: "local-operator@ngt.invalid",
      name: "NGT",
      passwordHash: "!disabled",
      role: "OWNER",
    },
  });
  if (process.env.SEED_DEMO === "true") {
    for (const data of [
      {
        category: "PHONE",
        brand: "Apple",
        model: "iPhone 13",
        series: "",
        project: "sostituzione display",
        suggested: "129.00",
        cost: "68.00",
        minutes: 60,
      },
      {
        category: "PHONE",
        brand: "Apple",
        model: "",
        series: "iPhone",
        project: "sostituzione batteria",
        suggested: "59.00",
        cost: "22.00",
        minutes: 30,
      },
      {
        category: "PHONE",
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
          category_brand_series_model_project: {
            category: data.category,
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
    "Local workspace ready. Historical records and prices were preserved.",
  );
}
main().finally(() => db.$disconnect());
