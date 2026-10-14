"""Step 1: Navigate to Honor, click login, screenshot QR code for user."""
import sys
import time
sys.path.insert(0, r"C:\Users\Administrator\Desktop\填简历助手")
from cdp_helper import CDP, CDPConn, find_page, get_targets
import requests

# 找到荣耀页面
target = find_page(url_contains="career.honor.com")
print(f"Target: {target['title']} | {target['url']}")

conn = CDPConn(target["webSocketDebuggerUrl"])
conn.send("Page.enable")
conn.send("Runtime.enable")

# 检查是否已登录
result = conn.eval("""
(() => {
    const loginBtn = document.querySelector('.login-btn, [class*="login"], button');
    const allText = document.body.innerText;
    const hasLogin = allText.includes('登录') || allText.includes('微信扫码');
    const hasLogout = allText.includes('退出');
    return {hasLogin, hasLogout, url: location.href};
})()
""", await_promise=False)
print("Page state:", result)

# 如果需要登录，点击登录按钮
if result and not result.get("hasLogout"):
    # 先同意协议并显示二维码
    conn.eval("""
(() => {
    // 找到并点击登录/注册按钮
    const btns = Array.from(document.querySelectorAll('button, a, div'));
    const loginBtn = btns.find(b => b.innerText && b.innerText.trim().includes('登录'));
    if (loginBtn) loginBtn.click();
    return 'clicked login';
})()
""", await_promise=False)
    time.sleep(3)

    # 勾选同意协议
    conn.eval("""
(() => {
    // 查找checkbox
    const checkboxes = document.querySelectorAll('input[type="checkbox"], .ant-checkbox, [class*="checkbox"]');
    checkboxes.forEach(c => {
        if (c.tagName === 'INPUT' && !c.checked) c.click();
        else if (c.className.includes('checkbox') && !c.className.includes('checked')) c.click();
    });
    // 点击label
    const labels = Array.from(document.querySelectorAll('label, span, div'));
    const agreeLabel = labels.find(l => l.innerText && l.innerText.includes('本人已阅读'));
    if (agreeLabel) agreeLabel.click();
    return 'agreed';
})()
""", await_promise=False)
    time.sleep(2)

    # 截图二维码
    conn.screenshot(r"C:\Users\Administrator\Desktop\填简历助手\qr_login.png")
else:
    print("Already logged in!")
    conn.screenshot(r"C:\Users\Administrator\Desktop\填简历助手\page_state.png")

conn.close()
