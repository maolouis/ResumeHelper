// 快速分析小米招聘页面 DOM 结构
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  
  page.on("pageerror", (e) => console.log("JS ERROR:", e.message));
  
  try {
    await page.goto("https://xiaomi.jobs.f.mioffice.cn/internship/resume/7670443502493092134/apply", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    await page.waitForTimeout(5000);
    
    console.log("URL:", page.url());
    console.log("Title:", await page.title());
    
    // 检查是否需要登录
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
    console.log("Body preview:", bodyText);
    
    // 检查所有 input/select/textarea
    const controls = await page.evaluate(() => {
      const all = document.querySelectorAll("input, select, textarea, [contenteditable='true'], [role='combobox'], [role='textbox']");
      return [...all].slice(0, 50).map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          type: el.type || el.getAttribute("role") || "",
          name: el.name || "",
          id: el.id || "",
          placeholder: el.placeholder || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          visible: rect.width > 0 && rect.height > 0,
          // 找最近的 label
          nearbyText: (() => {
            let p = el.parentElement;
            for (let i = 0; i < 5 && p; i++) {
              const t = p.innerText?.slice(0, 80);
              if (t && t.length < 100) return t;
              p = p.parentElement;
            }
            return "";
          })()
        };
      });
    });
    
    console.log("\n=== Controls found ===");
    console.log(JSON.stringify(controls, null, 2));
    
    // 检查 iframe
    const frames = page.frames();
    console.log(`\n=== Frames: ${frames.length} ===`);
    for (const f of frames) {
      console.log("Frame URL:", f.url());
    }
    
  } catch (e) {
    console.log("Error:", e.message);
  } finally {
    await browser.close();
  }
})();
