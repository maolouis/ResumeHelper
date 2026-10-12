/**
 * 批量中文招聘网站兼容性测试
 *
 * 对每个目标网站：
 *   1. 加载页面（不登录、不点提交、不上传文件）
 *   2. 注入 extension/content.js
 *   3. 运行 scanForm，统计控件数、匹配数、错误
 *   4. 若页面存在可见表单控件且属于匿名申请表单，运行一次 fillForm 并回读
 *   5. 把结果写入 tests/reports/chinese-sites-<timestamp>.json
 *
 * 环境变量：
 *   BATCH_FILTER   仅测试 URL 中包含该字符串的站点（调试用）
 *   BATCH_TIMEOUT  每个站点毫秒超时，默认 45000
 *   BATCH_HEADLESS 默认 true；设为 0 可在有头模式下观察
 */

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

// ── 30+ 中文招聘网站 / ATS 目标 ──────────────────────────────────────────────
// kind:
//   "ats"     = 第三方 ATS（Greenhouse/Lever/Ashby 等），通常匿名可见申请表单
//   "corp"    = 企业自建招聘门户，多数需登录后才显示申请表单
//   "board"   = 招聘聚合站（智联/BOSS/猎聘等），几乎全部需登录
//   "gov"     = 国企/事业单位/公共招聘平台
const SITES = [
  // ── 第三方 ATS（匿名可访问申请表单） ──
  { name: "SHEIN (Greenhouse)", url: "https://job-boards.greenhouse.io/shein/", kind: "ats", fill: true },
  { name: "PingCAP (Greenhouse)", url: "https://job-boards.greenhouse.io/pingcap/", kind: "ats", fill: true },
  { name: "Anker (Greenhouse)", url: "https://job-boards.greenhouse.io/anker/", kind: "ats", fill: true },
  { name: "Greenhouse 示例职位-SHEIN", url: "https://job-boards.greenhouse.io/shein/jobs/5408568008", kind: "ats", fill: true },

  // ── 头部互联网企业自建招聘门户 ──
  { name: "字节跳动招聘", url: "https://jobs.bytedance.com/", kind: "corp" },
  { name: "腾讯招聘", url: "https://careers.tencent.com/", kind: "corp" },
  { name: "阿里巴巴招聘", url: "https://careers.alibaba.com/", kind: "corp" },
  { name: "美团招聘", url: "https://zhaopin.meituan.com/", kind: "corp" },
  { name: "京东招聘", url: "https://zhaopin.jd.com/home", kind: "corp" },
  { name: "百度招聘", url: "https://talent.baidu.com/", kind: "corp" },
  { name: "网易招聘", url: "https://hr.163.com/", kind: "corp" },
  { name: "小米招聘", url: "https://hr.xiaomi.com/", kind: "corp" },
  { name: "华为招聘", url: "https://career.huawei.com/reccampportal/portal5/index.html", kind: "corp" },
  { name: "快手招聘", url: "https://zhaopin.kuaishou.cn/", kind: "corp" },
  { name: "滴滴招聘", url: "https://talent.didiglobal.com/", kind: "corp" },
  { name: "B站招聘", url: "https://jobs.bilibili.com/", kind: "corp" },
  { name: "小红书招聘", url: "https://job.xiaohongshu.com/", kind: "corp" },
  { name: "拼多多招聘", url: "https://careers.pinduoduo.com/", kind: "corp" },
  { name: "米哈游招聘", url: "https://campus.mihoyo.com/", kind: "corp" },

  // ── 新能源 / 制造 ──
  { name: "蔚来招聘", url: "https://campus.nio.com/", kind: "corp" },
  { name: "小鹏汽车招聘", url: "https://xiaopeng.jobs.feishu.cn/", kind: "corp" },
  { name: "理想汽车招聘", url: "https://www.lixiang.com/job/list.html", kind: "corp" },
  { name: "比亚迪招聘", url: "https://job.byd.com/", kind: "corp" },
  { name: "大疆招聘", url: "https://we.dji.com/zh-CN/campus/", kind: "corp" },
  { name: "格力电器招聘", url: "https://www.gree.com/cn/careers/", kind: "corp" },

  // ── 金融 / 银行 ──
  { name: "招商银行招聘", url: "https://career.cmbchina.com/", kind: "corp" },
  { name: "工商银行招聘", url: "https://job.icbc.com.cn/", kind: "corp" },
  { name: "中国人民大学就业网", url: "https://career.ruc.edu.cn/", kind: "gov" },

  // ── 国企 / 公共招聘平台 ──
  { name: "国家电网招聘", url: "https://zhaopin.sgcc.com.cn/", kind: "gov" },
  { name: "国聘", url: "https://www.iguopin.com/", kind: "gov" },
  { name: "中国公共招聘网", url: "http://job.mohrss.gov.cn/", kind: "gov" },
  { name: "中国国家人才网", url: "https://www.newjobs.com.cn/", kind: "gov" },
  { name: "事业单位招聘平台", url: "https://www.sydwgkzp.cn/", kind: "gov" },

  // ── 招聘聚合站 ──
  { name: "智联招聘", url: "https://www.zhaopin.com/", kind: "board" },
  { name: "前程无忧51job", url: "https://www.51job.com/", kind: "board" },
  { name: "猎聘", url: "https://www.liepin.com/", kind: "board" },
  { name: "BOSS直聘", url: "https://www.zhipin.com/", kind: "board" },
  { name: "拉勾网", url: "https://www.lagou.com/", kind: "board" },
  { name: "实习僧", url: "https://www.shixiseng.com/", kind: "board" },
  { name: "牛客网", url: "https://www.nowcoder.com/", kind: "board" },
  { name: "海投网", url: "https://www.haitou.cc/", kind: "board" },

  // ── 外企 / 四大 ──
  { name: "微软中国招聘", url: "https://careers.microsoft.com/zh-cn/", kind: "corp" },
  { name: "亚马逊Jobs", url: "https://www.amazon.jobs/zh", kind: "ats" },
  { name: "普华永道招聘", url: "https://www.pwccn.com/zh/careers/", kind: "corp" },
  { name: "德勤招聘", url: "https://www2.deloitte.com/cn/zh/careers.html", kind: "corp" },
  { name: "EY安永招聘", url: "https://careers.ey.com/ey/", kind: "corp" },
  { name: "毕马威招聘", url: "https://kpmg.com/cn/zh/home/careers.html", kind: "corp" }
];

