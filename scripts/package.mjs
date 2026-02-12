import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const outputDir = path.join(root, "artifacts");
const outputZip = path.join(outputDir, "makecode-ai-extension.zip");

async function run() {
  await mkdir(outputDir, { recursive: true });
  await rm(outputZip, { force: true });

  await execFileAsync("zip", ["-r", outputZip, "."], { cwd: distDir });
  console.log(`Packaged extension zip: ${outputZip}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
