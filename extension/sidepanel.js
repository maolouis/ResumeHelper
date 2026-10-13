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
  aiEnhanceButton: document.querySelector("#aiEnhanceButton")
};

let appState = null;
const saveTimers = new WeakMap();
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
    chrome.runtime.sendMessage(message, (response) => {
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

// 豆包API语义分析
async function callDoubaoAI(fields, apiKey) {
  if (!apiKey) {
    throw new Error("请先配置豆包API Key");
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
    const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "doubao-pro-4k",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`API调用失败: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // 解析JSON
    const result = JSON.parse(content);
    return result;
  } catch (error) {
    console.error("豆包API调用失败:", error);
    throw error;
  }
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
  chrome.storage.local.set({ doubao_api_key: elements.apiKeyInput.value });
});

// 加载API Key
chrome.storage.local.get("doubao_api_key").then((data) => {
  if (data.doubao_api_key) {
    elements.apiKeyInput.value = data.doubao_api_key;
  }
});

// AI语义增强
async function aiEnhance() {
  const apiKey = elements.apiKeyInput.value.trim();
  if (!apiKey) {
    showMessage("请先输入豆包API Key", true);
    return;
  }
  
  try {
    setBusy(true);
    showMessage("正在调用AI语义分析...");
    
    // 先扫描页面
    const scanResult = await request({ type: "scanForm" });
    const fields = scanResult.fields || [];
    
    // 过滤出需要分析的字段
    const fieldsToAnalyze = fields.slice(0, 20); // 最多分析20个字段
    
    // 调用豆包API
    const aiResult = await callDoubaoAI(fieldsToAnalyze, apiKey);
    
    // 把AI结果转成mappings格式
    const mappings = {};
    for (const [indexStr, canonical] of Object.entries(aiResult)) {
      const index = parseInt(indexStr) - 1;
      if (fields[index] && canonical) {
        const label = fields[index].label;
        mappings[label] = canonical;
      }
    }
    
    // 保存mappings，下次扫描时使用
    await chrome.storage.local.set({ ai_mappings: mappings });
    
    showMessage(`AI语义分析完成，识别了 ${Object.keys(mappings).length} 个字段映射`);
    
    // 重新扫描
    await scan();
  } catch (error) {
    showMessage(`AI分析失败: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
}

loadState();

