"""Navigate to CVTE, check extension loaded, test fill."""
import sys, time, json
sys.path.insert(0, r"C:\Users\Administrator\Desktop\填简历助手")
from cdp_helper import CDPConn, find_page, get_targets
import requests

# 创建新 tab 到 CVTE
cvte_url = "https://careers.cvte.com/zone/resume/apply/create?projectId=d39828c70ff94d37b9eb6521f6706692&projectPositionId=fa0363db2bb24bff98d20a4a064cf35f&projectPositionType=971aba160a3d11e783e8fa163e75442c"
encoded = requests.utils.quote(cvte_url)
try:
    r = requests.put(f"http://127.0.0.1:9222/json/new?{encoded}", timeout=10)
    new_tab = r.json()
except:
    new_tab = requests.get(f"http://127.0.0.1:9222/json/new?{encoded}", timeout=10).json()
print(f"New tab: {new_tab['id']}")
time.sleep(15)

# 找到 CVTE 页面
target = find_page(url_contains="careers.cvte.com")
if not target:
    print("CVTE page not found!")
    for t in get_targets():
        if t["type"] == "page":
            print(f"  page: {t['url'][:80]}")
    sys.exit(1)

print(f"Connected: {target['title']} | {target['url'][:80]}")
conn = CDPConn(target["webSocketDebuggerUrl"])
conn.send("Page.enable")
conn.send("Runtime.enable")

# 检查扩展是否加载
version = conn.eval("globalThis.__resumeHelperContentLoaded", await_promise=False)
print(f"Content script version: {version}")

# 截图
conn.screenshot(r"C:\Users\Administrator\Desktop\填简历助手\cvte-loaded.png")
conn.close()
