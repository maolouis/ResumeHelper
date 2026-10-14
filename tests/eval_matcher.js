#!/usr/bin/env node
/**
 * 离线字段匹配评测：precision / recall / 错填 / 漏填 / 过填。
 *
 * 与 tests/test_matcher.js 一致，通过 VM 加载 extension/content.js，但额外先加载
 * extension/field_schema.js，使 TERN_FIELDS 与全局别名表都来自「单一字段事实源」，
 * 从而端到端验证 content.js 的匹配行为。
 *
 * 用法（项目根目录）：
 *     node tests/eval_matcher.js
 * 退出码：0 = 全部通过；1 = 存在失败用例。
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const EXT_DIR = path.join(__dirname, "..", "extension");
const FIXTURE_PATH = path.join(__dirname, "fixtures", "matcher_cases.json");

// 与 test_matcher.js 相同的最小宿主环境
global.chrome = { runtime: { onMessage: { addListener() {} } } };
global.location = { hostname: "cnnc.zhiye.com" };

// 1) 先加载字段事实源，2) 再加载 content.js（读取 globalThis.__RESUME_FIELD_SCHEMA）
const schemaSource = fs.readFileSync(path.join(EXT_DIR, "field_schema.js"), "utf8");
vm.runInThisContext(schemaSource, { filename: "field_schema.js" });
const contentSource = fs.readFileSync(path.join(EXT_DIR, "content.js"), "utf8");
vm.runInThisContext(contentSource, { filename: "content.js" });

const api = global.__resumeHelperTestApi;
if (!api) {
  console.error("未能取得 __resumeHelperTestApi：content.js 的测试导出缺失。");
  process.exit(2);
}

// 由单一事实源构建全局别名表，等价于 initial_mappings_document()["global"]
const fields = (globalThis.__RESUME_FIELD_SCHEMA || { fields: [] }).fields;
const mappings = {
  global: Object.fromEntries(fields.map((f) => [f.key, f.aliases])),
  sites: {}
};

const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

async function main() {
  let tp = 0;      // 命中：expected !== "" 且预测正确
  let tn = 0;      // 正确跳过：expected === "" 且预测为 ""
  let wrongFill = 0; // 错填：expected !== "" 且预测成别的 key
  let missFill = 0;  // 漏填：expected !== "" 但预测为 ""
  let overFill = 0;  // 过填：expected === "" 但预测成别的 key

  const failures = [];
  const byCategory = {};

  for (const c of fixtures.cases) {
    const descriptor = {
      label: c.label,
      context: c.context || "",
      contextText: c.contextText || ""
    };
    const resolved = await api.resolveCanonical(descriptor, mappings);
    const classified = await api.classifyCanonical(descriptor, mappings);

    byCategory[c.category] = byCategory[c.category] || { ok: 0, total: 0 };
    byCategory[c.category].total += 1;

    const expected = c.expected;
    let ok = false;
    if (expected === "" && resolved === "") {
      tn += 1;
      ok = true;
    } else if (expected !== "" && resolved === expected) {
      tp += 1;
      ok = true;
    } else if (expected !== "" && resolved === "") {
      missFill += 1;
    } else if (expected !== "" && resolved !== expected) {
      wrongFill += 1;
    } else if (expected === "" && resolved !== "") {
      overFill += 1;
    }

    if (ok) {
      byCategory[c.category].ok += 1;
    } else {
      failures.push({
        id: c.id,
        label: c.label,
        context: c.context || "(无)",
        expected: expected || "(跳过)",
        got: resolved || "(跳过)",
        confidence: Number(classified.confidence).toFixed(3)
      });
    }
  }

  // ---- 报告 ----
  const positive = tp + wrongFill + missFill; // 所有 expected !== "" 的用例
  const predicted = tp + wrongFill + overFill; // 所有被实际填写的用例
  const precision = predicted ? tp / predicted : 1;
  const recall = positive ? tp / positive : 1;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  console.log("\n======== 离线字段匹配评测报告 ========");
  console.log(`用例总数      : ${fixtures.cases.length}`);
  console.log(`正确命中(TP)  : ${tp}`);
  console.log(`正确跳过(TN)  : ${tn}`);
  console.log(`错填(填错key) : ${wrongFill}`);
  console.log(`漏填(应填未填) : ${missFill}`);
  console.log(`过填(不应填却填) : ${overFill}`);
  console.log("---------------------------------------");
  console.log(`精确率 Precision : ${(precision * 100).toFixed(1)}%`);
  console.log(`召回率 Recall    : ${(recall * 100).toFixed(1)}%`);
  console.log(`F1               : ${(f1 * 100).toFixed(1)}%`);

  console.log("\n按类别通过率：");
  for (const [cat, stat] of Object.entries(byCategory)) {
    console.log(`  ${cat.padEnd(18)} ${stat.ok}/${stat.total}`);
  }

  if (failures.length) {
    console.log("\n失败用例：");
    for (const f of failures) {
      console.log(`  [${f.id}] "${f.label}" (区块: ${f.context})`);
      console.log(`      期望: ${f.expected}   实际: ${f.got}   置信度: ${f.confidence}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\n全部用例通过 ✅");
  }
}

main().catch((err) => {
  console.error("评测运行出错：", err);
  process.exit(2);
});
