import { copyFile, lstat, mkdir, readdir, readlink } from "node:fs/promises";
import path from "node:path";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  throw new Error("Source and destination directories are required.");
}

async function copyMaterialized(sourcePath, destinationPath, ancestors) {
  const entry = await lstat(sourcePath);
  if (entry.isSymbolicLink()) {
    const target = await readlink(sourcePath);
    const resolvedTarget = path.resolve(path.dirname(sourcePath), target);
    await copyMaterialized(resolvedTarget, destinationPath, ancestors);
    return;
  }

  if (entry.isDirectory()) {
    const key = path.resolve(sourcePath).toLowerCase();
    if (ancestors.has(key))
      throw new Error(`Directory link cycle: ${sourcePath}`);
    const nextAncestors = new Set(ancestors).add(key);
    await mkdir(destinationPath, { recursive: true });
    for (const name of await readdir(sourcePath)) {
      await copyMaterialized(
        path.join(sourcePath, name),
        path.join(destinationPath, name),
        nextAncestors,
      );
    }
    return;
  }

  if (entry.isFile()) await copyFile(sourcePath, destinationPath);
}

await copyMaterialized(source, destination, new Set());
