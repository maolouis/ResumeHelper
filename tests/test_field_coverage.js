/**
 * 字段覆盖率测试：打开30+招聘网站，扫描所有表单控件，
 * 记录每个字段的 label、类型、是否被识别，输出未覆盖字段统计。
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const SITES = [
  // Greenhouse ATS（匿名可访问申请表单）
  { name: "SHEIN", url: "https://job-boards.greenhouse.io/shein/jobs/5408568008" },
  { name: "PingCAP", url: "https://job-boards.greenhouse.io/pingcap/" },
  { name: "Anker", url: "https://job-boards.greenhouse.io/anker/" },
  { name: "Cider", url: "https://job-boards.greenhouse.io/cider/" },
  { name: "NovaLabs", url: "https://job-boards.greenhouse.io/novalabs/" },
  { name: "Instabase", url: "https://job-boards.greenhouse.io/instabase/" },
  { name: "Rippling", url: "https://job-boards.greenhouse.io/rippling/" },
  { name: "Webflow", url: "https://job-boards.greenhouse.io/webflow/" },
  { name: "Figma", url: "https://job-boards.greenhouse.io/figma/" },
  { name: "Notion", url: "https://job-boards.greenhouse.io/notion/" },
  // Lever ATS
  { name: "Lever- example", url: "https://jobs.lever.co/" },
  // 中国公司自建招聘门户（公开职位列表）
  { name: "字节跳动", url: "https://jobs.bytedance.com/" },
  { name: "腾讯", url: "https://careers.tencent.com/" },
  { name: "阿里", url: "https://careers.alibaba.com/" },
  { name: "美团", url: "https://zhaopin.meituan.com/" },
  { name: "京东", url: "https://zhaopin.jd.com/home" },
  { name: "百度", url: "https://talent.baidu.com/" },
  { name: "网易", url: "https://hr.163.com/" },
  { name: "小米", url: "https://hr.xiaomi.com/" },
  { name: "华为", url: "https://career.huawei.com/reccampportal/portal5/index.html" },
  { name: "快手", url: "https://zhaopin.kuaishou.cn/" },
  { name: "B站", url: "https://jobs.bilibili.com/" },
  { name: "小红书", url: "https://job.xiaohongshu.com/" },
  { name: "米哈游", url: "https://campus.mihoyo.com/" },
  { name: "蔚来", url: "https://campus.nio.com/" },
  { name: "小鹏", url: "https://xiaopeng.jobs.feishu.cn/" },
  { name: "理想", url: "https://www.lixiang.com/job/list.html" },
  { name: "比亚迪", url: "https://job.byd.com/" },
  { name: "招商银行", url: "https://career.cmbchina.com/" },
  { name: "国家电网", url: "https://zhaopin.sgcc.com.cn/" },
  { name: "国聘", url: "https://www.iguopin.com/" },
  { name: "智联招聘", url: "https://www.zhaopin.com/" },
  { name: "BOSS直聘", url: "https://www.zhipin.com/" },
  { name: "猎聘", url: "https://www.liepin.com/" },
  { name: "牛客网", url: "https://www.nowcoder.com/" },
];

const FAKE_PROFILE = {
  basic: {
    full_name: "Zhang San", phone: "13800138000", email: "test@example.com",
    gender: "Male", birth_date: "2000-01", nationality_country: "China",
    native_place: "Guangdong", id_type: "ID Card", id_number: "440000200001010000",
    preferred_city: "Guangzhou"
  },
  education: [{
    school: "Test University", degree: "Bachelor", major: "Computer Science",
    start_date: "2018-09", end_date: "2022-06", study_type: "Full-time"
  }],
  work_experience: [{
    company: "Test Corp", position: "Engineer", start_date: "2022-07", end_date: "2024-08"
  }],
  custom_fields: {}
};

const FAKE_MAPPINGS = {
  global: {
    "basic.full_name": ["姓名", "名字", "Full Name", "Name"],
    "basic.phone": ["手机", "电话", "Phone", "Mobile"],
    "basic.email": ["邮箱", "Email", "电子邮箱"],
    "basic.gender": ["性别", "Gender"],
    "basic.nationality_country": ["国籍", "Nationality"],
    "basic.native_place": ["家乡", "籍贯", "Native Place"],
    "basic.id_type": ["证件类型", "ID Type"],
    "basic.id_number": ["证件号码", "身份证号", "ID Number"],
    "basic.preferred_city": ["期望工作地点", "期望城市", "Preferred City"],
    "education[].school": ["学校", "学校名称", "毕业院校", "School"],
    "education[].degree": ["学历", "Degree"],
    "education[].major": ["专业", "Major"],
    "education[].study_type": ["学历类型", "培养方式", "学习形式"],
    "education[].start_date": ["入学时间", "Start Date"],
    "education[].end_date": ["毕业时间", "End Date"],
    "work_experience[].company": ["公司", "Employer"],
    "work_experience[].position": ["职位", "Position"],
    "work_experience[].start_date": ["入职时间", "Start Date"],
    "work_experience[].end_date": ["离职时间", "End Date"]
  },
  sites: {}
};

async function testSite(browser, site, timeoutMs) {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    viewport: { width: 1366, height: 900 }, locale: "zh-CN", ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e.message).slice(0, 200)));

  // CDP bridge
  const cdp = await context.newCDPSession(page);
  await page.exposeFunction("__resumeHelperTrustedInput", async (msg) => ({ ok: true, result: { performed: false } }));
  await page.addInitScript(() => {
    window.chrome = { runtime: {
      onMessage: { addListener() {}, removeListener() {} },
      sendMessage(m, cb) { window.__resumeHelperTrustedInput?.(m).then(cb); }
    }};
  });

  const result = { name: site.name, url: site.url, status: "unknown", fields: [] };
  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(3000);
    result.title = await page.title();
    const script = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
    await page.addScriptTag({ content: script });
    await page.waitForTimeout(1000);
    const scan = await page.evaluate(async ({ profile, mappings }) => {
      if (!window.__resumeHelperTestApi) return { error: "no api" };
      return await window.__resumeHelperTestApi.scanForm(profile, mappings);
    }, { profile: FAKE_PROFILE, mappings: FAKE_MAPPINGS });
    if (scan.error) { result.status = "error"; result.error = scan.error; }
    else {
      result.status = "ok";
      result.total = scan.total;
      result.matched = scan.matched;
      result.fields = (scan.fields || []).map((f) => ({
        label: f.label, type: f.type, canonical: f.canonical || "",
        pageValue: f.pageValue || ""
      }));
    }
  } catch (e) {
    result.status = "failed";
    result.error = e.message.slice(0, 200);
  } finally {
    result.js_errors = jsErrors.slice(0, 3);
    await context.close();
  }
  return result;
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const results = [];
  for (let i = 0; i < SITES.length; i++) {
    process.stdout.write(`[${i+1}/${SITES.length}] ${SITES[i].name} ... `);
    const r = await testSite(browser, SITES[i], 25000);
    results.push(r);
    console.log(`${r.status} | fields=${r.total||0} matched=${r.matched||0}`);
  }
  await browser.close();

  // 统计未识别字段
  const unmatchedLabels = {};
  let totalControls = 0, totalMatched = 0;
  for (const r of results) {
    if (r.status !== "ok") continue;
    totalControls += r.total || 0;
    totalMatched += r.matched || 0;
    for (const f of r.fields) {
      if (!f.canonical && f.label) {
        const key = f.label.slice(0, 50);
        unmatchedLabels[key] = (unmatchedLabels[key] || 0) + 1;
      }
    }
  }

  // 排序
  const sorted = Object.entries(unmatchedLabels).sort((a, b) => b[1] - a[1]);
  console.log("\n=== 未识别字段统计（按出现次数排序）===");
  console.log(`总控件: ${totalControls}, 已识别: ${totalMatched}, 覆盖率: ${totalControls ? Math.round(totalMatched/totalControls*100) : 0}%`);
  console.log(`\n未识别字段 top 50:`);
  for (const [label, count] of sorted.slice(0, 50)) {
    console.log(`  [${count}x] ${label}`);
  }

  const reportPath = path.join(__dirname, "reports", `field-coverage-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({ results, unmatched: sorted }, null, 2));
  console.log(`\n报告: ${reportPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
