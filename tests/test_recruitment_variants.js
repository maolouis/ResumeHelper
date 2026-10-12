const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <style>
        input,.arco-select,.ant-picker,[role='radiogroup']{display:block;width:240px;min-height:30px;margin:8px}
        .arco-select-option{display:block;padding:6px}.field-item{margin:12px}
      </style>
      <div class="arco-form-item">
        <div class="arco-form-label">毕业学校</div>
        <input data-field="graduateSchool" placeholder="请输入院校名称">
      </div>
      <div class="semi-form-field">
        <span class="semi-form-field-label">最高学历</span>
        <div id="degree-select" class="arco-select" role="combobox" aria-haspopup="listbox">
          <input placeholder="请选择学历" readonly>
        </div>
        <div id="degree-options" style="display:none">
          <div class="arco-select-option" role="option">本科</div>
          <div class="arco-select-option" role="option">硕士研究生</div>
          <div class="arco-select-option" role="option">博士研究生</div>
        </div>
      </div>
      <div class="ant-form-item">
        <label class="ant-form-item-label">毕业时间</label>
        <div class="ant-picker"><input placeholder="YYYY-MM"></div>
      </div>
      <div class="field-item">
        <span class="field-label">性别</span>
        <div role="radiogroup">
          <button type="button" role="radio" aria-checked="false">男</button>
          <button type="button" role="radio" aria-checked="false">女</button>
        </div>
      </div>
      <div class="field-item">
        <label>Start date month</label>
        <div id="start-month-select" class="arco-select" role="combobox" aria-haspopup="listbox">
          <input placeholder="Select month" readonly>
        </div>
        <div id="start-month-options" style="display:none">
          <div class="arco-select-option" role="option">August</div>
          <div class="arco-select-option" role="option">September</div>
        </div>
      </div>
      <div class="field-item">
        <label for="start-year">Start date year</label>
        <input id="start-year" type="number">
      </div>
    `);
    await page.evaluate(() => {
      window.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} } } };
      const select = document.querySelector("#degree-select");
      const options = document.querySelector("#degree-options");
      select.onclick = () => { options.style.display = "block"; };
      options.querySelectorAll("[role='option']").forEach((option) => {
        option.onclick = () => {
          options.querySelectorAll("[role='option']").forEach((item) => item.classList.remove("arco-select-option-selected"));
          option.classList.add("arco-select-option-selected");
          select.querySelector("input").value = option.textContent;
          options.style.display = "none";
        };
      });
      const startMonth = document.querySelector("#start-month-select");
      const startMonthOptions = document.querySelector("#start-month-options");
      startMonth.onclick = () => { startMonthOptions.style.display = "block"; };
      startMonthOptions.querySelectorAll("[role='option']").forEach((option) => {
        option.onclick = () => {
          startMonthOptions.querySelectorAll("[role='option']").forEach((item) => item.classList.remove("arco-select-option-selected"));
          option.classList.add("arco-select-option-selected");
          startMonth.querySelector("input").value = option.textContent;
          startMonthOptions.style.display = "none";
        };
      });
      document.querySelectorAll("[role='radio']").forEach((option) => {
        option.onclick = () => {
          document.querySelectorAll("[role='radio']").forEach((item) => item.setAttribute("aria-checked", "false"));
          option.setAttribute("aria-checked", "true");
        };
      });
    });
    const script = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
    await page.addScriptTag({ content: script });
    const result = await page.evaluate(async () => {
      const profile = {
        basic: { gender: "女性" },
        education: [
          { school: "示例本科大学", degree: "本科", start_date: "2018-09", end_date: "2022-06" },
          { school: "示例研究生大学", degree: "硕士", end_date: "2025-06" }
        ],
        custom_fields: {}
      };
      const mappings = { global: {
        "basic.gender": ["性别", "gender"],
        "education[].school": ["学校", "学校名称", "毕业学校", "毕业院校"],
        "education[].degree": ["学历", "最高学历"],
        "education[].start_date": ["入学时间", "Start Date"],
        "education[].end_date": ["毕业时间", "毕业日期", "毕业年月"]
      }, sites: {} };
      const scanned = await window.__resumeHelperTestApi.scanForm(profile, mappings);
      const filled = await window.__resumeHelperTestApi.fillForm(profile, mappings, true);
      const read = await window.__resumeHelperTestApi.scanForm(profile, mappings);
      return { scanned, filled, read };
    });

    const targetFields = result.scanned.fields.filter((field) => [
      "education[].school", "education[].degree", "education[].end_date", "basic.gender"
    ].includes(field.canonical));
    assert.equal(targetFields.length, 4, JSON.stringify(result.scanned.fields, null, 2));
    assert.ok(targetFields.every((field) => field.confidence >= 0.99));
    assert.equal(result.filled.filled, 6, JSON.stringify(result.filled, null, 2));
    assert.deepEqual(result.filled.failed, []);
    assert.equal(await page.locator("[data-field='graduateSchool']").inputValue(), "示例研究生大学");
    assert.equal(await page.locator("#degree-select input").inputValue(), "硕士研究生");
    assert.equal(await page.locator(".ant-picker input").inputValue(), "2025-06");
    assert.equal(await page.locator("[role='radio'][aria-checked='true']").textContent(), "女");
    assert.equal(await page.locator("#start-month-select input").inputValue(), "September");
    assert.equal(await page.locator("#start-year").inputValue(), "2018");
    assert.ok(result.read.fields.filter((field) => targetFields.some((target) => target.canonical === field.canonical)).every((field) => field.pageValue));
    console.log("recruitment variants passed (school, highest degree, graduation date, gender)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
