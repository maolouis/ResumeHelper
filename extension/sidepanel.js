const elements = {
  connectionText: document.querySelector("#connectionText"),
  connectionDot: document.querySelector("#connectionDot"),
  profileSelect: document.querySelector("#profileSelect"),
  scanButton: document.querySelector("#scanButton"),
  fillButton: document.querySelector("#fillButton"),
  importButton: document.querySelector("#importButton"),
  overwriteToggle: document.querySelector("#overwriteToggle"),
  pageSection: document.querySelector("#pageSection"),
  pageFieldCount: document.querySelector("#pageFieldCount"),
  pageTitle: document.querySelector("#pageTitle"),
  filledCount: document.querySelector("#filledCount"),
  skippedCount: document.querySelector("#skippedCount"),
  missingCount: document.querySelector("#missingCount"),
  failedCount: document.querySelector("#failedCount"),
  detailsSection: document.querySelector("#detailsSection"),
  detailsTitle: document.querySelector("#detailsTitle"),
  detailsCount: document.querySelector("#detailsCount"),
  operationDetails: document.querySelector("#operationDetails"),
  missingSection: document.querySelector("#missingSection"),
  missingFields: document.querySelector("#missingFields"),
  saveMissingButton: document.querySelector("#saveMissingButton"),
  documentSelect: document.querySelector("#documentSelect"),
  uploadButton: document.querySelector("#uploadButton"),
  messageBox: document.querySelector("#messageBox"),
  refreshButton: document.querySelector("#refreshButton"),
  apiKeyInput: document.querySelector("#apiKeyInput"),
  aiEnhanceButton: document.querySelector("#aiEnhanceButton"),
  aiMethodSelect: document.querySelector("#aiMethodSelect"),
  apiKeyRow: document.querySelector("#apiKeyRow"),
  cloudSettings: document.querySelector("#cloudSettings"),
  providerSelect: document.querySelector("#providerSelect"),
  apiEndpoint: document.querySelector("#apiEndpoint"),
  modelName: document.querySelector("#modelName")
};

let appState = null;
const saveTimers = new WeakMap();

// 云端AI服务商配置
const PROVIDERS = {
  deepseek: {
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    model: "deepseek-chat",
    name: "DeepSeek"
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    name: "OpenAI"
  },
  doubao: {
    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    model: "doubao-pro-4k",
    name: "豆包"
  },
  qwen: {
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-turbo",
    name: "通义千问"
  },
  kimi: {
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    model: "moonshot-v1-8k",
    name: "Kimi"
  },
  zhipu: {
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4-flash",
    name: "智谱AI"
  },
  custom: {
    endpoint: "",
    model: "",
    name: "自定义"
  }
};
const documentTypeLabels = {
  resume: "个人简历",
  photo: "证件照/头像",
  transcript: "成绩单",
  degree_certificate: "学位证",
  diploma: "毕业证",
  certificate: "证书/奖项证明",
  portfolio: "作品集",
  cover_letter: "求职信",
  recommendation: "推荐信",
  other: "其他附件"
};

function request(message) {
  return new Promise((resolve, reject) => {
    // 添加超时机制：120秒后自动报错，避免一直转圈（填写大量字段需要时间）
    const timeoutId = setTimeout(() => {
      reject(new Error("请求超时，本地程序未响应"));
    }, 120000);
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeoutId); // 收到响应后清除超时
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        const message = response?.error || "插件操作失败";
        if (message.includes("未知插件操作")) {
          reject(new Error("插件页面与后台版本不一致，请在 edge://extensions 中重新加载“简历快填 - 本地版”后重试"));
          return;
        }
        reject(new Error(message));
        return;
      }
      resolve(response.result);
    });
  });
}

