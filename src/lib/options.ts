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
