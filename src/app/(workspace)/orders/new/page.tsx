import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { NewOrderWizard } from "@/components/new-order-form";
import { BackButton, PageHeader } from "@/components/common";
import { getMessages } from "@/lib/i18n-server";
export default async function NewOrder() {
  const it = await getMessages();
  await requireActor();
  const rules = await db.priceRule.findMany({
    where: { enabled: true },
    orderBy: { project: "asc" },
  });
  const [
    faultOptions,
    devices,
    customers,
    products,
    productCategories,
    reservations,
  ] = await Promise.all([
    db.faultOption.findMany({
      select: {
        id: true,
        category: true,
        name: true,
        note: true,
        hidden: true,
        sortOrder: true,
        _count: { select: { orders: true } },
      },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.device.findMany({
      where: { deletedAt: null, customer: { deletedAt: null } },
      select: { category: true, brand: true, model: true },
      distinct: ["category", "brand", "model"],
    }),
    db.customer.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        phones: { select: { phone: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      where: { enabled: true, usage: { in: ["REPAIR", "BOTH"] } },
      select: { id: true, name: true, category: true, stockQuantity: true },
      orderBy: [{ favorite: "desc" }, { name: "asc" }],
    }),
    db.inventoryCategory.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, repairOnly: true },
      orderBy: { name: "asc" },
    }),
    db.workOrderProduct.groupBy({
      by: ["productId"],
      where: {
        kind: "REPAIR_PART",
        consumedAt: null,
        order: { status: { notIn: ["COMPLETED", "REFUNDED", "CANCELLED"] } },
      },
      _sum: { quantity: true },
    }),
  ]);
  const reservedByProduct = new Map(
    reservations.map((entry) => [entry.productId, entry._sum.quantity ?? 0]),
  );
  return (
    <>
      <BackButton href="/orders" label={it.nav.orders} />
      <PageHeader title={it.newOrder} description={it.ordersDescription} />
      <NewOrderWizard
        faultOptions={faultOptions.map(({ _count, ...fault }) => ({
          ...fault,
          usageCount: _count.orders,
        }))}
        devices={devices}
        customers={customers}
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          category: product.category,
          stock: product.stockQuantity,
          reserved: reservedByProduct.get(product.id) ?? 0,
          available: Math.max(
            0,
            product.stockQuantity - (reservedByProduct.get(product.id) ?? 0),
          ),
        }))}
        productCategories={productCategories}
        rules={rules.map((r) => ({
          ...r,
          suggested: r.suggested.toString(),
          cost: undefined,
          updatedAt: undefined,
        }))}
      />
    </>
  );
}