// 云端AI API语义分析（支持多种服务商）
async function callCloudAI(fields, apiKey, endpoint, model) {
  if (!apiKey) {
    throw new Error("请先配置API Key");
  }
  if (!endpoint || !model) {
    throw new Error("请配置API地址和模型名称");
  }
  
  // 构建提示词
  const fieldList = fields.map((f, i) => `${i + 1}. 标签: "${f.label}", 上下文: "${f.context || ''}"`).join("\n");
  
  const systemPrompt = `你是一个简历字段匹配专家。请根据字段标签和上下文，判断每个字段应该匹配哪个简历数据字段。

可匹配的字段列表：
- basic.full_name: 姓名
- basic.gender: 性别
- basic.phone: 手机号码
- basic.email: 电子邮箱
- basic.id_number: 身份证号
- basic.id_type: 证件类型
- basic.nationality_country: 国籍
- basic.ethnicity: 民族
- basic.political_status: 政治面貌
- basic.birthday: 出生日期
- basic.address: 现居地
- education[].school: 学校名称
- education[].degree: 学历
- education[].major: 专业
- education[].start_date: 入学时间
- education[].end_date: 毕业时间
- education[].gpa: GPA
- work_experience[].company: 公司名称
- work_experience[].position: 职位
- work_experience[].start_date: 入职时间
- work_experience[].end_date: 离职时间
- work_experience[].description: 工作描述
- projects[].name: 项目名称
- projects[].role: 项目角色
- projects[].start_date: 项目开始时间
- projects[].end_date: 项目结束时间
- projects[].description: 项目描述
- certificates_awards[].name: 证书/奖项名称
- certificates_awards[].level: 等级/级别
- certificates_awards[].date: 获得时间
- language_skills[].language: 语种
- language_skills[].level: 水平
- language_skills[].certificate: 证书
- professional_skills[].name: 技能名称
- professional_skills[].level: 熟练程度

请以JSON格式返回，格式为：{"字段序号": "匹配的字段key"}
例如：{"1": "basic.full_name", "2": "education[].school"}

注意：
1. 注意上下文，在"获奖经历"区块里的"名称"应该匹配 certificates_awards[].name
2. 在"工作经历"区块里的"公司"应该匹配 work_experience[].company
3. 如果不确定，返回空字符串`;

  const userPrompt = `请分析以下字段：\n${fieldList}\n\n请返回JSON格式的匹配结果。`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API调用失败: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // 解析JSON
    const result = JSON.parse(content);
    return result;
  } catch (error) {
    console.error("云端AI API调用失败:", error);
    throw error;
  }
}

