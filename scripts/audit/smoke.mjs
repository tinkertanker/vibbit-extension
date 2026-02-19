import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import {
  assertFileExists,
  buildMarkdownTable,
  createAuditRunDir,
  repoRoot,
  runCommand,
  trimForTable,
  writeText
} from "./utils.mjs";

const runDir = await createAuditRunDir("smoke");
const screenshots = {
  makecode: path.join(runDir, "01-makecode-page.png"),
  panel: path.join(runDir, "02-panel-visible.png"),
  managed: path.join(runDir, "03-managed-mode.png"),
  byok: path.join(runDir, "04-byok-mode.png"),
  status: path.join(runDir, "05-log-or-status.png"),
  error: path.join(runDir, "99-error.png")
};

const checks = [];
let overallPass = true;

function pushCheck(step, pass, detail) {
  checks.push({ step, result: pass ? "PASS" : "FAIL", detail: trimForTable(detail) });
  if (!pass) overallPass = false;
}

async function runBuildAndPackage() {
  await runCommand("npm", ["run", "build"], { cwd: repoRoot });
  await runCommand("npm", ["run", "package"], { cwd: repoRoot });
  await assertFileExists(path.join(repoRoot, "dist", "content-script.js"));
  await assertFileExists(path.join(repoRoot, "dist", "manifest.json"));
  await assertFileExists(path.join(repoRoot, "artifacts", "vibbit-extension.zip"));
  pushCheck("Build + package", true, "`npm run build` and `npm run package` succeeded; expected artefacts exist.");
}

