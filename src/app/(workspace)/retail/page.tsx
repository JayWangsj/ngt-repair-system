import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { cents } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";
import { RetailWorkbench } from "@/components/retail-workbench";
import { Button } from "@/components/ui/button";

export default async function RetailPage() {
  await requireActor();
  const it = await getMessages();
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { enabled: true, usage: { in: ["RETAIL", "BOTH"] } },
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
    }),
    db.inventoryCategory.findMany({
      where: { deletedAt: null, repairOnly: false },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <>
      <PageHeader
        title={it.retail.title}
        description={it.retail.description}
        actionNode={
          <Button asChild variant="outline">
            <Link href="/retail/sales">
              <ClipboardList size={18} />
              {it.retail.sales}
            </Link>
          </Button>
        }
      />
      <RetailWorkbench
        categories={categories}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category,
          salePrice: cents(product.salePrice),
          stockQuantity: product.stockQuantity,
          favorite: product.favorite,
        }))}
      />
    </>
  );
}
