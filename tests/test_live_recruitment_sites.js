const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const SHEIN_JOB_URL = "https://job-boards.greenhouse.io/shein/jobs/5408568008";

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await page.exposeFunction("__resumeHelperTrustedInput", async (message) => {
      const safeTargetId = String(message.targetId || "").replace(/[^a-z0-9-]/gi, "");
      const selector = `[data-resume-helper-target="${safeTargetId}"]`;
      const mouseClick = async (point) => {
        const params = { x: point.x, y: point.y, button: "left", clickCount: 1 };
        await cdp.send("Input.dispatchMouseEvent", { ...params, type: "mouseMoved", button: "none" });
        await cdp.send("Input.dispatchMouseEvent", { ...params, type: "mousePressed" });
        await cdp.send("Input.dispatchMouseEvent", { ...params, type: "mouseReleased" });
      };
      const replaceText = async (text) => {
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        for (const character of String(text || "")) {
          await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: character, text: character, unmodifiedText: character });
          await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: character });
        }
      };
      const elementPoint = async () => {
        const position = await cdp.send("Runtime.evaluate", {
          expression: `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; element.scrollIntoView({ block: "center", inline: "nearest" }); const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
          returnByValue: true
        });
        return position.result.value;
      };
      if (message.action === "click") {
        await mouseClick(await elementPoint());
      } else if (message.action === "replaceText") {
        await cdp.send("Runtime.evaluate", {
          expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`
        });
        await replaceText(message.text);
      } else if (message.action === "selectOption") {
        const wanted = Array.isArray(message.values) && message.values.length ? message.values : [message.text];
        const findOption = async () => {
          const found = await cdp.send("Runtime.evaluate", {
            expression: `(() => { const clean = value => String(value || "").toLowerCase().replace(/[\\s\\u00a0:*：?？!！,，.。;；()（）\\[\\]【】_\\-\\/\\\\]/g, ""); const wanted = ${JSON.stringify(wanted)}.map(clean).filter(Boolean); const options = [...document.querySelectorAll("[role='option']")].filter(item => { const style = getComputedStyle(item); const rect = item.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0 && item.getAttribute("aria-disabled") !== "true"; }); let best = null; let bestScore = 0; for (const option of options) { const value = clean(option.getAttribute("aria-label") || option.getAttribute("title") || option.textContent); for (const target of wanted) { const score = value === target ? 1000 : (value.includes(target) || target.includes(value)) ? 700 - Math.abs(value.length - target.length) : 0; if (score > bestScore) { best = option; bestScore = score; } } } if (!best || bestScore < 430) return null; best.scrollIntoView({ block: "nearest" }); const rect = best.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
            returnByValue: true
          });
          return found.result.value;
        };
        let option = await findOption();
        if (!option) {
          await mouseClick(await elementPoint());
          await new Promise((resolve) => setTimeout(resolve, 200));
          option = await findOption();
        }
        if (!option) {
          await cdp.send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)})?.focus()` });
          await replaceText(message.text);
          for (let attempt = 0; attempt < 24 && !option; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            option = await findOption();
          }
        }
        if (!option) return { ok: true, result: { performed: false } };
        await mouseClick(option);
      }
      return { ok: true, result: { performed: true } };
    });
    await page.addInitScript(() => {
      window.chrome = { runtime: {
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage(message, callback) {
          window.__resumeHelperTrustedInput(message).then(callback);
        }
      } };
    });
    await page.goto(process.env.LIVE_RECRUITMENT_URL || SHEIN_JOB_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await page.getByRole("heading", { name: /Apply for this job/i }).waitFor({ timeout: 30000 });

    const script = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
    await page.addScriptTag({ content: script });

    const result = await page.evaluate(async () => {
      const profile = {
        basic: {},
        education: [{
          school: "Harvard University",
          degree: "Master's Degree",
          start_date: "2022-09",
          end_date: "2024-06"
        }],
        custom_fields: {}
      };
      const mappings = { global: {
        "education[].school": ["学校", "School", "Institution", "University"],
        "education[].degree": ["学历", "Degree", "Education Level"],
        "education[].start_date": ["入学时间", "Start Date", "From"],
        "education[].end_date": ["毕业时间", "End Date", "To"]
      }, sites: {} };
      const scanned = await window.__resumeHelperTestApi.scanForm(profile, mappings);
      const filled = await window.__resumeHelperTestApi.fillForm(profile, mappings, true);
      const read = await window.__resumeHelperTestApi.scanForm(profile, mappings);
      return { scanned, filled, read };
    });

    const educationFields = result.scanned.fields.filter((field) => field.canonical.startsWith("education[]"));
    const canonicalCounts = educationFields.reduce((counts, field) => {
      counts[field.canonical] = (counts[field.canonical] || 0) + 1;
      return counts;
    }, {});
    assert.equal(canonicalCounts["education[].school"], 1, JSON.stringify(educationFields, null, 2));
    assert.equal(canonicalCounts["education[].degree"], 1, JSON.stringify(educationFields, null, 2));
    assert.equal(canonicalCounts["education[].start_date"], 2, JSON.stringify(educationFields, null, 2));
    assert.equal(canonicalCounts["education[].end_date"], 2, JSON.stringify(educationFields, null, 2));

    const educationFailures = result.filled.failed.filter((field) => field.canonical.startsWith("education[]"));
    assert.deepEqual(educationFailures, [], JSON.stringify(result.filled, null, 2));
    assert.equal(result.filled.filledFields.filter((field) => field.canonical.startsWith("education[]")).length, 6);

    const pageValues = Object.fromEntries(result.read.fields
      .filter((field) => field.canonical.startsWith("education[]"))
      .map((field) => [field.label, field.pageValue]));
    assert.ok(Object.values(pageValues).every(Boolean), JSON.stringify(pageValues, null, 2));
    console.log("live recruitment test passed (SHEIN/Greenhouse education fields, no submission)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
