import { readFile } from "node:fs/promises";
import path from "node:path";
import { BusinessError } from "./domain";

export async function assertStudioWritesAvailable(
  root = process.env.NGT_STUDIO_ROOT || process.cwd(),
) {
  const configPath = path.join(root, ".local", "studio.json");
  let config: { installRoot?: string };
  try {
    config = JSON.parse(await readFile(configPath, "utf8")) as {
      installRoot?: string;
    };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new BusinessError(
      "Manutenzione di sistema non verificabile. Riprova tra poco.",
    );
  }
  if (!config.installRoot) return;

  try {
    await readFile(
      path.join(config.installRoot, ".local", "update-maintenance.json"),
      "utf8",
    );
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new BusinessError(
      "Manutenzione di sistema non verificabile. Riprova tra poco.",
    );
  }
  throw new BusinessError(
    "Manutenzione di sistema in corso. Riprova tra poco.",
  );
}
