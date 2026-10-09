type TestToolEnvironment = {
  DATABASE_URL?: string;
  NGT_TEST_TOOLS?: string;
};

export function isTestToolsEnabled(environment?: TestToolEnvironment) {
  const source = environment ?? process.env;
  if (source.NGT_TEST_TOOLS !== "true") return false;
  try {
    const database = decodeURIComponent(
      new URL(source.DATABASE_URL || "").pathname,
    )
      .split("/")
      .filter(Boolean)
      .at(-1);
    return database === "ngt_test";
  } catch {
    return false;
  }
}
