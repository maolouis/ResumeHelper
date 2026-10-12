from __future__ import annotations

import base64
import json
import os
import struct
import sys
import traceback

from .storage import DataStore


class NativeHost:
    def __init__(self, store: DataStore | None = None):
        self.store = store or DataStore()

    def handle(self, message: dict) -> dict:
        action = message.get("action")
        if action == "ping":
            return {"ok": True, "version": "0.4.5"}
        if action == "get_state":
            return {"ok": True, **self.store.get_state()}
        if action == "set_active_profile":
            profile = self.store.set_active_profile(str(message.get("profile_id", "")))
            return {"ok": True, "profile": profile}
        if action in {"save_custom_fields", "save_form_fields"}:
            result = self.store.save_form_fields(
                str(message.get("profile_id", "")),
                list(message.get("fields") or []),
                str(message.get("hostname", "")),
                create_missing=bool(message.get("create_missing", False)),
            )
            return {"ok": True, **result}
        if action == "record_application":
            return {"ok": True, "record": self.store.record_application(dict(message.get("application") or {}))}
        if action == "get_document_meta":
            document = self.store.get_document(str(message.get("profile_id", "")), str(message.get("document_id", "")))
            return {"ok": True, "document": document}
        if action == "read_document_chunk":
            document, chunk = self.store.read_document_chunk(
                str(message.get("profile_id", "")),
                str(message.get("document_id", "")),
                int(message.get("offset", 0)),
                int(message.get("size", 512 * 1024)),
            )
            return {
                "ok": True,
                "document": document,
                "offset": int(message.get("offset", 0)),
                "bytes_read": len(chunk),
                "data": base64.b64encode(chunk).decode("ascii"),
            }
        raise ValueError(f"未知操作：{action}")


def _read_message(stream) -> dict | None:
    raw_length = stream.read(4)
    if not raw_length:
        return None
    if len(raw_length) != 4:
        raise ValueError("Native Messaging 消息长度不完整")
    length = struct.unpack("<I", raw_length)[0]
    if length > 64 * 1024 * 1024:
        raise ValueError("Native Messaging 请求过大")
    payload = stream.read(length)
    if len(payload) != length:
        raise ValueError("Native Messaging 消息内容不完整")
    return json.loads(payload.decode("utf-8"))


def _write_message(stream, payload: dict) -> None:
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    stream.write(struct.pack("<I", len(encoded)))
    stream.write(encoded)
    stream.flush()


def main() -> int:
    if os.name == "nt":
        import msvcrt

        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    host = NativeHost()
    input_stream = sys.stdin.buffer
    output_stream = sys.stdout.buffer
    while True:
        try:
            message = _read_message(input_stream)
            if message is None:
                return 0
            response = host.handle(message)
        except Exception as exc:
            response = {"ok": False, "error": str(exc)}
            print(traceback.format_exc(), file=sys.stderr, flush=True)
        _write_message(output_stream, response)


if __name__ == "__main__":
    raise SystemExit(main())

