// 级别语义匹配测试
const LEVEL_PATTERNS = [
  { std: "国际", pats: ["国际", "世界级", "世界"] },
  { std: "国家", pats: ["国家", "全国"] },
  { std: "省", pats: ["省"] },
  { std: "市", pats: ["市"] },
  { std: "校", pats: ["学校", "校级", "校"] },
  { std: "院", pats: ["学院", "院级", "院"] },
  { std: "区", pats: ["区", "区县"] },
];
function extractLevelKeywords(text) {
  const found = [];
  for (const { std, pats } of LEVEL_PATTERNS) {
    if (pats.some(p => text.includes(p)) && !found.includes(std)) found.push(std);
  }
  return found;
}
function levelSemanticMatch(candidateRaw, wantedRaw) {
  const cKws = extractLevelKeywords(candidateRaw);
  const wKws = extractLevelKeywords(wantedRaw);
  if (cKws.length === 0 || wKws.length === 0) return false;
  return wKws.every(k => cKws.includes(k)) || cKws.every(k => wKws.includes(k));
}

const cases = [
  ["校级", "校院级", true],
  ["省级", "省市级", true],
  ["国家级", "国家级", true],
  ["国家级", "国际级", false],
  ["省级", "校级", false],
  ["一等奖", "一等", true],  // 注意：一等不匹配级别关键词
  ["广州", "广州市", true],
];
for (const [want, cand, expected] of cases) {
  const got = levelSemanticMatch(cand, want);
  const cKw = extractLevelKeywords(cand);
  const wKw = extractLevelKeywords(want);
  console.log(`${want} vs ${cand} => match=${got} (expected=${expected}) [cand:${cKw}, want:${wKw}] ${got===expected?'OK':'FAIL'}`);
}