const FAKE_PROFILE = {
  basic: {
    full_name: "Zhang San",
    phone: "13800138000",
    email: "test@example.com",
    gender: "Male",
    birth_date: "2000-01"
  },
  education: [{
    school: "Harvard University",
    degree: "Bachelor's Degree",
    major: "Computer Science",
    start_date: "2018-09",
    end_date: "2022-06"
  }],
  work_experience: [{
    company: "Example Corp",
    position: "Software Engineer",
    start_date: "2022-07",
    end_date: "2024-08",
    description: "Software development"
  }],
  custom_fields: {}
};

const FAKE_MAPPINGS = {
  global: {
    "basic.full_name": ["姓名", "名字", "Full Name", "Name"],
    "basic.phone": ["手机", "电话", "联系方式", "Phone", "Mobile"],
    "basic.email": ["邮箱", "Email", "E-mail", "电子邮箱"],
    "basic.gender": ["性别", "Gender", "Sex"],
    "education[].school": ["学校", "毕业院校", "School", "Institution", "University"],
    "education[].degree": ["学历", "学位", "Degree", "Education Level"],
    "education[].major": ["专业", "Major", "Field of Study"],
    "education[].start_date": ["入学时间", "开始时间", "Start Date", "From"],
    "education[].end_date": ["毕业时间", "结束时间", "End Date", "To"],
    "work_experience[].company": ["公司", "Employer", "Company"],
    "work_experience[].position": ["职位", "岗位", "Position", "Job Title", "Role"],
    "work_experience[].start_date": ["入职时间", "Start Date", "From"],
    "work_experience[].end_date": ["离职时间", "End Date", "To"]
  },
  sites: {}
};

