import { cp } from "node:fs/promises";

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  throw new Error("Source and destination directories are required.");
}

await cp(source, destination, {
  recursive: true,
  dereference: true,
  force: true,
});