// 本地语义匹配（Ternlight真语义 + 规则兜底）
function localSemanticMatch(fields) {
  // 标准字段定义
  const CANONICAL_FIELDS = [
    { key: "basic.full_name", name: "姓名", aliases: ["名字", "真实姓名", "应聘者姓名", "求职者姓名"] },
    { key: "basic.gender", name: "性别", aliases: ["男/女"] },
    { key: "basic.phone", name: "手机号码", aliases: ["手机号", "联系电话", "联系方式", "手机"] },
    { key: "basic.email", name: "电子邮箱", aliases: ["邮箱", "Email", "E-mail", "电子信箱"] },
    { key: "basic.id_number", name: "身份证号", aliases: ["身份证号码", "证件号码", "居民身份证"] },
    { key: "basic.id_type", name: "证件类型", aliases: ["证件种类"] },
    { key: "basic.nationality_country", name: "国籍", aliases: ["国家"] },
    { key: "basic.ethnicity", name: "民族", aliases: ["族群"] },
    { key: "basic.political_status", name: "政治面貌", aliases: ["政治情况"] },
    { key: "basic.birthday", name: "出生日期", aliases: ["生日", "出生年月"] },
    { key: "basic.native_place", name: "家乡", aliases: ["籍贯", "生源地", "原生地"] },
    { key: "basic.address", name: "现居地", aliases: ["居住地", "所在地", "现住址"] },
    { key: "basic.age", name: "年龄", aliases: ["岁数"] },
    { key: "basic.preferred_city", name: "期望工作地点", aliases: ["期望城市", "意向城市", "期望地点"] },
    { key: "basic.available_duration", name: "可实习时长", aliases: ["实习时长", "可到岗时间", "到岗时间"] },
    
    { key: "education[].school", name: "学校名称", aliases: ["院校", "毕业院校", "毕业学校", "学校"] },
    { key: "education[].degree", name: "学历", aliases: ["学位", "最高学历", "学历层次"] },
    { key: "education[].major", name: "专业", aliases: ["所学专业", "专业名称"] },
    { key: "education[].start_date", name: "入学时间", aliases: ["开始时间", "入学年月"] },
    { key: "education[].end_date", name: "毕业时间", aliases: ["结束时间", "毕业年月", "预计毕业"] },
    { key: "education[].gpa", name: "GPA", aliases: ["平均成绩", "绩点", "成绩排名"] },
    { key: "education[].study_type", name: "学历类型", aliases: ["学习形式", "培养方式", "学制"] },
    { key: "education[].department", name: "院系", aliases: ["学院", "二级学院"] },
    
    { key: "work_experience[].company", name: "公司名称", aliases: ["企业名称", "单位名称", "公司", "企业", "单位"] },
    { key: "work_experience[].position", name: "职位", aliases: ["岗位", "职务", "职位名称"] },
    { key: "work_experience].department", name: "部门", aliases: ["部门名称"] },
    { key: "work_experience[].start_date", name: "入职时间", aliases: ["开始时间", "入职年月"] },
    { key: "work_experience[].end_date", name: "离职时间", aliases: ["结束时间", "离职年月"] },
    { key: "work_experience[].description", name: "工作描述", aliases: ["工作内容", "工作职责", "工作业绩"] },
    
    { key: "projects[].name", name: "项目名称", aliases: ["项目名", "项目标题"] },
    { key: "projects[].role", name: "项目角色", aliases: ["角色", "担任角色", "项目职务"] },
    { key: "projects[].start_date", name: "项目开始时间", aliases: ["项目开始日期"] },
    { key: "projects[].end_date", name: "项目结束时间", aliases: ["项目结束日期"] },
    { key: "projects[].description", name: "项目描述", aliases: ["项目内容", "项目职责", "项目业绩"] },
    
    { key: "certificates_awards[].name", name: "证书名称", aliases: ["奖项名称", "证书", "奖项", "获奖名称", "荣誉名称"] },
    { key: "certificates_awards[].level", name: "证书等级", aliases: ["奖项等级", "等级", "级别", "奖项级别", "获奖级别"] },
    { key: "certificates_awards[].date", name: "获得时间", aliases: ["获奖时间", "颁发时间", "证书时间"] },
    { key: "certificates_awards[].description", name: "证书描述", aliases: ["奖项描述", "获奖描述"] },
    
    { key: "language_skills[].language", name: "语种", aliases: ["语言", "外语", "外语种类"] },
    { key: "language_skills[].level", name: "语言水平", aliases: ["水平", "程度", "熟练程度"] },
    { key: "language_skills[].certificate", name: "语言证书", aliases: ["证书", "英语证书", "语言成绩"] },
    { key: "language_skills[].score", name: "语言成绩", aliases: ["分数", "考试成绩"] },
    
    { key: "professional_skills[].name", name: "技能名称", aliases: ["技能", "技术", "专业技能"] },
    { key: "professional_skills[].level", name: "技能水平", aliases: ["熟练程度", "水平", "掌握程度"] },
    
    { key: "campus_experience[].organization", name: "组织名称", aliases: ["社团名称", "学生会名称"] },
    { key: "campus_experience[].position", name: "担任职务", aliases: ["职务", "职位"] },
    { key: "campus_experience[].description", name: "活动描述", aliases: ["活动内容", "工作职责"] },
    
    { key: "publications[].title", name: "论文标题", aliases: ["论文名称", "著作名称"] },
    { key: "publications[].journal", name: "发表期刊", aliases: ["期刊名称", "发表刊物"] },
    
    { key: "patents[].name", name: "专利名称", aliases: ["专利名称"] },
    { key: "patents[].number", name: "专利号", aliases: ["专利编号"] },
  ];
  
  // 上下文区块关键词
  const CONTEXT_BLOCKS = [
    { keywords: ["教育经历", "教育背景", "学历信息", "学业信息", "教育信息", "学历背景"], section: "education" },
    { keywords: ["工作经历", "实习经历", "职业经历", "工作经验", "实习信息", "职业背景"], section: "work_experience" },
    { keywords: ["项目经历", "项目经验", "科研项目", "项目信息", "工程项目"], section: "projects" },
    { keywords: ["获奖经历", "荣誉奖项", "证书", "奖励情况", "获奖信息", "荣誉奖励", "证书奖项"], section: "certificates_awards" },
    { keywords: ["语言能力", "外语水平", "英语", "语言信息", "外语能力"], section: "language_skills" },
    { keywords: ["专业技能", "技能特长", "技术能力", "技能信息", "专业特长"], section: "professional_skills" },
    { keywords: ["校园经历", "在校实践", "社团活动", "学生工作", "校内实践"], section: "campus_experience" },
    { keywords: ["培训经历", "培训信息", "培训记录"], section: "training" },
    { keywords: ["论文著作", "发表成果", "学术成果", "论文信息"], section: "publications" },
    { keywords: ["专利信息", "专利成果", "软件著作权"], section: "patents" },
  ];
  
  const result = {};
  const hasTernlight = typeof window.Ternlight !== 'undefined';
  
  fields.forEach((field, index) => {
    const label = (field.label || "").trim();
    const context = (field.context || "").trim();
    
    if (!label) return;
    
    let bestMatch = "";
    let bestScore = 0;
    
    // 检测上下文区块
    let contextSection = "";
    for (const block of CONTEXT_BLOCKS) {
      if (block.keywords.some(kw => context.includes(kw))) {
        contextSection = block.section;
        break;
      }
    }
    
    // 方法1：使用 Ternlight 真语义匹配（准确率最高）
    if (hasTernlight) {
      try {
        const queryEmbedding = window.Ternlight.embed(label);
        
        for (const fieldDef of CANONICAL_FIELDS) {
          // 计算与标准字段名的相似度
          const canonicalEmbedding = window.Ternlight.embed(fieldDef.name);
          let sim = window.Ternlight.cosineSim(queryEmbedding, canonicalEmbedding);
          
          // 加上别名的相似度（取最大值）
          for (const alias of fieldDef.aliases) {
            const aliasEmbedding = window.Ternlight.embed(alias);
            const aliasSim = window.Ternlight.cosineSim(queryEmbedding, aliasEmbedding);
            if (aliasSim > sim) sim = aliasSim;
          }
          
          // 上下文权重加成
          if (contextSection && fieldDef.key.startsWith(contextSection + "[].")) {
            sim += 0.2; // 上下文匹配加分（提高到0.2）
          }
          
          // 阈值：相似度 > 0.5 才算匹配（从0.6降到0.5，提高召回率）
          if (sim > 0.5 && sim > bestScore) {
            bestScore = sim;
            bestMatch = fieldDef.key;
          }
        }
      } catch (e) {
        console.warn("Ternlight 匹配失败，使用规则兜底:", e);
      }
    }
    
    // 方法2：规则兜底（如果 Ternlight 不可用）
    if (!bestMatch) {
      for (const fieldDef of CANONICAL_FIELDS) {
        let score = 0;
        
        // 精确匹配
        if (label === fieldDef.name) score = 1000;
        // 包含匹配
        else if (label.includes(fieldDef.name) || fieldDef.name.includes(label)) score = 800 + label.length;
        // 别名匹配
        else if (fieldDef.aliases.some(alias => label.includes(alias))) score = 700;
        // 模糊相似度匹配
        else {
          // 简单的字符重叠率计算
          let overlap = 0;
          for (const ch of label) {
            if (fieldDef.name.includes(ch)) overlap++;
          }
          const ratio = overlap / Math.max(label.length, fieldDef.name.length);
          if (ratio > 0.5) score = Math.round(ratio * 500);
        }
        
        // 上下文权重
        if (contextSection && fieldDef.key.startsWith(contextSection + "[].")) {
          score += 300;
        }
        
        // 阈值：规则匹配需要 > 400 分
        if (score > 400 && score > bestScore) {
          bestScore = score;
          bestMatch = fieldDef.key;
        }
      }
    }
    
    if (bestMatch && bestScore >= 600) {
      result[index + 1] = bestMatch;
    }
  });
  
  return result;
}