async function runSmokeUi() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // Ignore storage access errors.
      }
    });

    await page.goto("https://makecode.microbit.org/", { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: screenshots.makecode, fullPage: false });
    pushCheck("01 MakeCode loads", true, `Screenshot saved at \`${screenshots.makecode}\`.`);

    const runtime = await readFile(path.join(repoRoot, "work.js"), "utf8");
    await page.addScriptTag({ content: runtime });
    await page.waitForSelector("#vibbit-fab", { timeout: 20000 });
    await page.click("#vibbit-fab");
    await page.waitForSelector("#setup-go", { timeout: 20000 });
    await page.screenshot({ path: screenshots.panel, fullPage: false });

    const panelVisible = await page.evaluate(() => {
      const panel = document.querySelector("#vibbit-panel");
      const setupView = document.querySelector("#bv-setup");
      if (!panel || !setupView) return false;
      const panelRect = panel.getBoundingClientRect();
      const setupStyle = getComputedStyle(setupView);
      return panelRect.width > 0 && panelRect.height > 0 && setupStyle.display !== "none";
    });
    pushCheck(
      "02 Panel visible",
      panelVisible,
      panelVisible
        ? `Panel rendered and screenshot saved at \`${screenshots.panel}\`.`
        : "Panel controls were not visible after injecting `work.js`."
    );

    const setupDefault = await page.evaluate(() => {
      const mode = document.querySelector("#setup-mode");
      const byokProvider = document.querySelector("#setup-byok-provider");
      const byokModel = document.querySelector("#setup-byok-model");
      const byokKey = document.querySelector("#setup-byok-key");
      const managedServer = document.querySelector("#setup-managed-server");
      return {
        modeValue: mode ? mode.value : "",
        byokProviderVisible: byokProvider ? getComputedStyle(byokProvider).display !== "none" : false,
        byokModelVisible: byokModel ? getComputedStyle(byokModel).display !== "none" : false,
        byokKeyVisible: byokKey ? getComputedStyle(byokKey).display !== "none" : false,
        managedServerHidden: managedServer ? getComputedStyle(managedServer).display === "none" : false
      };
    });
    pushCheck(
      "03 Setup defaults",
      setupDefault.modeValue === "byok"
        && setupDefault.byokProviderVisible
        && setupDefault.byokModelVisible
        && setupDefault.byokKeyVisible
        && setupDefault.managedServerHidden,
      `mode=${setupDefault.modeValue}, byokProviderVisible=${setupDefault.byokProviderVisible}, byokModelVisible=${setupDefault.byokModelVisible}, byokKeyVisible=${setupDefault.byokKeyVisible}, managedServerHidden=${setupDefault.managedServerHidden}.`
    );

    await page.selectOption("#setup-mode", "managed");
    await page.waitForTimeout(400);
    const managedState = await page.evaluate(() => {
      const mode = document.querySelector("#setup-mode");
      const byokProvider = document.querySelector("#setup-byok-provider");
      const byokModel = document.querySelector("#setup-byok-model");
      const byokKey = document.querySelector("#setup-byok-key");
      const managedServer = document.querySelector("#setup-managed-server");
      return {
        modeValue: mode ? mode.value : "",
        byokProviderHidden: byokProvider ? getComputedStyle(byokProvider).display === "none" : false,
        byokModelHidden: byokModel ? getComputedStyle(byokModel).display === "none" : false,
        byokKeyHidden: byokKey ? getComputedStyle(byokKey).display === "none" : false,
        managedServerVisible: managedServer ? getComputedStyle(managedServer).display !== "none" : false
      };
    });
    await page.screenshot({ path: screenshots.managed, fullPage: false });
    pushCheck(
      "04 Setup mode toggle (managed)",
      managedState.modeValue === "managed"
        && managedState.byokProviderHidden
        && managedState.byokModelHidden
        && managedState.byokKeyHidden
        && managedState.managedServerVisible,
      `mode=${managedState.modeValue}, byokProviderHidden=${managedState.byokProviderHidden}, byokModelHidden=${managedState.byokModelHidden}, byokKeyHidden=${managedState.byokKeyHidden}, managedServerVisible=${managedState.managedServerVisible}.`
    );

    await page.selectOption("#setup-mode", "byok");
    await page.waitForTimeout(300);
    const byokState = await page.evaluate(() => {
      const mode = document.querySelector("#setup-mode");
      const byokProvider = document.querySelector("#setup-byok-provider");
      const byokModel = document.querySelector("#setup-byok-model");
      const byokKey = document.querySelector("#setup-byok-key");
      const managedServer = document.querySelector("#setup-managed-server");
      return {
        modeValue: mode ? mode.value : "",
        byokProviderVisible: byokProvider ? getComputedStyle(byokProvider).display !== "none" : false,
        byokModelVisible: byokModel ? getComputedStyle(byokModel).display !== "none" : false,
        byokKeyVisible: byokKey ? getComputedStyle(byokKey).display !== "none" : false,
        managedServerHidden: managedServer ? getComputedStyle(managedServer).display === "none" : false
      };
    });
    await page.screenshot({ path: screenshots.byok, fullPage: false });
    pushCheck(
      "05 Setup mode toggle (BYOK)",
      byokState.modeValue === "byok"
        && byokState.byokProviderVisible
        && byokState.byokModelVisible
        && byokState.byokKeyVisible
        && byokState.managedServerHidden,
      `mode=${byokState.modeValue}, byokProviderVisible=${byokState.byokProviderVisible}, byokModelVisible=${byokState.byokModelVisible}, byokKeyVisible=${byokState.byokKeyVisible}, managedServerHidden=${byokState.managedServerHidden}.`
    );

    await page.selectOption("#setup-mode", "managed");
    await page.fill("#setup-server", "vibbit.tk.sg");
    await page.click("#setup-go");
    await page.waitForSelector("#go", { timeout: 20000 });

    await page.evaluate(() => {
      if (!window.__smokeMonacoStub) {
        const model = {
          __value: "",
          getValue() {
            return this.__value;
          },
          setValue(next) {
            this.__value = String(next || "");
            window.__smokeMonacoValue = this.__value;
          }
        };
        const editor = {
          getModel() {
            return model;
          },
          setPosition() {}
        };
        window.monaco = {
          editor: {
            getModels() {
              return [model];
            },
            getEditors() {
              return [editor];
            }
          }
        };
        window.__smokeMonacoStub = true;
      }

      if (!window.__smokeFetchMock) {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === "string" ? input : (input && input.url ? input.url : "");
          if (url.includes("/vibbit/generate")) {
            return Promise.resolve(new Response(JSON.stringify({
              code: "basic.showString(\"Hi\")",
              feedback: ["smoke-managed"]
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }));
          }
          return nativeFetch(input, init);
        };
        window.__smokeFetchMock = true;
      }
    });

    await page.fill("#p", "");
    await page.click("#go");
    await page.waitForTimeout(1000);

    const statusState = await page.evaluate(() => {
      const status = document.querySelector("#status")?.textContent?.trim() || "";
      const logText = document.querySelector("#log")?.textContent || "";
      return { status, logText };
    });

    await page.screenshot({ path: screenshots.status, fullPage: false });
    pushCheck(
      "06 Empty prompt feedback",
      statusState.status === "Idle" && statusState.logText.includes("Please enter a request."),
      `status='${statusState.status}', logHasPromptValidation=${statusState.logText.includes("Please enter a request.")}.`
    );

    await page.fill("#p", "Create a tiny managed program");
    await page.click("#go");
    await page.waitForFunction(() => {
      const status = document.querySelector("#status")?.textContent?.trim() || "";
      return status === "Done" || status === "Error";
    }, { timeout: 30000 });

    const generationState = await page.evaluate(() => {
      const status = document.querySelector("#status")?.textContent?.trim() || "";
      const logText = document.querySelector("#log")?.textContent || "";
      const pastedCode = window.__smokeMonacoValue || "";
      return { status, logText, pastedCode };
    });

    pushCheck(
      "07 Managed mocked generation",
      generationState.status === "Done"
        && generationState.logText.includes("Pasted and switched back to Blocks.")
        && generationState.pastedCode.includes("basic.showString(\"Hi\")"),
      `status='${generationState.status}', pastedCodeIncludesExpected=${generationState.pastedCode.includes("basic.showString(\"Hi\")")}, logHasPasteSuccess=${generationState.logText.includes("Pasted and switched back to Blocks.")}.`
    );

    const hasProbeLog = /Live decompile check (passed|unavailable|failed)/i.test(generationState.logText);
    pushCheck(
      "08 Decompile probe log",
      hasProbeLog,
      `logHasProbeMessage=${hasProbeLog}.`
    );
  } catch (error) {
    try {
      await page.screenshot({ path: screenshots.error, fullPage: true });
    } catch {
      // Keep primary failure instead of screenshot failure.
    }
    pushCheck("UI smoke execution", false, error && error.message ? error.message : String(error));
  } finally {
    await browser.close();
  }
}

await runBuildAndPackage();
await runSmokeUi();

const reportPath = path.join(runDir, "REPORT.md");
const screenshotList = [
  screenshots.makecode,
  screenshots.panel,
  screenshots.managed,
  screenshots.byok,
  screenshots.status
].map((filePath) => `- \`${filePath}\``);

const report = [
  "# Playwright Smoke Audit",
  "",
  `- Date: ${new Date().toISOString()}`,
  `- Run directory: \`${runDir}\``,
  "",
  "## Checks",
  "",
  buildMarkdownTable(checks),
  "",
  "## Screenshots",
  "",
  ...screenshotList,
  "",
  "## Runtime source",
  "",
  `- \`${path.join(repoRoot, "work.js")}\``,
  "",
  "## Outcome",
  "",
  overallPass ? "PASS" : "FAIL"
].join("\n");

await writeText(reportPath, report + "\n");

console.log(`SUMMARY: ${overallPass ? "PASS" : "FAIL"}`);
console.log(`ARTEFACT_DIR: ${runDir}`);
console.log(`REPORT: ${reportPath}`);
console.log(`SCREENSHOTS: ${Object.values(screenshots).slice(0, 5).join(",")}`);

if (!overallPass) {
  process.exitCode = 1;
}
