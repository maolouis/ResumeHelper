"""CDP helper: send CDP commands to Edge via WebSocket, screenshot and eval JS."""
import json
import sys
import base64
import time
import requests
import websocket

CDP = "http://127.0.0.1:9222"


def get_targets():
    return requests.get(f"{CDP}/json", timeout=10).json()


def find_page(url_contains=None, title_contains=None):
    targets = get_targets()
    for t in targets:
        if t["type"] != "page":
            continue
        if url_contains and url_contains in t.get("url", ""):
            return t
        if title_contains and title_contains in t.get("title", ""):
            return t
    # fallback: first page
    for t in targets:
        if t["type"] == "page":
            return t
    return None


class CDPConn:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=60)
        self.mid = 0

    def send(self, method, params=None):
        self.mid += 1
        msg = {"id": self.mid, "method": method, "params": params or {}}
        self.ws.send(json.dumps(msg))
        while True:
            raw = self.ws.recv()
            data = json.loads(raw)
            if data.get("id") == self.mid:
                if "error" in data:
                    raise Exception(f"CDP error in {method}: {data['error']}")
                return data.get("result", {})

    def eval(self, expression, await_promise=True):
        result = self.send("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": await_promise,
            "returnByValue": True,
            "timeout": 120000,
        })
        if "exceptionDetails" in result:
            raise Exception(f"JS error: {result['exceptionDetails']}")
        return result.get("result", {}).get("value")

    def screenshot(self, path=None):
        result = self.send("Page.captureScreenshot", {"format": "png"})
        data = base64.b64decode(result["data"])
        if path:
            with open(path, "wb") as f:
                f.write(data)
            print(f"Screenshot saved: {path} ({len(data)} bytes)")
        return data

    def close(self):
        self.ws.close()


def connect_to_page(url_contains=None):
    target = find_page(url_contains=url_contains)
    if not target:
        print("No page target found!")
        sys.exit(1)
    print(f"Connected to: {target['title']} | {target['url'][:100]}")
    conn = CDPConn(target["webSocketDebuggerUrl"])
    conn.send("Page.enable")
    conn.send("Runtime.enable")
    return conn, target