function setBusy(busy) {
  const hasProfile = Boolean(appState?.active_profile);
  for (const button of [elements.scanButton, elements.fillButton, elements.importButton, elements.uploadButton, elements.saveMissingButton, elements.refreshButton]) {
    button.disabled = busy;
  }
  if (!busy) {
    elements.scanButton.disabled = !hasProfile;
    elements.fillButton.disabled = !hasProfile;
    elements.importButton.disabled = !hasProfile;
    elements.saveMissingButton.disabled = !hasProfile;
    elements.uploadButton.disabled = !hasProfile || !appState.active_profile.documents?.length;
  }
}

function showMessage(text, error = false) {
  elements.messageBox.textContent = text;
  elements.messageBox.hidden = false;
  elements.messageBox.classList.toggle("error", error);
}

function clearMessage() {
  elements.messageBox.hidden = true;
  elements.messageBox.textContent = "";
}

function setConnection(ok, text) {
  elements.connectionText.textContent = text;
  elements.connectionDot.className = `status-dot ${ok ? "connected" : "error"}`;
}

function populateState(state) {
  appState = state;
  elements.profileSelect.replaceChildren();
  for (const profile of state.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    option.selected = profile.id === state.active_profile_id;
    elements.profileSelect.append(option);
  }
  if (!state.profiles.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无档案";
    elements.profileSelect.append(option);
  }
  elements.profileSelect.disabled = !state.active_profile;
  elements.documentSelect.replaceChildren();
  const documents = state.active_profile?.documents || [];
  if (!documents.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "没有可用附件";
    elements.documentSelect.append(option);
    elements.uploadButton.disabled = true;
  } else {
    for (const documentItem of documents) {
      const option = document.createElement("option");
      option.value = documentItem.id;
      option.textContent = `${documentItem.name} · ${documentTypeLabels[documentItem.type] || documentItem.type}`;
      elements.documentSelect.append(option);
    }
    elements.uploadButton.disabled = false;
  }
  setConnection(true, state.active_profile ? `已连接 · ${state.active_profile.name}` : "已连接 · 暂无档案");
  if (!state.active_profile) showMessage("当前没有简历档案，请先在桌面程序中新增或导入档案。", true);
}

