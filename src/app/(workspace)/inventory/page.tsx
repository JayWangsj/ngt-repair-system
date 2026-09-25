import {
  Boxes,
  CircleAlert,
  PackageCheck,
  PackageX,
  Wallet,
} from "lucide-react";
import { db } from "@/lib/db";
import { cents, inventoryStatus, money } from "@/lib/domain";
import { getMessages } from "@/lib/i18n-server";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";
import {
  InventoryWorkspace,
  NewProductDialogButton,
  type ProductView,
} from "@/components/inventory";

export default async function InventoryPage() {
  await requireActor();
  const it = await getMessages();
  const products = await db.product.findMany({
    where: { enabled: true },
    orderBy: [{ favorite: "desc" }, { name: "asc" }],
  });
  const productViews: ProductView[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    usage: product.usage,
    costPrice: cents(product.costPrice),
    salePrice: cents(product.salePrice),
    stockQuantity: product.stockQuantity,
    minStock: product.minStock,
    favorite: product.favorite,
    enabled: product.enabled,
  }));
  const enabled = productViews.filter((product) => product.enabled);
  const metrics = [
    { label: it.inventory.productCount, value: enabled.length, icon: Boxes },
    {
      label: it.inventory.stockTotal,
      value: enabled.reduce((sum, product) => sum + product.stockQuantity, 0),
      icon: PackageCheck,
    },
    {
      label: it.inventory.stockCost,
      value: money(
        enabled.reduce(
          (sum, product) => sum + product.costPrice * product.stockQuantity,
          0,
        ),
      ),
      icon: Wallet,
    },
    {
      label: it.inventory.lowStock,
      value: enabled.filter(
        (product) =>
          inventoryStatus(product.stockQuantity, product.minStock) ===
          "LOW_STOCK",
      ).length,
      icon: CircleAlert,
    },
    {
      label: it.inventory.outOfStock,
      value: enabled.filter(
        (product) =>
          inventoryStatus(product.stockQuantity, product.minStock) ===
          "OUT_OF_STOCK",
      ).length,
      icon: PackageX,
    },
  ];
  return (
    <>
      <PageHeader
        title={it.inventory.title}
        description={it.inventory.description}
        actionNode={
          <NewProductDialogButton
            categories={[
              ...new Set(productViews.map((product) => product.category)),
            ]}
          />
        }
      />
      <div className="inventory-metrics">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div className="metric" key={label}>
            <div className="metric-top">
              <span>{label}</span>
              <span className="metric-icon orange">
                <Icon size={20} />
              </span>
            </div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <InventoryWorkspace products={productViews} />
    </>
  );
}
