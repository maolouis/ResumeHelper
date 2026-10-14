# 简历快填优化方案（语义理解 / 字段分割 / 错填漏填）

> 目标范围：三者整体优化。
> 技术路线：规则 + 本地语义模型（Ternlight）增强，不引入独立训练模型。
> 样本现状：暂无可用标注样本，小模型路线后置。
> 基线：v0.4.6（2026-10-12 HANDOFF）。

---

## 0. 现状诊断（根因）

三个问题不是孤立的：**语义理解差 → 匹配错/匹配不上 → 错填/漏填**；**字段分割差 → 记录错位/值切错 → 错填/漏填**。下面按「根因 → 症状」列出，并标注涉及的代码位置。

### 0.1 语义理解差的根因

**R1. 两套字段 schema 不对齐（最严重，直接造成错填/漏填）**

`extension/content.js` 里的 `TERN_FIELDS`（约 58 个 key）与 `app/defaults.py` 的实际档案结构不一致：

- `basic.ethnicity`（民族）在档案里实际是 `basic.nationality` → 语义匹配命中了却取不到值，**漏填**。
- `basic.address` 在 TERN_FIELDS 里标注为「现居地」，但档案里 `basic.address` 是「联系地址」、「现居城市」是 `basic.current_city` → 拿「现居地」的值去填「联系地址」，**错填**。
- `basic.age`、`basic.available_duration` 在档案里不存在 → 命中后取不到值，**漏填**。
- `publications[].journal` 实际是 `publications[].publication` → **漏填**。

`TERN_FIELDS` 还缺少约一半 schema：`job_intentions` 全部字段、`work_experience` 的 city/industry/employment_type/reason_for_leaving/report_to、`projects` 的 organization/technologies/project_url、`certificates_awards` 的 category/issuer/grade/score/expiry_date、`professional_skills` 的 years/certificate/description、`publications` 的 authors/publication_date/status/doi、`patents` 的 type/status/application_date/authorization_date，以及 `trainings`/`campus_experience`/`volunteer_experience`/`family_members`/`emergency_contacts`/`references` 全部和 6 个长文本字段。**这些字段无法被语义模型识别 → 大量漏填。**

**R2. 兜底「相似度」是字符编辑距离，不是语义相似度**

`similarity()` 是 Levenshtein 编辑距离比。它是全局别名兜底的主要打分手段，对「期望薪资 vs 期望月薪」「毕业院校 vs 最高学历学校」这类语义相近、字面不同的 label 打分不可靠。`semanticNormalize()` 只是硬编码 replace 链，覆盖面小。

**R3. Ternlight 语义模型被低估使用**

`ternlightMatch()` 只把 label 与「canonical 名称 + 少量别名」的 embedding 做余弦相似度，且：

- 别名集合远小于 `mappings.global` 里已有的丰富别名表。
- 上下文只做 `+0.15` 正向加成、无负向惩罚，且对 `basic.*` 和长文本字段不生效 → 跨区块误匹配仍会发生。
- 只返回单一 best，没有 top-k 候选供冲突消解。

**R4. 匹配置信度没有统一标定**

`classifyCanonical()` 内部有 4 层匹配（强规则 0.995 / Ternlight ≤0.97 / 站点映射 1.0 / 全局别名 `score/1000`），`score` 会被 `+200`(上下文)、`+760`(includes)、`+1000`(全等) 等累加，而 `MIN_CLASSIFIER_CONFIDENCE=0.7` 是固定阈值。分数来源混杂导致弱匹配被放行、强匹配被误杀。

### 0.2 字段分割差的根因

**R5. 附件解析：经历条目依赖日期切分，脆弱**

`attachment_reader.py` 的 `_dated_entries()` 靠 `DATE_RANGE` 正则识别「起止日期」作为条目起点。无日期行、日期在行尾、日期跨行、多岗位共用同一时间段时，条目会合并或缺失。`_split_work_title()` 靠有限的公司后缀/职位后缀列表拆 company/position，覆盖不全会拆错。

**R6. 附件解析：label:value 只支持单行**

`_labelled_values()` 只在单行内用正则切「标签:值」，标签在行末、值在下一行的简历格式会丢值。

**R7. 附件解析：段落切分靠关键词完全相等**

`_split_document_lines()` 的 `_heading_targets()` 要求标题与关键词归一化后**完全相等**，PDF 提取出的标题多一个空格/标点就会漏切，后续所有内容归到错误段落。

**R8. 浏览器端：重复区块字段→记录映射用全局出现次数**

