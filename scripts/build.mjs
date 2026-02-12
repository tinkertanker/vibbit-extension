import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
const sourcePath = path.join(root, "work.js");
const manifestPath = path.join(root, "extension", "manifest.json");
const byokHostPermissions = [
  "https://api.openai.com/*",
  "https://generativelanguage.googleapis.com/*",
  "https://openrouter.ai/*"
];

const userscriptHeaderPattern = /^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/;

function overrideConst(source, name, value) {
  const pattern = new RegExp(`const ${name} = ".*?";`);
  if (!pattern.test(source)) {
    throw new Error(`Could not find ${name} declaration in work.js`);
  }

  return source.replace(pattern, `const ${name} = ${JSON.stringify(value)};`);
}

function hostPermissionForBackend(backend) {
  const parsed = new URL(backend);
  return `${parsed.protocol}//${parsed.host}/*`;
}

async function build() {
  const [rawClient, rawManifest] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(manifestPath, "utf8")
  ]);

  let builtClient = rawClient.replace(userscriptHeaderPattern, "");
  const manifest = JSON.parse(rawManifest);

  const backend = process.env.MCAI_BACKEND;
  const appToken = process.env.MCAI_APP_TOKEN;

  if (backend) {
    builtClient = overrideConst(builtClient, "BACKEND", backend);
    const backendPermission = hostPermissionForBackend(backend);
    manifest.host_permissions = [...new Set([backendPermission, ...byokHostPermissions])];
  }

  if (appToken !== undefined) {
    builtClient = overrideConst(builtClient, "APP_TOKEN", appToken);
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(distDir, "content-script.js"), builtClient, "utf8"),
    writeFile(path.join(distDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  ]);

  console.log("Built Chrome extension files in dist/");
  if (backend) {
    console.log(`- BACKEND overridden via MCAI_BACKEND: ${backend}`);
    console.log(`- host_permissions set to: ${manifest.host_permissions[0]}`);
  }
  if (appToken !== undefined) {
    console.log("- APP_TOKEN overridden via MCAI_APP_TOKEN");
  }
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
