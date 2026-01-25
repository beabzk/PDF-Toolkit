import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");

const source = path.resolve(
  projectRoot,
  "node_modules",
  "pdfjs-dist",
  "build",
  "pdf.worker.min.mjs",
);

const targetDir = path.resolve(projectRoot, "public");
const target = path.resolve(targetDir, "pdf.worker.min.mjs");

try {
  await mkdir(targetDir, { recursive: true });
  await copyFile(source, target);
  console.log(
    `[copy-pdf-worker] Copied ${path.relative(projectRoot, source)} -> ${path.relative(projectRoot, target)}`,
  );
} catch (error) {
  console.error("[copy-pdf-worker] Failed to copy PDF.js worker", error);
  process.exit(1);
}