`content.js` 的 `selectProfileValue()` 用 `counters[canonical]`（该字段类型第几次出现）来映射第 N 条经历记录。字段顺序变化、某个字段缺失、或日期拆成月/年（`splitDatePart` 假设只拆 2 段，`Math.floor(occurrence/2)`）时，recordIndex 错位 → 第 1 条经历的学校填到第 2 条 → **错填**。

**R9. 浏览器端：标签收集有噪声**

`getLabelCandidates()` 多轮启发式（container 内所有 label/title/文本、向上遍历祖先、前一兄弟元素…）容易把容器里的多余文本抓进 label，导致后续匹配错。

### 0.3 错填漏填的直接成因

**R10. 值类型守卫只覆盖手机/邮箱/身份证**

`valueMatchesCanonical()` 只拦 3 类值。学历枚举、日期格式、身高体重数值范围、姓名 vs 公司等无校验 → 语义误匹配会直接乱填。

**R11. 存疑时仍可能硬填**

`MIN_CLASSIFIER_CONFIDENCE` 与未标定的分数（R4）组合后，处于灰色地带的字段可能被放行填写，而不是「低置信度跳过」。

**R12. repeater 展开与 skip/overwrite 逻辑导致漏填**

`expandRepeaters()` 点「添加」按钮靠关键词猜测，点不到就少一块；`fillControl()` 的 skip 条件（overwrite / 默认单选值）在部分场景会漏填应填字段。

---

## 1. 优化方案（分阶段）

### Phase 0 —— 建立可量化回归基准（前置，最大杠杆）

没有样本也要先能度量，否则「优化」无法验证。这一步同时为未来小模型铺路。

- **P0-1 单一字段事实源**：写 `scripts/gen_field_schema.py`，从 `app/defaults.py` 的 `BASIC_FIELDS` / `SECTION_DEFINITIONS` / `LONG_TEXT_FIELDS` 生成 `extension/field_schema.js`（含 canonical key、中文 label、别名）。`content.js` 加载它，`TERN_FIELDS` 与 `STRONG_FIELD_RULES` 都改为引用它。**这一步直接消除 R1 的 schema 漂移**，是后续所有匹配优化的前提。
- **P0-2 离线评测夹具**：复用 `tests/reports/*.json` 里已有的 DOM 采样，整理成 `tests/fixtures/` 下的 `{site, controls:[{label, context, type, expectedCanonical}], fills:[{canonical, value}]}` JSON。
- **P0-3 评测脚本**：`tests/eval_matcher.js` 调用 `__resumeHelperTestApi.classifyCanonical` / `fillForm`，输出 precision / recall / 错填 / 漏填 矩阵，作为回归门槛。
- **P0-4 标注采集管线**：`sidepanel.js` 增加「用户手动纠正字段 → 存 `{hostname, label, context, correctedCanonical}`」到本地存储/文件（对应 HANDOFF「后续工作建议 #2」）。本期只采集、不训练，为将来小模型备数据。

### Phase 1 —— 语义理解增强（核心）

- **P1-1 重写相似度函数**：`similarity()` 改为「字符 bigram overlap + 归一化 + 同义词表」的混合分，或用 Ternlight embedding 相似度作主分、编辑距离只做 tie-break。明确一张得分表，替代现在 `similarity` + 硬编码 `semanticNormalize` 的组合（R2）。
- **P1-2 语义匹配扩展**：`ternlightMatch()` 改为：
  - 对 `field_schema.js` 的**完整别名集**（而不是 TERN_FIELDS 少量别名）做 embedding 对照（R3）。
  - 增加**负向上下文惩罚**（canonical 区块 ≠ 当前上下文时扣分），正向加成改用中文区块 label（R3）。
  - 支持 `basic.*` 与长文本字段的语义匹配（R3）。
  - 返回 **top-k 候选**，供 Phase 3 冲突消解使用（R3）。
- **P1-3 统一置信度标定**：把 4 层匹配源的得分归一化到统一 `[0,1]` 置信度，`MIN_CLASSIFIER_CONFIDENCE` 与之对齐；保留「低置信度跳过」保护（R4、R11）。

### Phase 2 —— 字段分割增强

**附件解析 `attachment_reader.py`：**

- **P2-1 段落切分增强**：`_heading_targets()` 从「完全相等」改为「归一化后包含/模糊匹配 + 空行分块 + 行首缩进/项目符号」判定（R7）。
- **P2-2 多行 label:value 捕获**：`_labelled_values()` 支持「标签在行末、值在下一行」（R6）。
- **P2-3 经历条目切分增强**：在 `DATE_RANGE` 基础上，把「公司/单位后缀 + 职位后缀」也作为条目起点，处理无日期条目；扩充 `_split_work_title()` 的后缀词表并加关键词打分兜底（R5）。

