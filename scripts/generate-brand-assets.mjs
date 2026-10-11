import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const brandDirectory = path.join(root, "public", "brand");
const appIconSource = path.join(brandDirectory, "ngt-app-icon.svg");
const appIconMaster = path.join(brandDirectory, "ngt-app-icon.png");
const markMaster = path.join(brandDirectory, "ngt-mark.png");
const pngSizes = [16, 24, 32, 48, 64, 128, 192, 256, 512];
const icoSizes = new Set([16, 24, 32, 48, 64, 128, 256]);

const appPngs = [];
for (const size of pngSizes) {
  const appPng = await sharp(appIconMaster)
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
  const markPng = await sharp(markMaster)
    .resize(size, size, { fit: "contain" })
    .png()
    .toBuffer();
  await writeFile(
    path.join(brandDirectory, `ngt-app-icon-${size}.png`),
    appPng,
  );
  await writeFile(path.join(brandDirectory, `ngt-mark-${size}.png`), markPng);
  if (icoSizes.has(size)) appPngs.push({ size, data: appPng });
}

const headerSize = 6 + appPngs.length * 16;
let imageOffset = headerSize;
const directory = Buffer.alloc(headerSize);
directory.writeUInt16LE(0, 0);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(appPngs.length, 4);

for (const [index, icon] of appPngs.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = icon.size === 256 ? 0 : icon.size;
  directory[entry + 1] = icon.size === 256 ? 0 : icon.size;
  directory[entry + 2] = 0;
  directory[entry + 3] = 0;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(icon.data.length, entry + 8);
  directory.writeUInt32LE(imageOffset, entry + 12);
  imageOffset += icon.data.length;
}

const ico = Buffer.concat([directory, ...appPngs.map((icon) => icon.data)]);
await writeFile(path.join(root, "assets", "ngt-studio.ico"), ico);
await writeFile(
  path.join(root, "assets", "ngt-studio-icon.png"),
  appPngs.find(({ size }) => size === 256).data,
);
await writeFile(
  path.join(root, "assets", "ngt-studio-icon.svg"),
  await readFile(appIconSource),
);