async function loadState() {
  setBusy(true);
  clearMessage();
  try {
    const state = await request({ type: "native", payload: { action: "get_state" } });
    populateState(state);
  } catch (error) {
    setConnection(false, "本地程序未连接");
    showMessage(`${error.message}。请先完成 Native Host 安装。`, true);
  } finally {
    setBusy(false);
  }
}

function renderPage(result, isFill = false) {
  if (!isFill) elements.detailsSection.hidden = true;
  elements.pageSection.hidden = false;
  elements.pageTitle.textContent = result.meta?.jobTitle || result.tab?.title || "当前招聘表单";
  const readyText = Number.isInteger(result.ready) ? ` · ${result.ready} 项已有资料` : "";
  elements.pageFieldCount.textContent = `${result.total ?? "-"} 个可填写字段${readyText}`;
  elements.filledCount.textContent = String(result.filled || 0);
  elements.skippedCount.textContent = String(result.skipped || 0);
  elements.failedCount.textContent = String(result.failed?.length || 0);
  const missing = result.missing || result.fields?.filter((field) => !field.filled) || [];
  elements.missingCount.textContent = String(missing.length);
  renderMissing(missing);
  if (isFill) {
    const details = [
      ...(result.filledFields || []).map((field) => ({ ...field, status: "已填写" })),
      ...(result.skippedFields || []).map((field) => ({ ...field, status: "页面原值已保留" })),
      ...(result.lowConfidence || []).map((field) => ({ ...field, status: "低置信度，已跳过" })),
      ...(result.failed || []).map((field) => ({ ...field, status: "失败" }))
    ];
    renderDetails("本次填写明细", details, "已填写");
  }
  if (isFill) {
    const lowConfidence = result.lowConfidence?.length || 0;
    showMessage(lowConfidence
      ? `已填写 ${result.filled || 0} 项；另有 ${lowConfidence} 项因匹配置信度低而跳过，请在操作明细中确认。`
      : `已使用“${result.profileName}”填写 ${result.filled || 0} 项，请核对后手动提交。`);
  }
}

function displayLabel(field) {
  const repeated = Boolean(field.canonical?.includes("[]"));
  const recordNumber = Number(field.record_index || 0) + 1;
  const section = field.section_label
    ? `${field.section_label}${repeated && !field.record_name ? `（第 ${recordNumber} 条）` : ""}`
    : "";
  return [section, field.record_name, field.label].filter(Boolean).join(" · ");
}

