const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const expectedExtensionId = "fniljchgjfbfaegpaogbddffaiadgcpo";
const extensionPath = path.resolve(__dirname, "..", "extension");
const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "resume-helper-edge-"));

async function main() {
  const context = await chromium.launchPersistentContext(profilePath, {
    channel: "msedge",
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  try {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    assert.equal(new URL(worker.url()).hostname, expectedExtensionId, "Edge loaded an unexpected extension ID");
    const response = await worker.evaluate(() => new Promise((resolve, reject) => {
      chrome.runtime.sendNativeMessage("cn.resumehelper.native", { action: "ping" }, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(result);
      });
    }));
    assert.equal(response.ok, true, response.error);
    assert.equal(response.version, "0.4.5");
    console.log(`Edge native messaging passed (extension ${expectedExtensionId}, host ${response.version})`);
  } finally {
    await context.close();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(profilePath, { recursive: true, force: true }));
