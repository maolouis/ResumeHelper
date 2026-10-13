const NATIVE_HOST = "cn.resumehelper.native";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

function callNative(payload) {
  return new Promise((resolve, reject) => {
    // 添加超时机制：5秒后报错
    const timeoutId = setTimeout(() => {
      reject(new Error("连接本地程序超时，请确认简历快填程序已启动"));
    }, 5000);
    
    chrome.runtime.sendNativeMessage(NATIVE_HOST, payload, (response) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        reject(new Error(`无法连接本地程序：${chrome.runtime.lastError.message}`));
        return;
      }
      if (!response) {
        reject(new Error("本地程序没有返回数据"));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error || "本地程序执行失败"));
        return;
      }
      resolve(response);
    });
  });
}

function requireActiveProfile(state) {
  if (!state.active_profile) {
    throw new Error("当前没有简历档案，请先在桌面程序中新增或导入档案");
  }
  return state.active_profile;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !/^https?:/i.test(tab.url || "")) {
    throw new Error("请先打开招聘网站的申请表页面");
  }
  return tab;
}

async function sendToPage(tabId, message) {
  // Refresh old content code left in a tab after an extension update.
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      throw new Error(`当前页面无法加载填写组件：${error.message || String(error)}。请刷新招聘页面后重试`);
    }
  }
}

async function withDebugger(tabId, action) {
  const target = { tabId };
  await chrome.debugger.attach(target, "1.3");
  try {
    return await action(target);
  } finally {
    await chrome.debugger.detach(target).catch(() => {});
  }
}

async function trustedInput(tabId, message) {
  if (!tabId) throw new Error("无法定位当前招聘页面");
  return withDebugger(tabId, async (target) => {
    const safeTargetId = String(message.targetId || "").replace(/[^a-z0-9-]/gi, "");
    const selector = `[data-resume-helper-target="${safeTargetId}"]`;
    const mouseClick = async (point) => {
      const params = { x: Number(point.x), y: Number(point.y), button: "left", clickCount: 1 };
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...params, type: "mouseMoved", button: "none" });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...params, type: "mousePressed" });
      await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { ...params, type: "mouseReleased" });
    };
    const replaceFocusedText = async (text) => {
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8
      });
      await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
        type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8
      });
      for (const character of String(text || "")) {
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", {
          type: "keyDown", key: character, text: character, unmodifiedText: character
        });
        await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", key: character });
      }
    };
    if (message.action === "click") {
      const position = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; element.scrollIntoView({ block: "center", inline: "nearest" }); const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
        returnByValue: true
      });
      const point = position?.result?.value;
      await mouseClick(point || { x: message.x, y: message.y });
      return { performed: true };
    }
    if (message.action === "replaceText") {
      await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`
      });
      await replaceFocusedText(message.text);
      return { performed: true };
    }
    if (message.action === "selectOption") {
      const wanted = Array.isArray(message.values) && message.values.length ? message.values : [message.text];
      const findOption = async () => {
        const found = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
          expression: `(() => { const clean = value => String(value || "").toLowerCase().replace(/[\\s\\u00a0:*：?？!！,，.。;；()（）\\[\\]【】_\\-\\/\\\\]/g, ""); const wanted = ${JSON.stringify(wanted)}.map(clean).filter(Boolean); const options = [...document.querySelectorAll("[role='option']")].filter(item => { const style = getComputedStyle(item); const rect = item.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0 && item.getAttribute("aria-disabled") !== "true"; }); let best = null; let bestScore = 0; for (const option of options) { const value = clean(option.getAttribute("aria-label") || option.getAttribute("title") || option.textContent); for (const target of wanted) { const score = value === target ? 1000 : (value.includes(target) || target.includes(value)) ? 700 - Math.abs(value.length - target.length) : 0; if (score > bestScore) { best = option; bestScore = score; } } } if (!best || bestScore < 430) return null; best.scrollIntoView({ block: "nearest" }); const rect = best.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
          returnByValue: true
        });
        return found?.result?.value || null;
      };
      let optionPoint = await findOption();
      if (!optionPoint) {
        const controlPoint = await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
          expression: `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return null; element.scrollIntoView({ block: "center", inline: "nearest" }); const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`,
          returnByValue: true
        });
        if (!controlPoint?.result?.value) return { performed: false };
        await mouseClick(controlPoint.result.value);
        await new Promise((resolve) => setTimeout(resolve, 200));
        optionPoint = await findOption();
      }
      if (!optionPoint) {
        await chrome.debugger.sendCommand(target, "Runtime.evaluate", {
          expression: `document.querySelector(${JSON.stringify(selector)})?.focus()`
        });
        await replaceFocusedText(message.text);
        for (let attempt = 0; attempt < 24 && !optionPoint; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          optionPoint = await findOption();
        }
      }
      if (!optionPoint) return { performed: false };
      await mouseClick(optionPoint);
      return { performed: true };
    }
    throw new Error(`不支持的可信输入操作：${message.action}`);
  });
}