function renderDetails(title, fields, status) {
  elements.operationDetails.replaceChildren();
  const values = fields.filter((field) => String(field.value || field.error || "").trim()).slice(0, 100);
  elements.detailsSection.hidden = values.length === 0;
  elements.detailsTitle.textContent = title;
  elements.detailsCount.textContent = `${values.length} 项`;
  for (const field of values) {
    const row = document.createElement("div");
    row.className = "result-row";
    const label = document.createElement("div");
    label.className = "result-label";
    label.textContent = displayLabel(field);
    const value = document.createElement("div");
    value.className = "result-value";
    value.textContent = field.error || field.value;
    const state = document.createElement("span");
    state.className = `result-status${field.status === "失败" || field.status === "低置信度，已跳过" ? " error" : ""}`;
    state.textContent = field.status || status;
    value.append(state);
    row.append(label, value);
    elements.operationDetails.append(row);
  }
}

function renderMissing(fields) {
  elements.missingFields.replaceChildren();
  const unique = new Map();
  for (const field of fields) {
    const key = `${field.context || ""}|${field.canonical || "custom"}|${field.record_index || 0}|${field.label.trim().toLowerCase()}`;
    if (key && !unique.has(key)) unique.set(key, field);
  }
  const values = [...unique.values()].slice(0, 50);
  elements.missingSection.hidden = values.length === 0;
  for (const field of values) {
    const row = document.createElement("div");
    row.className = "field-row";
    const label = document.createElement("label");
    label.textContent = displayLabel(field);
    if (field.required) {
      const required = document.createElement("span");
      required.textContent = "必填";
      label.append(required);
    }
    const input = document.createElement("input");
    input.type = "text";
    input.dataset.label = field.label;
    input.dataset.canonical = field.canonical || "";
    input.dataset.context = field.context || "";
    input.dataset.recordIndex = String(field.record_index || 0);
    input.placeholder = "输入后保存到当前档案";
    input.value = field.pageValue || "";
    const saveState = document.createElement("span");
    saveState.className = "save-state";
    saveState.textContent = input.value ? "网页已有值，确认后自动保存" : "";
    input.addEventListener("input", () => scheduleAutoSave(input, saveState));
    input.addEventListener("change", () => autoSaveInput(input, saveState));
    row.append(label, input, saveState);
    elements.missingFields.append(row);
  }
}

function inputField(input) {
  return {
    label: input.dataset.label,
    canonical: input.dataset.canonical,
    context: input.dataset.context,
    record_index: Number(input.dataset.recordIndex || 0),
    value: input.value.trim()
  };
}

async function persistFields(fields, createMissing = false, sourceHostname = "") {
  const valid = fields.filter((item) => item.value || createMissing);
  if (!valid.length) return null;
  const tabs = sourceHostname ? [] : await chrome.tabs.query({ active: true, currentWindow: true });
  const hostname = sourceHostname || new URL(tabs[0].url).hostname;
  const response = await request({
    type: "native",
    payload: {
      action: "save_form_fields",
      profile_id: appState.active_profile_id,
      hostname,
      create_missing: createMissing,
      fields: valid
    }
  });
  if (createMissing && !Number.isInteger(response.created)) {
    throw new Error("本地程序版本较旧，尚不支持空白字段建档，请更新本地程序后重试");
  }
  if (response.profile) appState.active_profile = response.profile;
  return response;
}

function scheduleAutoSave(input, saveState) {
  const existing = saveTimers.get(input);
  if (existing) clearTimeout(existing);
  if (!input.value.trim()) {
    saveState.textContent = "";
    return;
  }
  saveState.textContent = "等待保存...";
  saveTimers.set(input, setTimeout(() => autoSaveInput(input, saveState), 700));
}

async function autoSaveInput(input, saveState) {
  const existing = saveTimers.get(input);
  if (existing) clearTimeout(existing);
  if (!input.value.trim()) return;
  saveState.textContent = "正在保存...";
  try {
    await persistFields([inputField(input)]);
    saveState.textContent = "已保存到本地档案";
  } catch (error) {
    saveState.textContent = "保存失败";
    showMessage(error.message, true);
  }
}