**浏览器端 `content.js`：**

- **P2-4 标签收集去噪**：对 `getLabelCandidates()` 的候选做排序，优先短、不含控件的文本，剔除容器噪声（R9）。
- **P2-5 重复区块按 DOM 分组映射记录**：把字段按所属 DOM 容器聚类成「记录块」，块内按字段顺序映射 recordIndex，取代全局 `counters` 出现次数（R8）。
- **P2-6 日期拆分正确化**：识别「一个日期字段组」支持年/月/日 2 段与 3 段，修正 `splitDatePart` 的 `Math.floor(occurrence/2)` 假设（R8）。

### Phase 3 —— 错填漏填治理

- **P3-1 值类型守卫扩展**：`valueMatchesCanonical()` 增加学历枚举、日期格式、数值范围、姓名/公司文本特征校验（R10）。
- **P3-2 记录级一致性**：同一「记录块」内的 company/position/date 应来自同一条 profile 记录；发现错位时整体回退或标记待确认（R8 的兜底）。
- **P3-3 存疑不填**：置信度落在灰色区间时标记「待确认」而不硬填；sidepanel 展示可一键纠正（R11，配合 P0-4）。
- **P3-4 回读验证增强**：现有 readback 基础上补充「下拉/单选语义回读」「日期控件回读」，sidepanel 展示填充差异（R12）。
- **P3-5 漏填治理**：P0-1 补齐 schema 覆盖后，绝大多数漏填自动消除；再修复 `expandRepeaters()` 展开计数（R12）。

### Phase 4 —— 回归与发布

- **P4-1 补测试**：`tests/` 新增 matcher 单测（fixture 全过）与 parser 单测。
- **P4-2 全量回归**：跑 HANDOFF「已执行验证」全套命令（`node --check`、`npm test`、`py -m unittest`、`npm run test:live` 等）。
- **P4-3 版本与构建**：bump 版本号，如需跨机交付则重跑 `scripts\build_installer.ps1` 并重装验证。

---

## 2. 关键文件改动清单

| 文件 | 改动 |
| --- | --- |
| `app/defaults.py` | 作为字段唯一事实源（基本不动，仅补充遗漏别名） |
| `scripts/gen_field_schema.py` | 新增：生成 `extension/field_schema.js` |
| `extension/field_schema.js` | 新增：完整 canonical + label + 别名 |
| `extension/content.js` | P1-1~P1-3、P2-4~P2-6、P3-1~P3-4：重写 similarity/ternlightMatch/classifyCanonical 置信度/selectProfileValue/valueMatchesCanonical |
| `extension/sidepanel.js` | P0-4 采集管线、P3-3/P3-4 结果展示 |
| `app/attachment_reader.py` | P2-1~P2-3：段落切分、多行 label、条目切分、company/position 拆分 |
| `tests/fixtures/*.json` | 新增：离线 DOM 评测夹具 |
| `tests/eval_matcher.js` | 新增：precision/recall 评测 |
| `tests/*.py` / `tests/*.js` | 新增 parser 与 matcher 单测 |

---

## 3. 优先级与里程碑

- **M0（最高杠杆）**：P0-1 单一字段事实源 + P0-2/P0-3 评测基准。做完就能量化「漏填了多少字段」。
- **M1**：Phase 1 语义匹配重写（消除 R1/R2/R3/R4）。
- **M2**：Phase 2 分割增强（消除 R5~R9）。
- **M3**：Phase 3 填写正确性（消除 R10~R12）。
- **M4**：Phase 4 回归发布。

建议顺序：M0 → M1 → M2 → M3 → M4。M0/M1 收益最大且风险可控，M2/M3 依赖 M0 的 schema 与基准。

---

## 4. 风险与取舍

- **改匹配管线可能引入新误匹配**：用 Phase 0 基准做回归门槛，任何改动必须先过评测脚本。
- **Ternlight WASM 体积/性能**：保持现有懒加载 + 分批让出主线程，不预计算全量 embedding；alias 全量 embedding 也按需缓存。
- **无标注样本导致召回无法客观评估**：先靠离线 DOM fixture 近似，P0-4 逐步补充真实标注，样本够了再评估最小分类器（保持 HANDOFF 结论）。
- **跨站点 ATS 差异大**：不追求一次性全覆盖，优先保证已有 47 站回归不劣化，再逐类站点（北森/Moka/牛客/用友/自建）补 fixture。
