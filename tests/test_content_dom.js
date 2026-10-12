const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

// Regression fixture follows zhipin's public uiSelect/uiOption DOM classes.
async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <style>.ui-select,.radio-group,input{display:block;margin:12px;width:220px;min-height:30px}
      .ui-select-item{padding:8px;cursor:pointer}.radio-input{opacity:0;position:absolute}
      .radio{display:inline-block;width:80px;height:25px}.choice{display:inline-flex}</style>
      <div class="form-item"><label>性别</label><div class="ui-select">
        <div class="ui-select-selection" tabindex="0"><div class="ui-select-inner">
          <span class="label-text">性别</span><span class="ui-select-placeholder">请选择</span>
        </div></div><ul class="ui-select-dropdown" style="display:none">
          <li class="ui-select-item">男</li><li class="ui-select-item">女</li>
        </ul></div></div>
      <div class="form-item"><label>是否服从志愿调剂</label><input></div>
      <div class="form-item"><label>电子邮</label><input id="uncertain-email"></div>
      <div class="form-item"><label>姓名</label><input></div>
      <div class="form-item"><label>性别</label><div class="radio-group">
        <label class="radio"><input class="radio-input" type="radio" value="1"><span>男</span></label>
        <label class="radio"><input class="radio-input" type="radio" value="2"><span>女</span></label>
      </div></div>
      <div class="field-row" id="plain-radio"><span class="field-label">性别</span>
        <label class="choice"><input type="radio" value="male" checked><span>男</span></label>
        <label class="choice"><input type="radio" value="female"><span>女</span></label>
        <label class="choice"><input type="radio" value="private"><span>保密</span></label>
      </div>
      <div class="field-row" id="role-radio"><span class="field-label">性别</span>
        <button type="button" role="radio" aria-checked="true" data-default-checked="true">男</button>
        <button type="button" role="radio" aria-checked="false">女</button>
        <button type="button" role="radio" aria-checked="false">保密</button>
      </div>
      <div class="form-item"><label>登录密码</label><input type="password" value="secret"></div>
      <div class="form-item"><label>验证码</label><input value="123456"></div>
      <section class="resume-module">
        <div class="module-title"><span>在校实践</span><button type="button">添加在校实践</button></div>
        <div class="experience-record">
          <div class="form-item"><label>开始时间</label><input value=""></div>
          <div class="form-item"><label>结束时间</label><input value=""></div>
          <div class="form-item"><label><input type="checkbox">至今</label></div>
          <div class="form-item"><label>实践名称</label><input value=""></div>
          <div class="form-item"><label>实践描述</label><textarea></textarea></div>
        </div>
      </section>
      <ul><li class="ui-select-item" id="unrelated">女</li></ul>
    `);
    await page.evaluate(() => {
      window.chrome = { runtime: { onMessage: { addListener() {}, removeListener() {} } } };
      const widget = document.querySelector(".ui-select");
      widget.querySelector(".ui-select-selection").onclick = () => {
        widget.querySelector(".ui-select-dropdown").style.display = "block";
      };
      widget.querySelectorAll(".ui-select-item").forEach((option) => {
        option.onclick = () => {
          const display = widget.querySelector(".ui-select-placeholder, .ui-select-selected-value");
          display.className = "ui-select-selected-value";
          display.textContent = option.textContent;
          option.classList.add("ui-select-item-selected");
          widget.querySelector(".ui-select-dropdown").style.display = "none";
        };
      });
      document.querySelector("#unrelated").onclick = () => { window.wrongOptionClicked = true; };
      document.querySelectorAll(".radio").forEach((label) => {
        label.onclick = () => {
          document.querySelectorAll(".radio-input").forEach((input) => { input.checked = false; });
          label.querySelector("input").checked = true;
        };
      });
      document.querySelectorAll("#role-radio [role='radio']").forEach((option) => {
        option.onclick = () => {
          document.querySelectorAll("#role-radio [role='radio']").forEach((item) => item.setAttribute("aria-checked", "false"));
          option.setAttribute("aria-checked", "true");
        };
      });
    });
    const script = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
    await page.addScriptTag({ content: script });
    const data = await page.evaluate(async () => {
      const api = window.__resumeHelperTestApi;
      const profile = {
        basic: { gender: "女性", full_name: "测试姓名", email: "test@example.com" }, custom_fields: {},
        campus_experience: [{ organization: "校爱心社", role: "手语部部长", start_date: "2021-06", end_date: "2022-06", is_current: "否", description: "手语教学与公益活动" }]
      };
      const mappings = { global: {
        "basic.gender": ["性别", "gender"], "basic.full_name": ["姓名"], "basic.email": ["电子邮箱"],
        "campus_experience[].organization": ["实践名称"], "campus_experience[].start_date": ["开始时间"],
        "campus_experience[].end_date": ["结束时间"], "campus_experience[].is_current": ["至今"],
        "campus_experience[].description": ["实践描述"]
      }, sites: { "": { "开始时间": "education[].degree" } } };
      const scanned = await api.scanForm(profile, mappings);
      const filled = await api.fillForm(profile, mappings, false);
      const read = await api.scanForm(profile, mappings);
      return { scanned, filled, read, wrongOptionClicked: Boolean(window.wrongOptionClicked) };
    });
    const genderFields = data.scanned.fields.filter((field) => field.canonical === "basic.gender");
    assert.equal(genderFields.length, 4, JSON.stringify(data.scanned.fields, null, 2));
    assert.equal(data.scanned.fields.find((field) => field.type === "combobox").pageValue, "");
    assert.ok(data.scanned.fields.some((field) => field.label === "是否服从志愿调剂" && !field.canonical && !field.pageValue));
    assert.ok(data.scanned.fields.some((field) => field.label === "电子邮" && !field.canonical && field.candidate_canonical === "basic.email"));
    assert.equal(data.filled.lowConfidence.length, 1);
    assert.match(data.filled.lowConfidence[0].error, /置信度.*已放弃自动填写/);
    assert.equal(await page.locator("#uncertain-email").inputValue(), "");
    assert.ok(data.scanned.fields.filter((field) => field.importable).every((field) => !/验证码|密码/.test(field.label)));
    const campus = data.scanned.fields.filter((field) => field.context === "campus_experience");
    assert.equal(campus.length, 5);
    assert.deepEqual(campus.map((field) => field.canonical), [
      "campus_experience[].start_date", "campus_experience[].end_date", "campus_experience[].is_current",
      "campus_experience[].organization", "campus_experience[].description"
    ]);
    assert.ok(campus.every((field) => field.record_index === 0 && field.section_label === "在校实践/校园经历"));
    assert.equal(data.filled.filled, 10);
    assert.deepEqual(data.filled.failed, []);
    assert.equal(data.wrongOptionClicked, false);
    assert.ok(data.read.fields.filter((field) => field.canonical === "basic.gender").every((field) => field.pageValue === "女"));

    // Preserve a current user selection when it did not come from the page's HTML default.
    await page.evaluate(() => {
      const options = [...document.querySelectorAll("#plain-radio input[type='radio']")];
      options.forEach((option) => {
        option.removeAttribute("checked");
        option.checked = option.value === "male";
      });
    });
    const preserved = await page.evaluate(() => window.__resumeHelperTestApi.fillForm(
      { basic: { gender: "女性" }, custom_fields: {} },
      { global: { "basic.gender": ["性别", "gender"] }, sites: {} }, false
    ));
    assert.ok(preserved.skipped > 0);
    assert.equal(await page.locator("#plain-radio input[value='male']").isChecked(), true);
    assert.equal(await page.locator("#plain-radio input[value='female']").isChecked(), false);

    // Clicking a visible option without a real selection must not report success.
    await page.evaluate(() => {
      const widget = document.querySelector(".ui-select");
      const display = widget.querySelector(".ui-select-selected-value");
      display.className = "ui-select-placeholder";
      display.textContent = "请选择";
      widget.querySelectorAll(".ui-select-item").forEach((option) => {
        option.classList.remove("ui-select-item-selected");
        option.onclick = () => {};
      });
    });
    const rejected = await page.evaluate(() => window.__resumeHelperTestApi.fillForm(
      { basic: { gender: "女" }, custom_fields: {} },
      { global: { "basic.gender": ["性别"] }, sites: {} }, false
    ));
    assert.equal(rejected.filled, 0);
    assert.equal(rejected.failed.length, 1);
    assert.match(rejected.failed[0].error, /未确认选择/);

    // Extension re-injection must replace its handler rather than register twice.
    await page.evaluate(() => {
      window.__resumeHelperContentLoaded = "0.3.2";
      window.removedHandlers = 0;
      window.addedHandlers = 0;
      chrome.runtime.onMessage.removeListener = () => { window.removedHandlers += 1; };
      chrome.runtime.onMessage.addListener = () => { window.addedHandlers += 1; };
    });
    await page.addScriptTag({ content: script });
    await page.addScriptTag({ content: script });
    assert.deepEqual(await page.evaluate(() => [window.removedHandlers, window.addedHandlers]), [1, 1]);
    console.log("Edge DOM tests passed (ui-select, radio, safe import, extension upgrade)");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