async function scan() {
  setBusy(true);
  clearMessage();
  try {
    const result = await request({ type: "scan" });
    renderPage(result, false);
    showMessage(`已识别 ${result.total || 0} 个字段，当前档案已有 ${result.ready || 0} 项，仍需补充 ${(result.missing || []).length} 项。`);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function fill() {
  if (!appState) {
    showMessage("本地资料尚未加载", true);
    return;
  }
  setBusy(true);
  clearMessage();
  try {
    const result = await request({ type: "fill", overwrite: elements.overwriteToggle.checked });
    renderPage(result, true);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function importPage() {
  if (!appState) {
    showMessage("本地资料尚未加载", true);
    return;
  }
  setBusy(true);
  clearMessage();
  try {
    const scanResult = await request({ type: "scan" });
    const sensitive = /(密码|验证码|校验码|短信码|动态码|图形码|同意协议|用户协议|隐私协议|隐私政策|同意条款|阅读并同意|搜索|password|captcha|agreement|privacy|(?:^|[\W_])(?:search|otp)(?:$|[\W_]))/i;
    const fields = (scanResult.fields || [])
      .filter((field) => field.importable !== false)
      .filter((field) => field.type !== "password" && !sensitive.test(field.label || ""))
      .map((field) => ({
        label: field.label,
        canonical: field.canonical || `custom.${field.label}`,
        context: field.context || "",
        record_index: Number(field.record_index || 0),
        section_label: field.section_label || "",
        record_name: field.record_name || "",
        value: String(field.pageValue || "").trim()
      }));
    const hostname = new URL(scanResult.url || scanResult.tab.url).hostname;
    const saved = fields.length ? await persistFields(fields, true, hostname) : null;
    const importedFields = (saved?.saved || []).map((item) => {
      const source = fields.find((field) => field.label === item.label
        && field.canonical === item.canonical
        && field.record_index === item.record_index);
      return {
        ...item,
        section_label: source?.section_label || "",
        record_name: source?.record_name || "",
        value: source?.value || (item.created ? "待补充" : "页面为空，保留本地资料"),
        status: item.created ? "新增字段" : item.value_written ? "已保存" : "已保留"
      };
    });
    const updatedScan = await request({ type: "scan" });
    const result = { ...updatedScan, imported: importedFields.length, importedFields };
    renderPage(result, false);
    renderDetails("已读取到本地档案", importedFields, "已保存");
    showMessage(result.imported
      ? `已读取 ${result.imported} 个字段：保存 ${saved.values_saved || 0} 项资料，新增 ${saved.created || 0} 个字段；空白字段可在下方补充。`
      : "当前页面没有可读取的安全表单字段。");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function saveMissing() {
  const fields = [...elements.missingFields.querySelectorAll("input")]
    .map(inputField)
    .filter((item) => item.value);
  if (!fields.length) {
    showMessage("请先填写至少一个待补充字段", true);
    return;
  }
  setBusy(true);
  try {
    await persistFields(fields);
    await loadState();
    await fill();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function selectProfile() {
  setBusy(true);
  try {
    await request({ type: "native", payload: { action: "set_active_profile", profile_id: elements.profileSelect.value } });
    await loadState();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function upload() {
  if (!elements.documentSelect.value) return;
  setBusy(true);
  clearMessage();
  try {
    const result = await request({ type: "upload", documentId: elements.documentSelect.value });
    showMessage(`已将 ${result.name} 填入“${result.label || "文件上传"}”控件。`);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    setBusy(false);
  }
}

elements.scanButton.addEventListener("click", scan);
elements.fillButton.addEventListener("click", fill);
elements.importButton.addEventListener("click", importPage);
elements.saveMissingButton.addEventListener("click", saveMissing);
elements.profileSelect.addEventListener("change", selectProfile);
elements.uploadButton.addEventListener("click", upload);
elements.refreshButton.addEventListener("click", loadState);
elements.aiEnhanceButton.addEventListener("click", aiEnhance);

// API Key 保存/加载
elements.apiKeyInput.addEventListener("change", () => {
  chrome.storage.local.set({ deepseek_api_key: elements.apiKeyInput.value });
});

// 语义增强方式切换时显示/隐藏设置
elements.aiMethodSelect.addEventListener("change", () => {
  const method = elements.aiMethodSelect.value;
  if (method === "cloud") {
    elements.cloudSettings.hidden = false;
  } else {
    elements.cloudSettings.hidden = true;
  }
});

// 服务商切换时，自动填充endpoint和模型
elements.providerSelect.addEventListener("change", () => {
  const provider = elements.providerSelect.value;
  const config = PROVIDERS[provider];
  if (config) {
    elements.apiEndpoint.value = config.endpoint;
    elements.modelName.value = config.model;
  }
});

// 保存配置到storage
function saveCloudConfig() {
  const config = {
    provider: elements.providerSelect.value,
    endpoint: elements.apiEndpoint.value,
    model: elements.modelName.value,
    apiKey: elements.apiKeyInput.value
  };
  chrome.storage.local.set({ cloud_config: config });
}

// 监听配置变化
elements.apiKeyInput.addEventListener("change", saveCloudConfig);
elements.apiEndpoint.addEventListener("change", saveCloudConfig);
elements.modelName.addEventListener("change", saveCloudConfig);

// 加载保存的配置
chrome.storage.local.get(["cloud_config", "ai_method"]).then((data) => {
  if (data.cloud_config) {
    elements.providerSelect.value = data.cloud_config.provider || "deepseek";
    elements.apiEndpoint.value = data.cloud_config.endpoint || PROVIDERS.deepseek.endpoint;
    elements.modelName.value = data.cloud_config.model || PROVIDERS.deepseek.model;
    elements.apiKeyInput.value = data.cloud_config.apiKey || "";
  }
  if (data.ai_method) {
    elements.aiMethodSelect.value = data.ai_method;
    if (data.ai_method === "cloud") {
      elements.cloudSettings.hidden = false;
    }
  }
});

// 保存选择的方式
elements.aiMethodSelect.addEventListener("change", () => {
  chrome.storage.local.set({ ai_method: elements.aiMethodSelect.value });
});

// AI语义增强
async function aiEnhance() {
  const apiKey = elements.apiKeyInput.value.trim();
  const aiMethod = elements.aiMethodSelect ? elements.aiMethodSelect.value : "local";
  
  try {
    setBusy(true);
    
    // 先扫描页面
    const scanResult = await request({ type: "scanForm" });
    const fields = scanResult.fields || [];
    
    // 过滤出需要分析的字段
    const fieldsToAnalyze = fields.slice(0, 30); // 最多分析30个字段
    
    let mappings = {};
    let methodName;
    
    if (aiMethod === "cloud") {
      // 云端AI模式
      const endpoint = elements.apiEndpoint.value.trim();
      const model = elements.modelName.value.trim();
      
      if (!apiKey || !endpoint || !model) {
        showMessage("请配置完整的云端API信息", true);
        return;
      }
      
      showMessage(`正在调用${PROVIDERS[elements.providerSelect.value]?.name || "云端AI"}...`);
      const aiResult = await callCloudAI(fieldsToAnalyze, apiKey, endpoint, model);
      
      for (const [indexStr, canonical] of Object.entries(aiResult)) {
        const index = parseInt(indexStr) - 1;
        if (fields[index] && canonical) {
          mappings[fields[index].label] = canonical;
        }
      }
      methodName = "云端AI";
      
    } else {
      // 纯本地模式
      showMessage("正在运行Ternlight本地语义模型...");
      const localResult = localSemanticMatch(fieldsToAnalyze);
      
      for (const [indexStr, canonical] of Object.entries(localResult)) {
        const index = parseInt(indexStr) - 1;
        if (fields[index] && canonical) {
          mappings[fields[index].label] = canonical;
        }
      }
      methodName = "Ternlight本地模型";
    }
    
    // 保存mappings，下次扫描时使用
    await chrome.storage.local.set({ ai_mappings: mappings });
    
    showMessage(`${methodName}完成！匹配了 ${Object.keys(mappings).length} 个字段`);
    
    // 重新扫描
    await scan();
  } catch (error) {
    showMessage(`语义增强失败: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

loadState();

