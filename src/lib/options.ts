/** Stable, case-insensitive suggestions shared by order and price forms. */
export function uniqueOptions(values: string[]) {
  return [
    ...new Map(
      values.filter(Boolean).map((v) => [v.trim().toLowerCase(), v.trim()]),
    ).values(),
  ];
}
export function deviceProjects<
  T extends {
    category: string;
    brand: string;
    model: string;
    project: string;
    enabled: boolean;
  },
>(rules: T[], device: { category: string; brand: string; model: string }) {
  return uniqueOptions(
    rules
      .filter(
        (r) =>
          r.enabled &&
          r.category === device.category &&
          r.brand.toLowerCase() === device.brand.trim().toLowerCase() &&
          r.model.toLowerCase() === device.model.trim().toLowerCase(),
      )
      .map((r) => r.project),
  );
}

export function pricePath(...parts: string[]) {
  return JSON.stringify(parts.map((part) => part.trim().toLowerCase()));
}
export function groupPriceRules<
  T extends { brand: string; category: string; model: string; project: string },
>(rules: T[], query = "") {
  const needle = query.trim().toLocaleLowerCase();
  const result: {
    key: string;
    brand: string;
    categories: {
      key: string;
      category: string;
      models: { key: string; model: string; rules: T[] }[];
    }[];
  }[] = [];
  for (const rule of rules) {
    if (
      needle &&
      ![rule.brand, rule.model, rule.project].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      )
    )
      continue;
    const brandKey = pricePath(rule.brand);
    let brand = result.find((group) => group.key === brandKey);
    if (!brand) {
      brand = { key: brandKey, brand: rule.brand, categories: [] };
      result.push(brand);
    }
    const categoryKey = pricePath(rule.brand, rule.category);
    let category = brand.categories.find((group) => group.key === categoryKey);
    if (!category) {
      category = { key: categoryKey, category: rule.category, models: [] };
      brand.categories.push(category);
    }
    const modelKey = pricePath(rule.brand, rule.category, rule.model);
    let model = category.models.find((group) => group.key === modelKey);
    if (!model) {
      model = { key: modelKey, model: rule.model, rules: [] };
      category.models.push(model);
    }
    model.rules.push(rule);
  }
  result.sort((a, b) => a.brand.localeCompare(b.brand));
  for (const brand of result)
    for (const category of brand.categories)
      category.models.sort((a, b) =>
        a.model.localeCompare(b.model, undefined, { numeric: true }),
      );
  return result;
}