async function testSite(browser, site, timeoutMs) {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    viewport: { width: 1366, height: 900 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    ignoreHTTPSErrors: true
  });

  const page = await context.newPage();
  const jsErrors = [];
  const requestFailures = [];

  page.on("pageerror", (error) => {
    jsErrors.push(String(error.message || error).slice(0, 500));
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    if (failure && /net::|timed?out/i.test(failure.errorText || "")) {
      requestFailures.push(`${request.method()} ${request.url().slice(0, 120)}: ${failure.errorText}`);
    }
  });

  // CDP trusted-input bridge（与 test_live_recruitment_sites.js 一致的完整实现）
  const cdp = await context.newCDPSession(page);
  await page.exposeFunction("__resumeHelperTrustedInput", async (message) => {
    const safeTargetId = String(message.targetId || "").replace(/[^a-z0-9-]/gi, "");
    const selector = `[data-resume-helper-target="${safeTargetId}"]`;
    const mouseClick = async (point) => {
      if (!point) return;
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
        if (window.__resumeHelperTrustedInput) {
          window.__resumeHelperTrustedInput(message).then(callback);
        } else {
          callback?.({ ok: true, result: { performed: false } });
        }
      }
    } };
  });

  const result = {
    name: site.name,
    url: site.url,
    kind: site.kind,
    status: "unknown",
    http_status: null,
    title: "",
    final_url: "",
    controls: 0,
    matched: 0,
    ready: 0,
    js_errors: [],
    request_failures: requestFailures.slice(0, 5),
    fill_attempted: false,
    fill: null,
    notes: []
  };

  try {
    const response = await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs
    });
    result.http_status = response ? response.status() : null;
    result.final_url = page.url();

    // 给 SPA 一点渲染时间
    await page.waitForTimeout(3000).catch(() => {});

    result.title = await page.title().catch(() => "");

    // 注入 content.js
    const scriptPath = path.join(__dirname, "..", "extension", "content.js");
    const scriptContent = fs.readFileSync(scriptPath, "utf8");

    try {
      await page.addScriptTag({ content: scriptContent });
    } catch (error) {
      result.notes.push(`content.js 注入失败: ${error.message}`);
    }

    await page.waitForTimeout(1000).catch(() => {});

    // 运行 scanForm
    try {
      const scanResult = await page.evaluate(async ({ profile, mappings }) => {
        if (!window.__resumeHelperTestApi) {
          return { error: "TestApi 未挂载" };
        }
        return await window.__resumeHelperTestApi.scanForm(profile, mappings);
      }, { profile: FAKE_PROFILE, mappings: FAKE_MAPPINGS });

      if (scanResult.error) {
        result.notes.push(`scanForm 错误: ${scanResult.error}`);
      } else {
        result.controls = scanResult.total || 0;
        result.matched = scanResult.matched || 0;
        result.ready = scanResult.ready || 0;
        result.sample_labels = (scanResult.fields || []).slice(0, 15).map((f) => ({
          label: f.label,
          canonical: f.canonical || "",
          type: f.type || ""
        }));
      }
    } catch (error) {
      result.notes.push(`scanForm 异常: ${error.message}`);
    }

    // 对标记 fill=true 且确实有控件的 ATS 站点尝试 fillForm（不提交）
    if (site.fill && result.controls > 0) {
      result.fill_attempted = true;
      try {
        const fillResult = await page.evaluate(async ({ profile, mappings }) => {
          if (!window.__resumeHelperTestApi) return { error: "TestApi 未挂载" };
          return await window.__resumeHelperTestApi.fillForm(profile, mappings, true);
        }, { profile: FAKE_PROFILE, mappings: FAKE_MAPPINGS });

        if (fillResult.error) {
          result.fill = { error: fillResult.error };
        } else {
          result.fill = {
            total: fillResult.total,
            filled: fillResult.filled,
            skipped: fillResult.skipped,
            failed: fillResult.failed?.slice(0, 10) || [],
            low_confidence: fillResult.lowConfidence?.length || 0,
            unmatched: fillResult.unmatched?.length || 0
          };
        }
      } catch (error) {
        result.fill = { error: error.message };
      }
    }

    result.status = "loaded";
  } catch (error) {
    result.status = "failed";
    result.notes.push(`页面加载失败: ${error.message}`);
  } finally {
    result.js_errors = jsErrors.slice(0, 10);
    await context.close().catch(() => {});
  }

  return result;
}

