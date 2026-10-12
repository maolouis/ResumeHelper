const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.chrome = { runtime: { onMessage: { addListener() {} } } };
global.location = { hostname: "cnnc.zhiye.com" };

const contentScript = fs.readFileSync(path.join(__dirname, "..", "extension", "content.js"), "utf8");
vm.runInThisContext(contentScript, { filename: "content.js" });

const api = global.__resumeHelperTestApi;
assert.equal(api.normalize("* 手机号码："), "手机号码");

const mappings = {
  global: {
    "basic.full_name": ["姓名", "真实姓名"],
    "basic.email": ["邮箱", "电子邮箱", "email"],
    "basic.phone": ["手机", "手机号码", "联系电话"],
    "education[].school": ["学校", "学校名称"],
    "emergency_contacts[].name": ["姓名", "紧急联系人姓名"],
    "emergency_contacts[].phone": ["联系电话", "紧急联系人电话"],
    "publications[].title": ["论文题目", "论文名称"],
    "language_skills[].certificate": ["语言证书", "英语证书"]
  },
  sites: {
    "cnnc.zhiye.com": {
      "是否接受调剂": "custom.是否接受调剂"
    }
  }
};

assert.equal(
  api.resolveCanonical({ label: "姓名 / 请输入姓名", context: "", contextText: "" }, mappings),
  "basic.full_name"
);
assert.equal(
  api.resolveCanonical({ label: "电子邮件地址", context: "", contextText: "" }, mappings),
  "basic.email"
);
assert.equal(
  api.resolveCanonical({ label: "本人联系手机号码", context: "", contextText: "" }, mappings),
  "basic.phone"
);
const uncertain = api.classifyCanonical({ label: "电子邮", context: "", contextText: "" }, mappings);
assert.equal(uncertain.canonical, "basic.email");
assert.ok(uncertain.confidence > 0 && uncertain.confidence < 0.7);
assert.equal(api.resolveCanonical({ label: "电子邮", context: "", contextText: "" }, mappings), "");
assert.equal(
  api.resolveCanonical({ label: "紧急联系人姓名", context: "", contextText: "" }, mappings),
  "emergency_contacts[].name"
);
assert.ok(api.similarity("电子邮件地址", "电子邮箱") >= 0.9);
assert.equal(
  api.resolveCanonical({ label: "学校名称", context: "education", contextText: "教育经历" }, mappings),
  "education[].school"
);
assert.equal(
  api.resolveCanonical({ label: "是否接受调剂", context: "", contextText: "" }, mappings),
  "custom.是否接受调剂"
);
assert.equal(api.contextFallback("开始时间", "projects"), "projects[].start_date");
assert.equal(api.contextFallback("姓名", "emergency_contacts"), "emergency_contacts[].name");
assert.equal(api.contextFallback("论文名称", "publications"), "publications[].title");
assert.equal(api.contextFallback("实践名称", "campus_experience"), "campus_experience[].organization");
assert.equal(api.contextFallback("实践描述", "campus_experience"), "campus_experience[].description");
assert.equal(api.contextFallback("开始时间", "campus_experience"), "campus_experience[].start_date");
assert.equal(api.contextFallback("结束时间", "campus_experience"), "campus_experience[].end_date");
assert.equal(api.contextFallback("至今", "campus_experience"), "campus_experience[].is_current");
const originalHostname = global.location.hostname;
global.location.hostname = "xiaoyuan.zhipin.com";
const hierarchyMappings = {
  global: {},
  sites: { "xiaoyuan.zhipin.com": {
    "开始时间": "education[].degree",
    "campus_experience::开始时间": "campus_experience[].start_date"
  } }
};
assert.equal(
  api.resolveCanonical({ label: "开始时间", context: "campus_experience", contextText: "在校实践" }, hierarchyMappings),
  "campus_experience[].start_date"
);
delete hierarchyMappings.sites["xiaoyuan.zhipin.com"]["campus_experience::开始时间"];
assert.equal(
  api.resolveCanonical({ label: "开始时间", context: "campus_experience", contextText: "在校实践" }, hierarchyMappings),
  "campus_experience[].start_date"
);
global.location.hostname = originalHostname;
assert.equal(api.isSafePageField("password", "登录密码"), false);
assert.equal(api.isSafePageField("text", "短信验证码"), false);
assert.equal(api.isSafePageField("text", "政治面貌"), true);
assert.ok(api.choiceScore("硕士研究生", ["硕士"]) >= 430);
assert.ok(api.choiceScore("2027年06月", ["2027-06"]) >= 430);
assert.ok(api.choiceScore("女", ["女性"]) >= 430);

assert.deepEqual(
  api.recordIdentity(
    { work_experience: [{ company: "广东铭太信息科技有限公司", position: "数据分析实习生" }] },
    "work_experience[].end_date",
    0
  ),
  { section_label: "工作/实习经历", record_name: "广东铭太信息科技有限公司 · 数据分析实习生" }
);

const flattened = api.flattenProfile({
  basic: { full_name: "李艳萍" },
  education: [{ school: "广东工业大学" }, { school: "广东工业大学" }],
  language_skills: [{ certificate: "CET-6" }],
  hobbies: "羽毛球",
  custom_fields: { "是否接受调剂": "是" }
});
assert.equal(flattened["basic.full_name"], "李艳萍");
assert.deepEqual(flattened["education[].school"], ["广东工业大学", "广东工业大学"]);
assert.deepEqual(flattened["language_skills[].certificate"], ["CET-6"]);
assert.equal(flattened.hobbies, "羽毛球");
assert.equal(flattened["custom.是否接受调剂"], "是");

console.log("matcher tests passed");