async function scanPage() {
  const [tab, state] = await Promise.all([getActiveTab(), callNative({ action: "get_state" })]);
  const profile = requireActiveProfile(state);
  const result = await sendToPage(tab.id, { action: "scanForm", profile, mappings: state.mappings });
  return { ...result, profileName: profile.name, tab: { id: tab.id, url: tab.url, title: tab.title } };
}

function applicationPayload(tab, state, result) {
  const meta = result.meta || {};
  let jobId = "";
  try {
    const url = new URL(tab.url);
    jobId = url.searchParams.get("jobAdId") || url.searchParams.get("jobId") || url.searchParams.get("id") || "";
  } catch (_error) {
    jobId = "";
  }
  return {
    profile_id: state.active_profile.id,
    profile_name: state.active_profile.name,
    company: meta.company || new URL(tab.url).hostname,
    job_title: meta.jobTitle || tab.title || "",
    job_id: jobId,
    url: tab.url,
    hostname: new URL(tab.url).hostname,
    status: "已填写",
    filled: result.filled || 0,
    missing: result.missing?.length || 0,
    failed: result.failed?.length || 0
  };
}

async function fillPage(overwrite) {
  const [tab, state] = await Promise.all([getActiveTab(), callNative({ action: "get_state" })]);
  const profile = requireActiveProfile(state);
  const result = await sendToPage(tab.id, {
    action: "fillForm",
    profile,
    mappings: state.mappings,
    overwrite: Boolean(overwrite)
  });
  if ((result.filled || 0) > 0) {
    await callNative({ action: "record_application", application: applicationPayload(tab, state, result) });
  }
  return { ...result, profileName: profile.name };
}

async function importPageData() {
  const [tab, state] = await Promise.all([getActiveTab(), callNative({ action: "get_state" })]);
  const profile = requireActiveProfile(state);
  const scan = await sendToPage(tab.id, { action: "scanForm", profile, mappings: state.mappings });
  const fields = (scan.fields || [])
    .filter((field) => field.importable)
    .map((field) => ({
      label: field.label,
      canonical: field.canonical || `custom.${field.label}`,
      context: field.context || "",
      record_index: Number(field.record_index || 0),
      section_label: field.section_label || "",
      record_name: field.record_name || "",
      value: String(field.pageValue || "").trim()
    }));
  if (!fields.length) {
    return { ...scan, imported: 0, importedFields: [], profileName: state.active_profile.name };
  }
  const hostname = new URL(tab.url).hostname;
  const saved = await callNative({
    action: "save_form_fields",
    profile_id: state.active_profile.id,
    hostname,
    create_missing: true,
    fields
  });
  const importedFields = (saved.saved || []).map((item) => {
    const source = fields.find((field) => field.label === item.label
      && field.canonical === item.canonical
      && field.record_index === item.record_index);
    return {
      ...item,
      section_label: source?.section_label || "",
      record_name: source?.record_name || "",
      value: source?.value || (item.created ? "待补充" : "页面为空，保留本地资料")
    };
  });
  return { ...scan, imported: importedFields.length, importedFields, created: saved.created, values_saved: saved.values_saved, profileName: state.active_profile.name };
}

async function uploadDocument(documentId) {
  const [tab, state] = await Promise.all([getActiveTab(), callNative({ action: "get_state" })]);
  const profileId = requireActiveProfile(state).id;
  const metaResponse = await callNative({ action: "get_document_meta", profile_id: profileId, document_id: documentId });
  const document = metaResponse.document;
  if (!document.exists) {
    throw new Error(`本地文件不存在：${document.path}`);
  }
  const uploadId = crypto.randomUUID();
  const begin = await sendToPage(tab.id, { action: "beginUpload", uploadId, document });
  if (!begin?.accepted) {
    throw new Error(begin?.error || "当前页面没有找到文件上传控件");
  }
  const chunkSize = 512 * 1024;
  let offset = 0;
  while (offset < document.size) {
    const chunk = await callNative({
      action: "read_document_chunk",
      profile_id: profileId,
      document_id: documentId,
      offset,
      size: chunkSize
    });
    await sendToPage(tab.id, { action: "appendUpload", uploadId, data: chunk.data });
    if (!chunk.bytes_read) {
      break;
    }
    offset += chunk.bytes_read;
  }
  return sendToPage(tab.id, { action: "finishUpload", uploadId });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const dispatch = async () => {
    switch (message.type) {
      case "native":
        return callNative(message.payload);
      case "scan":
        return scanPage();
      case "fill":
        return fillPage(message.overwrite);
      case "importPage":
        return importPageData();
      case "upload":
        return uploadDocument(message.documentId);
      case "trustedInput":
        return trustedInput(sender.tab?.id, message);
      default:
        throw new Error(`未知插件操作：${message.type}。请在 edge://extensions 中重新加载“简历快填 - 本地版”`);
    }
  };
  dispatch()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