async function main() {
  const filter = process.env.BATCH_FILTER || "";
  const timeoutMs = Number(process.env.BATCH_TIMEOUT || 45000);
  const headless = process.env.BATCH_HEADLESS !== "0";

  let sites = SITES;
  if (filter) {
    sites = sites.filter((s) => s.name.includes(filter) || s.url.includes(filter));
  }

  console.log(`\n=== 批量中文招聘网站测试 ===`);
  console.log(`目标站点: ${sites.length} 个`);
  console.log(`超时: ${timeoutMs}ms | headless: ${headless}\n`);

  const browser = await chromium.launch({
    channel: "msedge",
    headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
  });

  const results = [];
  const startedAt = Date.now();

  for (let i = 0; i < sites.length; i += 1) {
    const site = sites[i];
    process.stdout.write(`[${i + 1}/${sites.length}] ${site.name} ... `);
    const result = await testSite(browser, site, timeoutMs);
    results.push(result);
    const fillInfo = result.fill_attempted
      ? ` | filled=${result.fill?.filled ?? "?"} failed=${result.fill?.failed?.length ?? "?"}`
      : "";
    console.log(`${result.status} | controls=${result.controls} matched=${result.matched}${fillInfo}${result.js_errors.length ? ` | jsErrors=${result.js_errors.length}` : ""}`);
  }

  await browser.close();

  // 汇总
  const summary = {
    generated_at: new Date().toISOString(),
    duration_sec: Math.round((Date.now() - startedAt) / 1000),
    total_sites: results.length,
    loaded: results.filter((r) => r.status === "loaded").length,
    failed: results.filter((r) => r.status === "failed").length,
    with_controls: results.filter((r) => r.controls > 0).length,
    with_js_errors: results.filter((r) => r.js_errors.length > 0).length,
    total_controls: results.reduce((sum, r) => sum + r.controls, 0),
    total_matched: results.reduce((sum, r) => sum + r.matched, 0),
    fill_results: results.filter((r) => r.fill).map((r) => ({ name: r.name, ...r.fill }))
  };

  const reportDir = path.join(__dirname, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = path.join(reportDir, `chinese-sites-${stamp}.json`);

  fs.writeFileSync(reportPath, JSON.stringify({ summary, results }, null, 2), "utf8");

  console.log(`\n=== 汇总 ===`);
  console.log(`加载成功: ${summary.loaded}/${summary.total_sites}`);
  console.log(`有表单控件: ${summary.with_controls}`);
  console.log(`出现 JS 错误: ${summary.with_js_errors}`);
  console.log(`总控件数: ${summary.total_controls} | 已匹配: ${summary.total_matched}`);
  console.log(`报告: ${reportPath}\n`);

  // 输出需要关注的问题
  const problems = results.filter((r) =>
    r.status === "failed" || r.js_errors.length > 0 || (r.fill && r.fill.error)
  );
  if (problems.length) {
    console.log("=== 需要关注的站点 ===");
    for (const p of problems) {
      console.log(`- ${p.name} (${p.url})`);
      if (p.status !== "loaded") console.log(`    状态: ${p.status}`);
      p.notes.forEach((n) => console.log(`    备注: ${n}`));
      p.js_errors.slice(0, 3).forEach((e) => console.log(`    JS错误: ${e}`));
      if (p.fill?.error) console.log(`    fill错误: ${p.fill.error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
