(() => {
  const CONTENT_VERSION = "0.4.6";
  if (globalThis.__resumeHelperContentLoaded === CONTENT_VERSION) {
    return;
  }
  if (globalThis.__resumeHelperMessageListener) {
    chrome.runtime.onMessage.removeListener(globalThis.__resumeHelperMessageListener);
  }
  globalThis.__resumeHelperContentLoaded = CONTENT_VERSION;

  const SELECT_WRAPPERS = ".ui-select, .ant-select, .el-select, .el-cascader, .ivu-select, .arco-select, .semi-select, [role='combobox'], [aria-haspopup='listbox']";
  const DATE_WRAPPERS = ".ant-picker, .el-date-editor, .ivu-date-picker, .arco-picker, .semi-datepicker, [class*='date-picker'], [class*='month-picker']";
  const RADIO_GROUPS = ".radio-group, .ant-radio-group, .el-radio-group, .ivu-radio-group, [role='radiogroup']";

  const uploads = new Map();
  const ADD_PATTERNS = {
    job_intentions: /(?:新增|添加).{0,8}(?:求职意向|应聘意向)/,
    education: /(?:新增|添加).{0,8}(?:教育|学习)/,
    work_experience: /(?:新增|添加).{0,8}(?:工作|实习)/,
    projects: /(?:新增|添加).{0,8}项目/,
    campus_experience: /(?:新增|添加).{0,8}(?:在校实践|校内实践|校园|社团|学生)/,
    volunteer_experience: /(?:新增|添加).{0,8}(?:社会实践|志愿|公益)/,
    certificates_awards: /(?:新增|添加).{0,8}(?:证书|奖项|荣誉)/,
    language_skills: /(?:新增|添加).{0,8}(?:语言|外语)/,
    professional_skills: /(?:新增|添加).{0,8}(?:专业技能|技能)/,
    trainings: /(?:新增|添加).{0,8}培训/,
    publications: /(?:新增|添加).{0,8}(?:论文|著作|发表)/,
    patents: /(?:新增|添加).{0,8}(?:专利|软著|软件著作权)/,
    family_members: /(?:新增|添加).{0,8}(?:家庭|家属|亲属)/,
    emergency_contacts: /(?:新增|添加).{0,8}紧急联系人/,
    references: /(?:新增|添加).{0,8}(?:证明人|推荐人)/
  };
  const CONTEXT_PATTERNS = [
    ["emergency_contacts", /紧急联系人|应急联系人/],
    ["family_members", /家庭成员|家属信息|亲属信息/],
    ["references", /证明人|推荐人|背调联系人/],
    ["job_intentions", /求职意向|应聘意向|职业意向/],
    ["education", /教育经历|教育背景|学历信息|学习经历|education/i],
    ["work_experience", /工作经历|实习经历|工作\/实习|任职经历|实习/],
    ["projects", /项目经历|项目经验|项目/],
    ["campus_experience", /在校实践|校内实践|校园实践|校园经历|社团|学生工作/],
    ["volunteer_experience", /志愿|社会实践|公益活动/],
    ["certificates_awards", /证书|奖项|荣誉|获奖|奖励/],
    ["language_skills", /语言能力|外语能力|英语能力|语言水平/],
    ["professional_skills", /专业技能|技能清单|IT技能|技能特长/],
    ["trainings", /培训经历|培训信息/],
    ["publications", /论文|著作|发表成果/],
    ["patents", /专利|软著|软件著作权/]
  ];
  const REPEATABLE_SECTIONS = Object.keys(ADD_PATTERNS);
  const LONG_TEXT_KEYS = ["skills", "personal_advantages", "self_evaluation", "hobbies", "career_plan", "research_summary"];
  const SECTION_LABELS = {
    job_intentions: "求职意向", education: "教育经历", work_experience: "工作/实习经历", projects: "项目经历",
    campus_experience: "在校实践/校园经历", volunteer_experience: "社会实践/志愿经历", certificates_awards: "证书与奖项",
    language_skills: "语言能力", professional_skills: "专业技能", trainings: "培训经历", publications: "论文/著作",
    patents: "专利/软件著作权", family_members: "家庭成员", emergency_contacts: "紧急联系人", references: "证明人/推荐人"
  };
  const RECORD_TITLE_KEYS = {
    job_intentions: ["position", "city"], education: ["school", "degree", "major"], work_experience: ["company", "position"],
    projects: ["name", "role"], campus_experience: ["organization", "role"], volunteer_experience: ["organization", "role"],
    certificates_awards: ["name", "level"], language_skills: ["language", "certificate"], professional_skills: ["name"],
    trainings: ["name", "provider"], publications: ["title", "publication"], patents: ["name", "number"],
    family_members: ["name", "relationship"], emergency_contacts: ["name", "relationship"], references: ["name", "company"]
  };

  function deepQueryAll(selector, root = document) {
    const found = [...root.querySelectorAll(selector)];
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) {
        found.push(...deepQueryAll(selector, element.shadowRoot));
      }
    }
    return found;
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\s\u00a0:*：?？!！,，.。;；()（）\[\]【】_\-/\\]/g, "")
      .replace(/必填|required/g, "")
      .trim();
  }

  function semanticNormalize(value) {
    return normalize(value)
      .replace(/电子邮件地址|电子邮件|电子邮箱|邮箱地址|邮件地址|emailaddress/g, "邮箱")
      .replace(/手机号码|移动电话|联系手机|联系电话|电话号码|mobilenumber|phonenumber/g, "手机")
      .replace(/毕业学校|毕业院校|院校名称|学校名称/g, "学校")
      .replace(/最高学历|最高教育程度|学历层次/g, "学历")
      .replace(/毕业日期|毕业年月|毕业时间/g, "结束时间")
      .replace(/graduationschool|schoolname|institution|university/g, "学校")
      .replace(/highestdegree|educationlevel|academicdegree/g, "学历")
      .replace(/graduationdate|graduationtime|educationenddate/g, "结束时间")
      .replace(/职位名称|应聘岗位|意向职位/g, "岗位")
      .replace(/起始日期|起始时间/g, "开始时间")
      .replace(/截止日期|终止时间/g, "结束时间")
      .replace(/工作城市|意向城市/g, "期望工作地点");
  }

  function similarity(left, right) {
    const a = semanticNormalize(left);
    const b = semanticNormalize(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const previous = Array.from({ length: b.length + 1 }, (_item, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const above = previous[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
        diagonal = above;
      }
    }
    return 1 - previous[b.length] / Math.max(a.length, b.length);
  }

  function incompatibleField(label, canonical, context) {
    const normalized = normalize(label);
    const relatedPerson = /紧急联系人|应急联系人|家庭成员|家属|亲属|父亲|母亲|配偶|子女|推荐人|证明人|联系人关系/.test(normalized);
    if (relatedPerson && ["basic.full_name", "basic.phone", "basic.email"].includes(canonical)) return true;
    const section = canonical.match(/^([a-z_]+)\[\]\./)?.[1] || "";
    return Boolean(context && section && section !== context);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").replace(/^\s*[＊*]\s*/, "").trim();
  }

  function directText(element) {
    if (!element) return "";
    return cleanText([...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ") || element.getAttribute?.("aria-label") || element.getAttribute?.("title"));
  }

  function contextFromText(text) {
    const cleaned = cleanText(text);
    if (!cleaned || cleaned.length > 100) return null;
    for (const [key, pattern] of CONTEXT_PATTERNS) {
      if (pattern.test(cleaned)) return { key, text: cleaned };
    }
    return null;
  }

  function isVisible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getContainer(control) {
    return control.closest(
      ".ant-form-item, .el-form-item, .ivu-form-item, .arco-form-item, .semi-form-field, .ui-form-item, [class*='form-item'], [class*='formItem'], [class*='field-item'], [class*='form-field'], [data-field]"
    );
  }

  function getLabelCandidates(control, includeTechnical = true) {
    const pieces = [];
    if (control.matches(RADIO_GROUPS) || control.type === "radio" || control.getAttribute("role") === "radio") {
      const group = radioGroupContainer(control);
      const groupLabel = group && [...group.querySelectorAll(
        ":scope > label, :scope > [class*='form-label'], :scope > [class*='field-label'], :scope > [class*='item-label'], legend"
      )].find((item) => !item.querySelector("input[type='radio'], [role='radio']"));
      const text = cleanText(groupLabel?.innerText || groupLabel?.textContent);
      if (text) pieces.push(text);
    }
    if (control.labels) {
      for (const label of control.labels) pieces.push(label.innerText);
    }
    const aria = control.getAttribute("aria-label");
    if (aria) pieces.push(aria);
    const labelledBy = control.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) pieces.push(node.innerText || node.textContent);
      }
    }
    const widgetLabel = control.querySelector?.(".label-text, .label-prefix");
    if (widgetLabel) pieces.push(widgetLabel.innerText || widgetLabel.textContent);
    const container = getContainer(control);
    if (container) {
      const labels = container.querySelectorAll(
        "label, [class*='label'], [class*='title'], [class*='field-name'], [class*='item-name'], [class*='control-name'], [class*='form-label'], [class*='label-text'], [class*='title-text'], .required, [data-label]"
      );
      for (const label of labels) {
        if (label !== control && label.querySelector?.("input, select, textarea, [role='combobox'], [role='radio']")) continue;
        const text = cleanText(label.innerText || label.textContent);
        if (text && text.length <= 80) pieces.push(text);
      }
      const ownText = directText(container);
      if (ownText && ownText.length <= 80) pieces.push(ownText);
    }
    if (!pieces.some((piece) => cleanText(piece))) {
      let parent = control.parentElement;
      for (let depth = 0; parent && depth < 3; depth += 1, parent = parent.parentElement) {
        const label = parent.querySelector(
          ":scope > label, :scope > [class*='label'], :scope > [class*='title'], :scope > [class*='field-name'], :scope > [class*='item-name'], :scope > [class*='form-label']"
        );
        const text = cleanText(label?.innerText || label?.textContent);
        if (text && text.length <= 80) { pieces.push(text); break; }
      }
    }
    // 从控件的前一个兄弟元素提取 label（很多自研表单用兄弟 div 做标签）
    if (!pieces.some((piece) => cleanText(piece))) {
      let sibling = control;
      for (let depth = 0; depth < 3 && sibling; depth += 1, sibling = sibling.parentElement) {
        const prev = sibling.previousElementSibling;
        if (prev && isVisible(prev)) {
          const text = cleanText(prev.innerText || prev.textContent);
          if (text && text.length <= 40) { pieces.push(text); break; }
        }
      }
    }
    const metadataNodes = [control, control.querySelector?.("input:not([type='hidden']), textarea, select")].filter(Boolean);
    for (const node of metadataNodes) {
      const placeholder = node.getAttribute("placeholder");
      if (placeholder) pieces.push(placeholder.replace(/^(请输入|请选择|请填写)/, ""));
      if (includeTechnical) {
        for (const attribute of ["name", "id", "data-field", "data-name", "data-label", "formcontrolname"]) {
          const value = node.getAttribute(attribute);
          if (value && !/^\d+$/.test(value)) pieces.push(value);
        }
      }
    }
    const unique = [...new Set(pieces.map(cleanText).filter(Boolean))];
    return unique;
  }

  function getLabel(control) {
    return getLabelCandidates(control, false).join(" / ").slice(0, 160);
  }

  function getContext(control) {
    let node = getContainer(control) || control.parentElement;
    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      const own = contextFromText(directText(node));
      if (own) return own;
      const headings = node.querySelectorAll(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > [class*='title'], :scope > [class*='header']");
      for (const heading of headings) {
        if (heading.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) {
          const matched = contextFromText(directText(heading) || heading.innerText || heading.textContent);
          if (matched) return matched;
        }
      }
    }
    const headings = [...document.querySelectorAll(
      "h1,h2,h3,h4,legend,[class*='section-title'],[class*='section-header'],[class*='block-title'],[class*='module-title'],button,[role='button']"
    )].filter(isVisible);
    const top = control.getBoundingClientRect().top;
    let nearest = null;
    for (const heading of headings) {
      if (!contextFromText(directText(heading) || heading.innerText || heading.textContent)) continue;
      const rect = heading.getBoundingClientRect();
      if (rect.top <= top && (!nearest || rect.top > nearest.getBoundingClientRect().top)) nearest = heading;
    }
    const matched = contextFromText(directText(nearest) || nearest?.innerText || nearest?.textContent);
    if (matched) return matched;
    return { key: "", text: "" };
  }

  function controlType(control) {
    if (control.matches(RADIO_GROUPS)) return "radiogroup";
    if (control.getAttribute("role") === "radio") return "radio";
    if (control.matches(DATE_WRAPPERS)) return "datewidget";
    if (control.matches(SELECT_WRAPPERS) && !control.matches("select")) return "combobox";
    if (control.matches("select")) return "select";
    if (control.matches("textarea")) return "textarea";
    if (control.isContentEditable) return "contenteditable";
    return (control.getAttribute("type") || control.getAttribute("role") || "text").toLowerCase();
  }

  function currentValue(control) {
    if (control.matches(RADIO_GROUPS)) {
      const selected = control.querySelector("input[type='radio']:checked, [role='radio'][aria-checked='true'], .radio-checked, .ant-radio-wrapper-checked, .el-radio.is-checked");
      return selected ? radioText(selected) : "";
    }
    if (control.type === "radio" || control.getAttribute("role") === "radio") {
      const group = radioControls(control);
      const selected = group.find((item) => item.checked || item.getAttribute("aria-checked") === "true");
      return selected ? radioText(selected) : "";
    }
    if (control.type === "checkbox") return control.checked ? control.value || "true" : "";
    const widget = control.closest(".select__control, [class*='select__control']")
      || control.closest(`${SELECT_WRAPPERS}, ${DATE_WRAPPERS}`);
    if (widget) {
      const selected = widget.querySelector(".ui-select-selected-value, .ant-select-selection-item, .ivu-select-selected-value, .el-select__selected-item:not(.is-transparent), .select__single-value, [class*='single-value'], [data-selected-value]");
      if (selected) return cleanText(selected.getAttribute("title") || selected.innerText || selected.textContent);
      const input = control.matches("input") ? control : widget.querySelector("input:not([type='hidden'])");
      return String(input?.value || "").trim();
    }
    if (control.isContentEditable) return cleanText(control.innerText);
    return String(control.value || "").trim();
  }

  function isSafePageField(type, label) {
    if (type === "password") return false;
    return !/(密码|验证码|校验码|短信码|动态码|图形码|验证代码|一次性代码|同意协议|用户协议|隐私协议|隐私政策|同意条款|阅读并同意|搜索|password|passwd|verificationcode|captcha|agreement|privacy)/i.test(normalize(label))
      && !/(?:^|[\W_])(?:search|otp)(?:$|[\W_])/i.test(label);
  }

  // 判断是否是页面顶部/导航栏的职位搜索框（不是申请表单字段）
  function isNavigationSearch(control, labelCandidates) {
    const labelText = labelCandidates.join(" ").toLowerCase();
    // 明显的导航搜索关键词
    if (!/搜索.*(职位|工作|岗位|人才|简历)|search.*(job|position|opening|candidate)|职位.*搜索|工作.*搜索|岗位.*搜索|关键字|关键词|keyword/i.test(labelText)) {
      return false;
    }
    // 如果控件在标准表单容器内，可能是申请表单中的搜索（如自动补全学校），不排除
    if (control.closest(".ant-form-item, .el-form-item, .arco-form-item, .semi-form-field, .el-form-item, [class*='form-item'], [class*='formItem'], [class*='application'], [class*='apply-form'], [class*='resume-form']")) {
      return false;
    }
    // 位于 header/nav/toolbar 中
    if (control.closest("header, nav, [class*='site-header'], [class*='page-header'], [class*='navbar'], [class*='toolbar'], [class*='search-bar'], [class*='searchbar']")) {
      return true;
    }
    // 没有表单容器，且 label 是搜索类，视为导航搜索
    return !control.closest("[class*='form'], [class*='field-group'], [class*='question']");
  }

  function radioControls(control) {
    if (control.matches(RADIO_GROUPS)) return [...control.querySelectorAll("input[type='radio'], [role='radio'], .radio-item")];
    const container = radioGroupContainer(control);
    const nearby = container ? [...container.querySelectorAll("input[type='radio'], [role='radio']")] : [];
    if (nearby.length > 1) return nearby;
    if (control.name) return deepQueryAll(`input[type='radio'][name='${CSS.escape(control.name)}']`, control.form || document);
    return nearby.length ? nearby : [control];
  }

  function radioGroupContainer(control) {
    return control.closest(RADIO_GROUPS)
      || getContainer(control)
      || control.closest("fieldset, [class*='field'], [class*='item'], [class*='row']")
      || control.parentElement;
  }

  function radioText(control) {
    const label = control.closest("label, .radio-item, .radio, .ant-radio-wrapper, .el-radio, .ivu-radio-wrapper") || control;
    return cleanText(label.innerText || label.textContent || control.getAttribute("aria-label") || control.value);
  }

  function selectedRadio(control) {
    return radioControls(control).find((item) => item.checked
      || item.getAttribute("aria-checked") === "true"
      || item.matches(".radio-checked, .ant-radio-wrapper-checked, .el-radio.is-checked"));
  }

  function hasOnlyDefaultRadioValue(control) {
    const selected = selectedRadio(control);
    return Boolean(selected && (selected.defaultChecked || selected.hasAttribute("checked") || selected.getAttribute("data-default-checked") === "true"));
  }

  function controls() {
    const seen = new Set();
    return deepQueryAll(`input, select, textarea, [contenteditable='true'], [role='radio'], ${SELECT_WRAPPERS}, ${DATE_WRAPPERS}, ${RADIO_GROUPS}`)
      .map((element) => element.closest(RADIO_GROUPS)
        || element.closest(SELECT_WRAPPERS)
        || element.closest(DATE_WRAPPERS)
        || element)
      .filter((element, index, items) => items.indexOf(element) === index)
      .filter((element) => {
        if (element.disabled || element.getAttribute("aria-disabled") === "true"
          || element.matches(".ui-select-disabled, .ant-select-disabled, .ivu-select-disabled")
          || element.querySelector("input:disabled")) return false;
        if (element.closest(".ui-select-dropdown, .ant-select-dropdown, .el-select-dropdown, .ivu-select-dropdown")) return false;
        if (!element.readOnly) return true;
        return element.getAttribute("role") === "combobox"
          || /select|picker|dropdown/i.test(String(element.className || ""))
          || Boolean(element.closest("[class*='select'], [class*='picker'], [class*='date']"));
      })
      .filter((element) => !["hidden", "submit", "button", "reset", "file", "image", "password"].includes(controlType(element)))
      .filter((element) => isVisible(element) || (element.type === "radio" && isVisible(element.closest("label") || element.parentElement)))
      .filter((element) => {
        const key = element.type === "radio" || element.getAttribute("role") === "radio" ? radioControls(element)[0] : element;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((control) => {
        const context = getContext(control);
        return {
          control,
          label: getLabel(control),
          labelCandidates: getLabelCandidates(control),
          context: context.key,
          contextText: context.text,
          type: controlType(control),
          required: Boolean(control.required || control.getAttribute("aria-required") === "true" || /[*＊]/.test(getContainer(control)?.innerText || "")),
          value: currentValue(control)
        };
      })
      .filter((descriptor) => descriptor.label)
      .filter((descriptor) => !isNavigationSearch(descriptor.control, descriptor.labelCandidates));
  }

  function flattenProfile(profile) {
    const values = {};
    for (const [key, value] of Object.entries(profile.basic || {})) values[`basic.${key}`] = value;
    for (const section of REPEATABLE_SECTIONS) {
      const rows = profile[section] || [];
      const keys = new Set(rows.flatMap((row) => Object.keys(row).filter((key) => key !== "id")));
      for (const key of keys) values[`${section}[].${key}`] = rows.map((row) => row[key] || "");
    }
    for (const key of LONG_TEXT_KEYS) values[key] = profile[key] || "";
    for (const [label, value] of Object.entries(profile.custom_fields || {})) values[`custom.${label}`] = value;
    return values;
  }

  function primaryEducationIndex(profile) {
    const ranks = { "博士": 7, "博士研究生": 7, "硕士": 6, "硕士研究生": 6, "研究生": 5, "本科": 4, "学士": 4, "大专": 3, "专科": 3, "高中": 2, "中专": 2 };
    const rows = profile?.education || [];
    let bestIndex = 0;
    let bestScore = -1;
    rows.forEach((row, index) => {
      const degree = cleanText(row.degree || row.degree_name);
      const rank = Object.entries(ranks).find(([name]) => degree.includes(name))?.[1] || 0;
      const dateScore = Number(String(row.end_date || row.expected_graduation || "").replace(/\D/g, "").slice(0, 8)) || 0;
      const score = rank * 100000000 + dateScore;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function selectProfileValue(profile, values, canonical, descriptor, counters, canonicalCounts) {
    if (!canonical.includes("[]")) return { desired: values[canonical], recordIndex: 0 };
    const section = canonical.match(/^([a-z_]+)\[\]\./)?.[1] || "";
    const labels = descriptorLabels(descriptor).join(" ");
    const educationSummary = section === "education"
      && /(最高|毕业学校|毕业院校|毕业时间|毕业日期|毕业年月)/.test(labels)
      && (/(最高)/.test(labels) || canonicalCounts[canonical] === 1);
    const splitDatePart = /(?:month|year|月份|年份)/i.test(labels)
      && /(?:date|time|开始|结束|入学|毕业)/i.test(labels)
      && canonicalCounts[canonical] > 1;
    const occurrence = counters[canonical] || 0;
    const recordIndex = educationSummary
      ? primaryEducationIndex(profile)
      : splitDatePart ? Math.floor(occurrence / 2) : occurrence;
    if (!educationSummary) counters[canonical] = occurrence + 1;
    const desired = Array.isArray(values[canonical]) ? values[canonical][recordIndex] || "" : "";
    return { desired, recordIndex };
  }

  function countCanonicals(pageControls, mappings) {
    const counts = {};
    for (const descriptor of pageControls) {
      const canonical = resolveCanonical(descriptor, mappings);
      if (canonical) counts[canonical] = (counts[canonical] || 0) + 1;
    }
    return counts;
  }

  function contextFallback(label, context) {
    const value = normalize(label);
    if (!context) return "";
    const map = {
      job_intentions: [
        [/(职位|岗位)/, "job_intentions[].position"], [/(城市|地点)/, "job_intentions[].city"], [/行业/, "job_intentions[].industry"],
        [/(性质|类型)/, "job_intentions[].employment_type"], [/薪资/, "job_intentions[].salary"], [/到岗/, "job_intentions[].available_date"]
      ],
      education: [
        [/(学校|院校)/, "education[].school"], [/(学历|学位)/, "education[].degree"], [/专业/, "education[].major"],
        [/(院系|学院)/, "education[].department"], [/(绩点|gpa|平均成绩)/, "education[].gpa"], [/排名/, "education[].rank"],
        [/导师/, "education[].adviser"], [/(入学|开始)/, "education[].start_date"], [/(毕业|结束)/, "education[].end_date"],
        [/研究方向/, "education[].research_direction"], [/课程/, "education[].courses"], [/(描述|经历)/, "education[].description"]
      ],
      work_experience: [
        [/(公司|单位)/, "work_experience[].company"], [/(职位|岗位)/, "work_experience[].position"],
        [/部门/, "work_experience[].department"], [/行业/, "work_experience[].industry"], [/(地点|城市)/, "work_experience[].city"],
        [/开始|入职/, "work_experience[].start_date"], [/结束|离职时间/, "work_experience[].end_date"], [/离职原因/, "work_experience[].reason_for_leaving"],
        [/(描述|内容|职责)/, "work_experience[].description"]
      ],
      projects: [
        [/项目名称/, "projects[].name"], [/(角色|职务)/, "projects[].role"], [/(技术|工具)/, "projects[].technologies"],
        [/开始/, "projects[].start_date"], [/结束/, "projects[].end_date"], [/(描述|内容|职责)/, "projects[].description"]
      ],
      campus_experience: [
        [/(实践名称|活动名称|组织名称|社团名称|学校组织)/, "campus_experience[].organization"], [/(角色|职务)/, "campus_experience[].role"],
        [/开始/, "campus_experience[].start_date"], [/结束/, "campus_experience[].end_date"], [/至今|是否仍在/, "campus_experience[].is_current"],
        [/(实践描述|活动描述|经历描述|实践内容|工作内容)/, "campus_experience[].description"]
      ],
      certificates_awards: [
        [/(名称|证书|奖项|荣誉)/, "certificates_awards[].name"], [/(等级|名次|级别)/, "certificates_awards[].level"],
        [/(日期|时间)/, "certificates_awards[].date"], [/说明/, "certificates_awards[].description"]
      ],
      volunteer_experience: [
        [/(组织|单位|活动)/, "volunteer_experience[].organization"], [/(角色|职务)/, "volunteer_experience[].role"],
        [/开始/, "volunteer_experience[].start_date"], [/结束/, "volunteer_experience[].end_date"], [/时长/, "volunteer_experience[].hours"],
        [/(描述|内容|经历)/, "volunteer_experience[].description"]
      ],
      language_skills: [
        [/(语种|语言)/, "language_skills[].language"], [/(水平|程度)/, "language_skills[].level"],
        [/证书/, "language_skills[].certificate"], [/成绩|分数/, "language_skills[].score"]
      ],
      professional_skills: [
        [/(技能|软件)名称/, "professional_skills[].name"], [/(水平|程度|熟练)/, "professional_skills[].level"],
        [/年限/, "professional_skills[].years"], [/(说明|描述)/, "professional_skills[].description"]
      ],
      trainings: [
        [/名称|课程/, "trainings[].name"], [/机构|单位/, "trainings[].provider"], [/开始/, "trainings[].start_date"],
        [/结束/, "trainings[].end_date"], [/证书/, "trainings[].certificate"], [/(内容|描述)/, "trainings[].description"]
      ],
      publications: [
        [/题目|名称/, "publications[].title"], [/期刊|会议|刊物/, "publications[].publication"], [/作者|排名/, "publications[].authors"],
        [/时间|日期/, "publications[].publication_date"], [/状态|收录/, "publications[].status"], [/doi|链接/, "publications[].doi"]
      ],
      patents: [
        [/名称/, "patents[].name"], [/申请号|专利号|登记号|编号/, "patents[].number"], [/类型/, "patents[].type"],
        [/状态/, "patents[].status"], [/申请时间|申请日/, "patents[].application_date"], [/授权时间|授权日/, "patents[].authorization_date"]
      ],
      family_members: [
        [/姓名/, "family_members[].name"], [/关系/, "family_members[].relationship"], [/出生/, "family_members[].birth_date"],
        [/单位/, "family_members[].work_unit"], [/职务/, "family_members[].position"], [/电话|手机/, "family_members[].phone"]
      ],
      emergency_contacts: [
        [/姓名/, "emergency_contacts[].name"], [/关系/, "emergency_contacts[].relationship"], [/电话|手机/, "emergency_contacts[].phone"],
        [/邮箱/, "emergency_contacts[].email"], [/地址/, "emergency_contacts[].address"]
      ],
      references: [
        [/姓名/, "references[].name"], [/关系/, "references[].relationship"], [/单位|公司/, "references[].company"],
        [/职务/, "references[].position"], [/电话|手机/, "references[].phone"], [/邮箱/, "references[].email"]
      ]
    };
    for (const [pattern, canonical] of map[context] || []) {
      if (pattern.test(value)) return canonical;
    }
    return "";
  }

  const MIN_CLASSIFIER_CONFIDENCE = 0.7;
  const STRONG_FIELD_RULES = [
    [/^(?:毕业学校|毕业院校|学校名称|最高学历学校|最高毕业院校|graduationschool|institution|university)$/i, "education[].school"],
    [/^(?:最高学历|学历|学历层次|最高教育程度|highestdegree|educationlevel|academicdegree)$/i, "education[].degree"],
    [/^(?:专业|所学专业|专业名称|major|fieldofstudy)$/i, "education[].major"],
    [/^(?:学历类型|学习形式|培养方式|学制)$/i, "education[].study_type"],
    [/^(?:毕业时间|毕业日期|毕业年月|起止时间|最高学历毕业时间|graduationdate|graduationtime|educationenddate)$/i, "education[].end_date"],
    [/^(?:性别|gender|sex)$/i, "basic.gender"],
    [/^(?:国籍|nationality|countryofcitizenship)$/i, "basic.nationality_country"],
    [/^(?:家乡|籍贯|生源地|nativeplace|hometown)$/i, "basic.native_place"],
    [/^(?:证件类型|idtype)$/i, "basic.id_type"],
    [/^(?:证件号码|身份证号|身份证号码|idnumber)$/i, "basic.id_number"],
    [/^(?:期望工作地点|期望城市|意向城市|preferredcity)$/i, "basic.preferred_city"],
    [/^(?:country|国家|地区|所在国家)$/i, "basic.nationality_country"],
    [/^(?:linkedin|linkedIn profile|领英)$/i, "basic.linkedin"],
    [/^(?:website|个人网站|个人主页|portfolio|作品链接|个人链接)$/i, "basic.website"]
  ];

  function descriptorLabels(descriptor) {
    return [...new Set([...(descriptor.labelCandidates || []), descriptor.label].map(cleanText).filter(Boolean))];
  }

  function classifyCanonical(descriptor, mappings) {
    const labels = descriptorLabels(descriptor);
    const normalizedLabels = labels.map(normalize).filter(Boolean);
    const label = normalize(descriptor.label);
    const hostname = location.hostname;
    const siteMappings = mappings?.sites?.[hostname] || {};
    for (const candidate of labels) {
      const compact = normalize(candidate);
      const strong = STRONG_FIELD_RULES.find(([pattern]) => pattern.test(compact));
      if (strong) return { canonical: strong[1], confidence: 0.995, reason: "明确字段规则" };
    }
    const contextualKey = descriptor.context ? `${descriptor.context}::${descriptor.label}` : "";
    if (contextualKey && siteMappings[contextualKey]
      && !incompatibleField(descriptor.label, siteMappings[contextualKey], descriptor.context)) {
      return { canonical: siteMappings[contextualKey], confidence: 1, reason: "站点上下文映射" };
    }
    const compatibleSiteMappings = Object.entries(siteMappings)
      .filter(([siteLabel, canonical]) => !siteLabel.includes("::")
        && !incompatibleField(descriptor.label, canonical, descriptor.context));
    for (const [siteLabel, canonical] of compatibleSiteMappings) {
      if (normalizedLabels.some((candidate) => normalize(siteLabel) === candidate
        || semanticNormalize(siteLabel) === semanticNormalize(candidate))) {
        return { canonical, confidence: 0.99, reason: "站点映射" };
      }
    }
    for (const [siteLabel, canonical] of compatibleSiteMappings) {
      const confidence = Math.max(0, ...normalizedLabels.map((candidate) => similarity(siteLabel, candidate)));
      if (confidence >= 0.86) return { canonical, confidence, reason: "相似站点映射" };
    }
    let best = { canonical: "", score: 0 };
    for (const [canonical, aliases] of Object.entries(mappings?.global || {})) {
      if (incompatibleField(descriptor.label, canonical, descriptor.context)) continue;
      for (const aliasRaw of aliases) {
        const alias = normalize(aliasRaw);
        if (!alias) continue;
        let score = 0;
        for (const candidate of normalizedLabels) {
          const semanticLabel = semanticNormalize(candidate);
          const semanticAlias = semanticNormalize(alias);
          const asciiAlias = /^[a-z0-9]+$/.test(alias);
          let candidateScore = 0;
          if (candidate === alias) candidateScore = 1000 + alias.length;
          else if (semanticLabel === semanticAlias) candidateScore = 940 + semanticAlias.length;
          else if (!asciiAlias && candidate.includes(alias) && alias.length >= 2) candidateScore = 720 + alias.length;
          else if (!asciiAlias && alias.includes(candidate) && candidate.length >= 3) candidateScore = 620 + candidate.length;
          const fuzzy = similarity(candidate, alias);
          if (fuzzy >= 0.72 && Math.min(candidate.length, alias.length) >= 3) candidateScore = Math.max(candidateScore, 520 + Math.round(fuzzy * 100));
          score = Math.max(score, candidateScore);
        }
        // 长文本问题（如 textarea 的完整题目）不应仅因题目中碰巧提到某个词就匹配字段；
        // 只有短 label 才做 combined.includes 加成。
        const labelLen = normalize(descriptor.label).length;
        if (labelLen <= 60) {
          const combined = normalize(`${descriptor.contextText}${descriptor.label}`);
          if (combined.includes(alias) && alias.length >= 3) score = Math.max(score, 760 + alias.length);
        }
        if (descriptor.context && canonical.startsWith(`${descriptor.context}[].`)) score += 120;
        if (score > best.score) best = { canonical, score };
      }
    }
    if (best.score >= 520) {
      const confidence = Math.min(0.99, best.score / 1000);
      return { canonical: best.canonical, confidence, reason: "字段语义匹配" };
    }
    const fallback = contextFallback(descriptor.label, descriptor.context);
    if (fallback) return { canonical: fallback, confidence: 0.82, reason: "栏目规则匹配" };
    return { canonical: "", confidence: 0, reason: "没有匹配字段" };
  }

  function resolveCanonical(descriptor, mappings) {
    const match = classifyCanonical(descriptor, mappings);
    return match.confidence >= MIN_CLASSIFIER_CONFIDENCE ? match.canonical : "";
  }

  function nativeSetter(element, property, value) {
    let prototype = Object.getPrototypeOf(element);
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (descriptor?.set) {
        descriptor.set.call(element, value);
        return;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    element[property] = value;
  }

  function dispatchEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  }

  function recordIdentity(profile, canonical, recordIndex) {
    const section = canonical.match(/^([a-z_]+)\[\]\./)?.[1] || "";
    if (!section) return { section_label: "", record_name: "" };
    const record = profile?.[section]?.[recordIndex] || {};
    const parts = (RECORD_TITLE_KEYS[section] || [])
      .map((key) => cleanText(record[key]))
      .filter(Boolean)
      .slice(0, 2);
    return { section_label: SECTION_LABELS[section] || section, record_name: [...new Set(parts)].join(" · ") };
  }

  function choiceValues(desired, label = "") {
    const text = String(desired || "").trim();
    const values = [text];
    const date = text.match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
    if (date) {
      const [, year, month, day] = date;
      const paddedMonth = String(Number(month)).padStart(2, "0");
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthName = monthNames[Number(month) - 1];
      values.push(`${year}年${Number(month)}月`, `${year}-${paddedMonth}`, `${paddedMonth}/${year}`, `${paddedMonth}-${year}`);
      if (/年份|年|year/i.test(label)) values.unshift(year);
      if (/月份|月|month/i.test(label)) values.unshift(String(Number(month)), `${Number(month)}月`, monthName, monthName.slice(0, 3));
      if (day && /日期|日|day/i.test(label)) values.unshift(String(Number(day)), `${Number(day)}日`);
    }
    return [...new Set(values.filter(Boolean))];
  }

  function normalizeChoice(value) {
    return semanticNormalize(value)
      .replace(/男性|男生/g, "男")
      .replace(/女性|女生/g, "女")
      .replace(/是的|接受|同意/g, "是")
      .replace(/不是|不接受|不同意/g, "否")
      .replace(/年|月|日/g, "");
  }

  function choiceScore(candidate, desiredValues) {
    const candidateValue = normalizeChoice(candidate);
    if (!candidateValue) return 0;
    let best = 0;
    for (const desired of desiredValues) {
      const wanted = normalizeChoice(desired);
      if (!wanted) continue;
      if (candidateValue === wanted) best = Math.max(best, 1000);
      else if (candidateValue.includes(wanted) || wanted.includes(candidateValue)) best = Math.max(best, 750 - Math.abs(candidateValue.length - wanted.length));
      else best = Math.max(best, Math.round(similarity(candidateValue, wanted) * 600));
    }
    return best;
  }

  function requestTrustedInput(action, element, text = "", values = []) {
    if (!chrome.runtime?.sendMessage || !element) return Promise.resolve(false);
    const rect = element.getBoundingClientRect();
    const targetId = `resume-helper-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    element.setAttribute("data-resume-helper-target", targetId);
    const payload = {
      type: "trustedInput",
      action,
      targetId,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      text,
      values
    };
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (element.getAttribute("data-resume-helper-target") === targetId) {
            element.removeAttribute("data-resume-helper-target");
          }
          if (chrome.runtime.lastError || !response?.ok || !response.result?.performed) resolve(false);
          else resolve(true);
        });
      } catch (_error) {
        if (element.getAttribute("data-resume-helper-target") === targetId) {
          element.removeAttribute("data-resume-helper-target");
        }
        resolve(false);
      }
    });
  }

  async function chooseCustomOption(control, desired) {
    const trigger = control.closest(".select__control, [class*='select__control']") || control.closest(
      `${SELECT_WRAPPERS}, .ant-picker, [class*='picker']`
    ) || control;
    const selectors = [
      "[role='option']", ".ui-select-item", ".ant-select-item-option", ".ant-cascader-menu-item", ".ant-picker-cell", ".ant-picker-now-btn",
      ".el-select-dropdown__item", ".el-cascader-node", ".ivu-select-item", ".ivu-date-picker-cells-cell",
      ".arco-select-option", ".semi-select-option", "[data-option-index]",
      "[class*='dropdown']:not([style*='display: none']) [class*='option']"
    ].join(", ");
    const previouslyVisible = new Set(deepQueryAll(selectors).filter(isVisible));
    trigger.scrollIntoView({ block: "center", behavior: "auto" });
    const clickTarget = trigger.querySelector("button[aria-label*='Toggle'], button[aria-label*='展开'], .ui-select-selection, .ant-select-selector, .el-select__wrapper, .ivu-select-selection, .arco-select-view, .semi-select-selection")
      || (control.matches("[role='combobox'], input") ? control : trigger);
    clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, button: 0, buttons: 1 }));
    clickTarget.click();
    control.focus();
    await new Promise((resolve) => setTimeout(resolve, 120));
    if (control.getAttribute("aria-expanded") !== "true"
      && !deepQueryAll(selectors).some(isVisible)) {
      await requestTrustedInput("click", clickTarget);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const desiredValues = choiceValues(desired, getLabel(control));
    if (trigger.matches(".select__control, [class*='select__control']")
      && await requestTrustedInput("selectOption", control, String(desired), desiredValues)) {
      return true;
    }
    const rankVisibleOptions = () => deepQueryAll(selectors).filter(isVisible)
      .filter((item) => !item.matches("[aria-disabled='true'], [disabled], .ui-select-item-disabled, .ant-select-item-option-disabled, .el-select-dropdown__item.is-disabled, .ivu-select-item-disabled"))
      .map((item) => ({ item, score: choiceScore(item.getAttribute("title") || item.getAttribute("aria-label") || item.innerText || item.textContent, desiredValues) }))
      .sort((left, right) => right.score - left.score);
    let target = rankVisibleOptions()[0];
    target = target?.score >= 430 ? target.item : null;
    const input = control.matches("input") ? control : trigger.querySelector("input:not([type='hidden'])");
    if (!target && input && !input.readOnly && !input.disabled && ["text", "search"].includes(input.type)) {
      const trusted = trigger.matches(".select__control, [class*='select__control']")
        && await requestTrustedInput("replaceText", input, String(desired));
      if (!trusted) {
        nativeSetter(input, "value", String(desired));
        input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: String(desired) }));
      }
    }
    for (let attempt = 0; attempt < 30 && !target; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const menuIds = `${control.getAttribute("aria-controls") || ""} ${control.getAttribute("aria-owns") || ""} ${input?.getAttribute("aria-controls") || ""}`.trim().split(/\s+/).filter(Boolean);
      const candidates = deepQueryAll(selectors).filter(isVisible)
        .filter((item) => !item.matches("[aria-disabled='true'], [disabled], .ui-select-item-disabled, .ant-select-item-option-disabled, .el-select-dropdown__item.is-disabled, .ivu-select-item-disabled"))
        .filter((item) => trigger.contains(item) || !previouslyVisible.has(item)
          || menuIds.some((id) => document.getElementById(id)?.contains(item)));
      const ranked = candidates
        .map((item) => ({ item, score: choiceScore(item.getAttribute("title") || item.getAttribute("aria-label") || item.innerText || item.textContent, desiredValues) }))
        .sort((left, right) => right.score - left.score);
      target = ranked[0]?.score >= 430 ? ranked[0].item : null;
    }
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "auto" });
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, button: 0, buttons: 1 }));
      target.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (isVisible(target)
        && target.getAttribute("aria-selected") !== "true"
        && !target.matches(".ui-select-item-selected, .ant-select-item-option-selected, .el-select-dropdown__item.is-selected, .ivu-select-item-selected, .arco-select-option-selected, .semi-select-option-selected, .select__option--is-selected, [class*='option--is-selected']")) {
        await requestTrustedInput("click", target);
      }
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if ((choiceScore(currentValue(control), desiredValues) >= 430 && !isVisible(target))
          || target.getAttribute("aria-selected") === "true"
          || target.matches(".ui-select-item-selected, .ant-select-item-option-selected, .el-select-dropdown__item.is-selected, .ivu-select-item-selected, .arco-select-option-selected, .semi-select-option-selected, .select__option--is-selected, [class*='option--is-selected']")) return true;
      }
      throw new Error(`已点击“${textOfOption(target)}”，但页面未确认选择，请手动核对`);
    }
    control.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    document.body.click();
    return false;
  }

  function textOfOption(option) {
    return cleanText(option.innerText || option.textContent);
  }

  function isDateControl(control, descriptor) {
    const input = control.matches("input") ? control : control.querySelector?.("input:not([type='hidden'])");
    return ["date", "month"].includes(input?.type)
      || control.matches(DATE_WRAPPERS)
      || /日期|时间|年月|date|month/i.test(`${descriptor.label} ${input?.placeholder || ""}`);
  }

  function dateInputValues(input, text, label = "") {
    const match = String(text).match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?/);
    if (!match) return [text];
    const year = match[1];
    const month = String(Number(match[2])).padStart(2, "0");
    const day = String(Number(match[3] || 1)).padStart(2, "0");
    const hint = `${label} ${input?.type || ""} ${input?.placeholder || ""}`;
    if (/年份|year/i.test(hint)) return [year];
    if (/月份|month/i.test(hint) && input?.type === "number") return [String(Number(month)), month];
    if (input?.type === "date" || /yyyy.?mm.?dd|年.*月.*日/i.test(hint)) return [`${year}-${month}-${day}`, `${year}/${month}/${day}`];
    if (/mm.?yyyy|month.*year/i.test(hint)) return [`${month}/${year}`, `${month}-${year}`];
    if (input?.type === "month" || /yyyy.?mm|年月/i.test(hint)) return [`${year}-${month}`, `${year}/${month}`, `${year}年${Number(month)}月`];
    return match[3] ? [`${year}-${month}-${day}`, `${year}/${month}/${day}`] : [`${year}-${month}`, `${year}/${month}`, `${year}年${Number(month)}月`];
  }

  async function fillDateControl(control, descriptor, text) {
    const input = control.matches("input") ? control : control.querySelector?.("input:not([type='hidden'])");
    if (!input || input.disabled) throw new Error(`日期字段“${descriptor.label}”没有可写输入框`);
    for (const candidate of dateInputValues(input, text, descriptor.label)) {
      input.focus();
      nativeSetter(input, "value", candidate);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: candidate }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
      input.blur();
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (choiceScore(currentValue(control), choiceValues(text, descriptor.label)) >= 430) return { status: "filled" };
    }
    throw new Error(`已写入日期“${text}”，但页面未保留该值，请手动核对`);
  }

  async function fillControl(descriptor, desired, overwrite) {
    const control = descriptor.control;
    const text = String(desired ?? "").trim();
    if (!text) return { status: "missing" };
    // 不自动填写"无"/"无此情况"等占位值，避免误覆盖页面默认选项
    if (/^(无|没有|暂无|无此情况|none|n\/a|na)$/i.test(text)) return { status: "skipped" };
    const isRadio = descriptor.type === "radio" || descriptor.type === "radiogroup";
    if (!overwrite && descriptor.value && !(isRadio && hasOnlyDefaultRadioValue(control))) return { status: "skipped" };
    control.scrollIntoView({ block: "center", behavior: "auto" });
    if (control.matches("select")) {
      const desiredValues = choiceValues(text, descriptor.label);
      const ranked = [...control.options]
        .map((item) => ({ item, score: Math.max(choiceScore(item.textContent, desiredValues), choiceScore(item.value, desiredValues)) }))
        .sort((left, right) => right.score - left.score);
      const option = ranked[0]?.score >= 430 ? ranked[0].item : null;
      if (!option) throw new Error(`下拉选项中没有“${text}”`);
      nativeSetter(control, "value", option.value);
      dispatchEvents(control);
      return { status: "filled" };
    }
    if (isRadio) {
      const ranked = radioControls(control)
        .filter((item) => !item.disabled && item.getAttribute("aria-disabled") !== "true")
        .map((item) => ({ item, score: Math.max(choiceScore(radioText(item), [text]), choiceScore(item.value, [text])) }))
        .sort((left, right) => right.score - left.score);
      const target = ranked[0]?.score >= 430 ? ranked[0].item : null;
      if (!target) throw new Error(`单选项中没有“${text}”`);
      const clickTarget = target.closest("label, .radio-item, .radio, .ant-radio-wrapper, .el-radio, .ivu-radio-wrapper, [role='radio']") || target;
      clickTarget.click();
      if (target !== clickTarget && target.matches("input[type='radio']") && !target.checked) target.click();
      const group = radioControls(control);
      if (target.matches("input[type='radio']") && !target.name) {
        for (const item of group) {
          if (item.matches("input[type='radio']")) nativeSetter(item, "checked", item === target);
        }
      }
      dispatchEvents(target);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        const selected = selectedRadio(control);
        if (selected && choiceScore(radioText(selected), [text]) >= 430) return { status: "filled" };
      }
      throw new Error(`已点击单选项“${radioText(target)}”，但页面未确认选择，请手动核对`);
    }
    if (descriptor.type === "checkbox") {
      const shouldCheck = !/^(否|false|0|不|无)$/i.test(text);
      if (control.checked !== shouldCheck) control.click();
      dispatchEvents(control);
      return { status: "filled" };
    }
    if ((descriptor.type === "combobox" || control.closest(SELECT_WRAPPERS)) && !control.matches(DATE_WRAPPERS)) {
      if (await chooseCustomOption(control, text)) return { status: "filled" };
      throw new Error(`下拉选项中没有与“${text}”匹配的选项`);
    }
    if (isDateControl(control, descriptor)) return fillDateControl(control, descriptor, text);
    if (control.readOnly && descriptor.type === "text") {
      if (await chooseCustomOption(control, text)) return { status: "filled" };
      throw new Error(`下拉选项中没有与“${text}”匹配的选项`);
    }
    if (control.isContentEditable) {
      control.focus();
      control.innerText = text;
      dispatchEvents(control);
      return { status: "filled" };
    }
    let formatted = text;
    if (descriptor.type === "date" && /^\d{4}-\d{2}$/.test(text)) formatted = `${text}-01`;
    if (descriptor.type === "month" && /^\d{4}-\d{2}-\d{2}$/.test(text)) formatted = text.slice(0, 7);
    control.focus();
    nativeSetter(control, "value", formatted);
    dispatchEvents(control);
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (!String(currentValue(control)).trim()) throw new Error(`已写入“${text}”，但页面未保留该值`);
    return { status: "filled" };
  }

  async function expandRepeaters(profile, mappings) {
    for (const [section, pattern] of Object.entries(ADD_PATTERNS)) {
      const desired = (profile[section] || []).length;
      if (desired <= 1) continue;
      let attempts = 0;
      while (attempts < desired - 1) {
        const candidates = deepQueryAll("button, [role='button'], a").filter(isVisible);
        const button = candidates.find((item) => pattern.test(cleanText(item.innerText || item.textContent)));
        if (!button) break;
        const before = controls().filter((item) => resolveCanonical(item, mappings)?.startsWith(`${section}[].`)).length;
        button.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
        const after = controls().filter((item) => resolveCanonical(item, mappings)?.startsWith(`${section}[].`)).length;
        attempts += 1;
        if (after <= before) break;
      }
    }
  }

  function jobMeta() {
    const headings = [...document.querySelectorAll("h1,h2,[class*='job-title'],[class*='position-name']")]
      .filter(isVisible)
      .map((item) => cleanText(item.innerText))
      .filter(Boolean);
    const companyCandidate = [...document.querySelectorAll("[class*='company'],[class*='tenant'],header img[alt]")]
      .filter(isVisible)
      .map((item) => cleanText(item.innerText || item.getAttribute("alt")))
      .find((text) => text && text.length < 80);
    return { jobTitle: headings[0] || document.title, company: companyCandidate || "" };
  }

  function publicDescriptor(descriptor, mappings) {
    const match = mappings ? classifyCanonical(descriptor, mappings) : { canonical: "", confidence: 0, reason: "" };
    return {
      label: descriptor.label,
      context: descriptor.context,
      type: descriptor.type,
      required: descriptor.required,
      filled: Boolean(descriptor.value),
      canonical: match.confidence >= MIN_CLASSIFIER_CONFIDENCE ? match.canonical : "",
      candidate_canonical: match.canonical,
      confidence: match.confidence,
      match_reason: match.reason
    };
  }

  async function scanForm(profile = null, mappings = null) {
    const pageControls = controls();
    const values = profile ? flattenProfile(profile) : {};
    const counters = {};
    const canonicalCounts = mappings ? countCanonicals(pageControls, mappings) : {};
    const fields = [];
    const missing = [];
    let ready = 0;
    for (const descriptor of pageControls) {
      const canonical = mappings ? resolveCanonical(descriptor, mappings) : "";
      const selection = canonical ? selectProfileValue(profile, values, canonical, descriptor, counters, canonicalCounts) : { desired: "", recordIndex: 0 };
      const { desired, recordIndex } = selection;
      const field = {
        ...publicDescriptor(descriptor, mappings),
        canonical,
        record_index: recordIndex,
        hasProfileValue: Boolean(String(desired || "").trim()),
        pageValue: descriptor.value || "",
        importable: isSafePageField(descriptor.type, descriptor.label)
      };
      Object.assign(field, recordIdentity(profile, canonical, recordIndex));
      fields.push(field);
      if (field.hasProfileValue) ready += 1;
      else missing.push(field);
    }
    return { fields, missing, total: fields.length, matched: fields.filter((item) => item.canonical).length, ready, meta: jobMeta(), url: location.href };
  }

  async function fillForm(profile, mappings, overwrite) {
    await expandRepeaters(profile, mappings);
    const values = flattenProfile(profile);
    const counters = {};
    const pageControls = controls();
    const canonicalCounts = countCanonicals(pageControls, mappings);
    const result = {
      total: pageControls.length,
      filled: 0,
      skipped: 0,
      filledFields: [],
      skippedFields: [],
      missing: [],
      unmatched: [],
      lowConfidence: [],
      failed: [],
      meta: jobMeta()
    };
    for (const descriptor of pageControls) {
      const match = classifyCanonical(descriptor, mappings);
      const canonical = match.confidence >= MIN_CLASSIFIER_CONFIDENCE ? match.canonical : "";
      if (!canonical) {
        if (!descriptor.value) {
          const detail = publicDescriptor(descriptor, mappings);
          if (match.canonical) {
            result.lowConfidence.push({
              ...detail,
              error: `字段匹配置信度 ${Math.round(match.confidence * 100)}%，已放弃自动填写，请人工确认`,
              status: "低置信度，已跳过"
            });
          }
          result.unmatched.push(detail);
        }
        continue;
      }
      const { desired, recordIndex } = selectProfileValue(profile, values, canonical, descriptor, counters, canonicalCounts);
      try {
        const outcome = await fillControl(descriptor, desired, overwrite);
        const detail = {
          ...publicDescriptor(descriptor, mappings),
          canonical,
          record_index: recordIndex,
          value: String(outcome.status === "skipped" ? descriptor.value : desired || "")
        };
        Object.assign(detail, recordIdentity(profile, canonical, recordIndex));
        if (outcome.status === "filled") {
          result.filled += 1;
          result.filledFields.push(detail);
        }
        if (outcome.status === "skipped") {
          result.skipped += 1;
          result.skippedFields.push(detail);
        }
        if (outcome.status === "missing") result.missing.push({
          ...publicDescriptor(descriptor, mappings),
          ...recordIdentity(profile, canonical, recordIndex),
          canonical,
          record_index: recordIndex,
          pageValue: descriptor.value || ""
        });
      } catch (error) {
        result.failed.push({
          label: descriptor.label,
          canonical,
          record_index: recordIndex,
          ...recordIdentity(profile, canonical, recordIndex),
          error: error.message || String(error)
        });
      }
    }
    const seen = new Set();
    result.missing = [...result.missing, ...result.unmatched]
      .filter((item) => {
        const key = `${item.canonical || "custom"}|${item.record_index || 0}|${normalize(item.label)}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 80);
    return result;
  }

  function findFileInput(documentMeta) {
    const inputs = deepQueryAll("input[type='file']").filter((item) => !item.disabled);
    if (!inputs.length) return null;
    const typeWords = {
      resume: /简历|resume|附件|上传/,
      photo: /照片|头像|证件照|photo|image/,
      transcript: /成绩单|成绩证明|transcript/,
      degree_certificate: /学位证|学位证明|degree/,
      diploma: /毕业证|学历证明|diploma/,
      certificate: /证书|奖项证明|资格证明|certificate/,
      portfolio: /作品集|portfolio/,
      cover_letter: /求职信|cover letter/,
      recommendation: /推荐信|recommendation/
    };
    const preferred = typeWords[documentMeta.type] || /附件|上传/;
    const exactType = inputs.find((item) => preferred.test(getLabel(item)));
    if (exactType) return exactType;
    const resumeWords = typeWords.resume;
    const resume = inputs.find((item) => resumeWords.test(getLabel(item)))
      || inputs.find((item) => /pdf|word|doc/i.test(item.accept || ""));
    return resume || inputs[0];
  }

  function decodeBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function handleMessage(message) {
    if (message.action === "scanForm") return scanForm(message.profile, message.mappings);
    if (message.action === "fillForm") return fillForm(message.profile, message.mappings, message.overwrite);
    if (message.action === "beginUpload") {
      const input = findFileInput(message.document);
      if (!input) return { accepted: false, error: "当前页面没有文件上传控件" };
      uploads.set(message.uploadId, { input, document: message.document, chunks: [] });
      return { accepted: true, label: getLabel(input) };
    }
    if (message.action === "appendUpload") {
      const upload = uploads.get(message.uploadId);
      if (!upload) throw new Error("附件上传会话已失效");
      upload.chunks.push(decodeBase64(message.data));
      return { accepted: true };
    }
    if (message.action === "finishUpload") {
      const upload = uploads.get(message.uploadId);
      if (!upload) throw new Error("附件上传会话已失效");
      const file = new File(upload.chunks, upload.document.name, { type: upload.document.mime_type || "application/octet-stream" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      nativeSetter(upload.input, "files", transfer.files);
      dispatchEvents(upload.input);
      uploads.delete(message.uploadId);
      return { uploaded: true, name: file.name, size: file.size, label: getLabel(upload.input) };
    }
    throw new Error(`未知页面操作：${message.action}`);
  }

  globalThis.__resumeHelperTestApi = {
    normalize,
    semanticNormalize,
    similarity,
    flattenProfile,
    contextFallback,
    classifyCanonical,
    resolveCanonical,
    isSafePageField,
    choiceScore,
    recordIdentity,
    scanForm,
    fillForm
  };

  globalThis.__resumeHelperMessageListener = (message, _sender, sendResponse) => {
    handleMessage(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ error: error.message || String(error) }));
    return true;
  };
  chrome.runtime.onMessage.addListener(globalThis.__resumeHelperMessageListener);
})();

