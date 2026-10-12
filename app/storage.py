from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import threading
import time
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .defaults import (
    BASIC_FIELDS,
    LONG_TEXT_FIELDS,
    SCHEMA_VERSION,
    SECTION_DEFINITIONS,
    clone_profile,
    default_profile,
    empty_profile,
    initial_mappings_document,
    initial_profiles_document,
)


def _default_data_dir() -> Path:
    override = os.environ.get("RESUME_HELPER_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    local = os.environ.get("LOCALAPPDATA")
    if local:
        return Path(local) / "ResumeHelper" / "data"
    return Path.home() / ".resume-helper" / "data"


DATA_DIR = _default_data_dir()


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


class CrossProcessLock:
    """A one-byte advisory lock shared by the GUI and native host."""

    def __init__(self, path: Path):
        self.path = path
        self._stream = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._stream = self.path.open("a+b")
        self._stream.seek(0, os.SEEK_END)
        if self._stream.tell() == 0:
            self._stream.write(b"0")
            self._stream.flush()
        self._stream.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(self._stream.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(self._stream.fileno(), fcntl.LOCK_EX)
        return self

    def __exit__(self, exc_type, exc, tb):
        if not self._stream:
            return
        self._stream.seek(0)
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(self._stream.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(self._stream.fileno(), fcntl.LOCK_UN)
        self._stream.close()


class DataStore:
    def __init__(self, data_dir: Path | str | None = None):
        self.data_dir = Path(data_dir) if data_dir else DATA_DIR
        self.profiles_path = self.data_dir / "profiles.json"
        self.mappings_path = self.data_dir / "field-mappings.json"
        self.history_path = self.data_dir / "applications.jsonl"
        self.settings_path = self.data_dir / "settings.json"
        self.backup_dir = self.data_dir / "backups"
        self._thread_lock = threading.RLock()
        self._lock_path = self.data_dir / ".store.lock"
        self.ensure_initialized()

    @contextmanager
    def locked(self):
        with self._thread_lock:
            with CrossProcessLock(self._lock_path):
                yield

    def ensure_initialized(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        with self.locked():
            for stale in self.data_dir.glob(".*.tmp"):
                stale.unlink(missing_ok=True)
            if not self.profiles_path.exists():
                self._atomic_write_json(self.profiles_path, initial_profiles_document(), backup=False)
            if not self.mappings_path.exists():
                self._atomic_write_json(self.mappings_path, initial_mappings_document(), backup=False)
            if not self.settings_path.exists():
                self._atomic_write_json(
                    self.settings_path,
                    {"schema_version": 1, "auto_record_history": True, "backup_limit": 12},
                    backup=False,
                )
            if not self.history_path.exists():
                self.history_path.touch()
            self._upgrade_schema()

    def _upgrade_schema(self) -> None:
        document = self._read_json(self.profiles_path, initial_profiles_document())
        old_version = int(document.get("schema_version", 1) or 1)
        changed = old_version < SCHEMA_VERSION
        seed = default_profile()
        basic_keys = [key for key, _label in BASIC_FIELDS]

        for profile in document.get("profiles", []):
            basic = profile.setdefault("basic", {})
            for key in basic_keys:
                if key not in basic:
                    basic[key] = ""
                    changed = True
            for section, definition in SECTION_DEFINITIONS.items():
                if section not in profile:
                    profile[section] = []
                    changed = True
                for record in profile.get(section, []):
                    if not record.get("id"):
                        record["id"] = str(uuid4())
                        changed = True
                    for key, _label in definition["fields"]:
                        if key not in record:
                            record[key] = ""
                            changed = True
            for key, _label, _height in LONG_TEXT_FIELDS:
                if key not in profile:
                    profile[key] = ""
                    changed = True
            profile.setdefault("custom_fields", {})
            profile.setdefault("documents", [])

            # Enrich only the original supplied profile during the v1 -> v2 migration.
            if old_version < 2 and basic.get("full_name") == "李艳萍":
                for section in ("language_skills", "professional_skills", "publications", "patents"):
                    if not profile.get(section):
                        profile[section] = json.loads(json.dumps(seed[section], ensure_ascii=False))
                        changed = True
                if not profile.get("research_summary"):
                    profile["research_summary"] = seed["research_summary"]
                    changed = True
                existing_paths = {str(item.get("path", "")).casefold() for item in profile["documents"]}
                for item in seed["documents"]:
                    if item["type"] == "photo" and item["path"].casefold() not in existing_paths and Path(item["path"]).exists():
                        profile["documents"].append(item)
                        changed = True

        document["schema_version"] = SCHEMA_VERSION
        if changed:
            self._atomic_write_json(self.profiles_path, document)

        mappings = self._read_json(self.mappings_path, initial_mappings_document())
        default_mappings = initial_mappings_document()
        mapping_changed = int(mappings.get("schema_version", 1) or 1) < SCHEMA_VERSION
        global_aliases = mappings.setdefault("global", {})
        for canonical, aliases in default_mappings["global"].items():
            current = global_aliases.setdefault(canonical, [])
            for alias in aliases:
                if alias not in current:
                    current.append(alias)
                    mapping_changed = True
        mappings.setdefault("sites", {})
        mappings["schema_version"] = SCHEMA_VERSION
        if mapping_changed:
            self._atomic_write_json(self.mappings_path, mappings)

    def _read_json(self, path: Path, fallback: dict) -> dict:
        try:
            return json.loads(path.read_text(encoding="utf-8-sig"))
        except (FileNotFoundError, json.JSONDecodeError):
            return fallback

    def _backup(self, path: Path) -> None:
        if not path.exists() or path.stat().st_size == 0:
            return
        stamp = f"{time.time_ns()}"
        backup = self.backup_dir / f"{path.stem}-{stamp}{path.suffix}.bak"
        shutil.copy2(path, backup)
        settings = self._read_json(self.settings_path, {}) if path != self.settings_path else {}
        limit = int(settings.get("backup_limit", 12))
        candidates = sorted(self.backup_dir.glob(f"{path.stem}-*{path.suffix}.bak"), key=lambda p: p.stat().st_mtime)
        for old in candidates[:-limit]:
            old.unlink(missing_ok=True)

    def _atomic_write_text(self, path: Path, text: str, backup: bool = True) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if backup:
            self._backup(path)
        temp = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        with temp.open("w", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.replace(temp, path)
        except OSError as exc:
            # Some Windows EFS folders report ERROR_NOT_SAME_DEVICE even for a
            # rename within the same directory. Keep the verified backup and
            # fall back to a flushed copy in that specific environment.
            if os.name != "nt" or getattr(exc, "winerror", None) != 17:
                temp.unlink(missing_ok=True)
                raise
            shutil.copyfile(temp, path)
            with path.open("rb+") as destination:
                destination.flush()
                os.fsync(destination.fileno())
            if path.read_text(encoding="utf-8") != text:
                raise OSError("JSON 文件写入校验失败") from exc
            temp.unlink(missing_ok=True)

    def _atomic_write_json(self, path: Path, payload: dict, backup: bool = True) -> None:
        self._atomic_write_text(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n", backup=backup)

    def _profiles(self) -> dict:
        return self._read_json(self.profiles_path, initial_profiles_document())

    def _mappings(self) -> dict:
        return self._read_json(self.mappings_path, initial_mappings_document())

    def _history(self) -> list[dict]:
        records: list[dict] = []
        try:
            for line in self.history_path.read_text(encoding="utf-8-sig").splitlines():
                if line.strip():
                    records.append(json.loads(line))
        except (FileNotFoundError, json.JSONDecodeError):
            return []
        return records

    def _write_history(self, records: list[dict]) -> None:
        text = "".join(json.dumps(item, ensure_ascii=False) + "\n" for item in records)
        self._atomic_write_text(self.history_path, text)

    @staticmethod
    def _find_profile(document: dict, profile_id: str | None = None) -> dict:
        wanted = profile_id or document.get("active_profile_id")
        for profile in document.get("profiles", []):
            if profile.get("id") == wanted:
                return profile
        if document.get("profiles"):
            return document["profiles"][0]
        raise ValueError("没有可用的简历档案")

    def get_state(self) -> dict:
        with self.locked():
            document = self._profiles()
            try:
                active = self._find_profile(document)
            except ValueError:
                active = None
            return {
                "active_profile_id": active["id"] if active else "",
                "active_profile": active,
                "profiles": [{"id": p["id"], "name": p.get("name", "未命名简历")} for p in document.get("profiles", [])],
                "mappings": self._mappings(),
                "data_dir": str(self.data_dir),
            }

    def list_profiles(self) -> list[dict]:
        return self.get_state()["profiles"]

    def get_profile(self, profile_id: str | None = None) -> dict:
        with self.locked():
            return json.loads(json.dumps(self._find_profile(self._profiles(), profile_id), ensure_ascii=False))

    def set_active_profile(self, profile_id: str) -> dict:
        with self.locked():
            document = self._profiles()
            self._find_profile(document, profile_id)
            document["active_profile_id"] = profile_id
            self._atomic_write_json(self.profiles_path, document)
            return self._find_profile(document, profile_id)

    def save_profile(self, profile: dict) -> dict:
        with self.locked():
            document = self._profiles()
            for index, existing in enumerate(document.get("profiles", [])):
                if existing.get("id") == profile.get("id"):
                    document["profiles"][index] = profile
                    break
            else:
                profile.setdefault("id", str(uuid4()))
                document.setdefault("profiles", []).append(profile)
            document["active_profile_id"] = profile["id"]
            self._atomic_write_json(self.profiles_path, document)
            return profile

    def create_profile(self, name: str, clone_from: str | None = None) -> dict:
        with self.locked():
            document = self._profiles()
            profile = clone_profile(self._find_profile(document, clone_from), name) if clone_from else empty_profile(name)
            document.setdefault("profiles", []).append(profile)
            document["active_profile_id"] = profile["id"]
            self._atomic_write_json(self.profiles_path, document)
            return profile

    def delete_profile(self, profile_id: str) -> None:
        with self.locked():
            document = self._profiles()
            profiles = document.get("profiles", [])
            document["profiles"] = [p for p in profiles if p.get("id") != profile_id]
            if len(document["profiles"]) == len(profiles):
                raise ValueError("简历档案不存在")
            if document.get("active_profile_id") == profile_id:
                document["active_profile_id"] = document["profiles"][0]["id"] if document["profiles"] else ""
            self._atomic_write_json(self.profiles_path, document)

    @staticmethod
    def _set_canonical_value(profile: dict, canonical: str, value: str, record_index: int = 0) -> str:
        if canonical.startswith("basic."):
            key = canonical.split(".", 1)[1]
            profile.setdefault("basic", {})[key] = value
            return canonical
        match = re.fullmatch(r"([a-z_]+)\[\]\.([a-z_]+)", canonical)
        if match and match.group(1) in SECTION_DEFINITIONS:
            section, key = match.groups()
            records = profile.setdefault(section, [])
            safe_index = max(0, int(record_index or 0))
            while len(records) <= safe_index:
                records.append({"id": str(uuid4())})
            records[safe_index][key] = value
            return canonical
        if canonical in {key for key, _label, _height in LONG_TEXT_FIELDS}:
            profile[canonical] = value
            return canonical
        label = canonical.removeprefix("custom.").strip()
        if label:
            profile.setdefault("custom_fields", {})[label] = value
            return f"custom.{label}"
        raise ValueError(f"不支持的档案字段：{canonical}")

    @staticmethod
    def _canonical_exists(profile: dict, canonical: str, record_index: int) -> bool:
        if canonical.startswith("basic."):
            return canonical.split(".", 1)[1] in profile.get("basic", {})
        match = re.fullmatch(r"([a-z_]+)\[\]\.([a-z_]+)", canonical)
        if match and match.group(1) in SECTION_DEFINITIONS:
            section, key = match.groups()
            records = profile.get(section, [])
            return record_index < len(records) and key in records[record_index]
        if canonical in {key for key, _label, _height in LONG_TEXT_FIELDS}:
            return canonical in profile
        return canonical.removeprefix("custom.").strip() in profile.get("custom_fields", {})

    def save_form_fields(self, profile_id: str, fields: list[dict], hostname: str = "", create_missing: bool = False) -> dict:
        with self.locked():
            document = self._profiles()
            profile = self._find_profile(document, profile_id)
            mappings = self._mappings()
            site_map = mappings.setdefault("sites", {}).setdefault(hostname, {}) if hostname else None
            saved = []
            for field in fields:
                label = str(field.get("label", "")).strip()
                value = str(field.get("value", "")).strip()
                if not label or (not value and not create_missing):
                    continue
                canonical = str(field.get("canonical", "")).strip() or f"custom.{label}"
                if re.search(r"密码|验证码|校验码|短信码|动态码|图形码|同意协议|用户协议|隐私协议|隐私政策|同意条款|阅读并同意|搜索|password|passwd|verification.?code|captcha|\botp\b|agreement|privacy|(?:^|[\W_])search(?:$|[\W_])", f"{label} {canonical}", re.IGNORECASE):
                    continue
                record_index = max(0, int(field.get("record_index", 0) or 0))
                exists = self._canonical_exists(profile, canonical, record_index)
                # Empty page controls register new fields, never erase existing values.
                if value or not exists:
                    canonical = self._set_canonical_value(profile, canonical, value, record_index)
                if site_map is not None:
                    context = str(field.get("context", "")).strip()
                    site_map[f"{context}::{label}" if context else label] = canonical
                saved.append({"label": label, "canonical": canonical, "record_index": record_index,
                              "created": not exists, "value_written": bool(value)})
            self._atomic_write_json(self.profiles_path, document)
            if saved:
                self._atomic_write_json(self.mappings_path, mappings)
            return {"saved": saved, "profile": profile,
                    "created": sum(item["created"] for item in saved),
                    "values_saved": sum(item["value_written"] for item in saved)}

    def save_custom_fields(self, profile_id: str, fields: list[dict], hostname: str = "") -> dict:
        return self.save_form_fields(profile_id, fields, hostname)

    def add_mapping(self, hostname: str, label: str, canonical: str) -> None:
        with self.locked():
            mappings = self._mappings()
            mappings.setdefault("sites", {}).setdefault(hostname, {})[label] = canonical
            self._atomic_write_json(self.mappings_path, mappings)

    def delete_mapping(self, hostname: str, label: str) -> None:
        with self.locked():
            mappings = self._mappings()
            site = mappings.setdefault("sites", {}).get(hostname, {})
            site.pop(label, None)
            self._atomic_write_json(self.mappings_path, mappings)

    def record_application(self, payload: dict) -> dict:
        record = {
            "id": str(uuid4()),
            "profile_id": payload.get("profile_id", ""),
            "profile_name": payload.get("profile_name", ""),
            "company": payload.get("company", ""),
            "job_title": payload.get("job_title", ""),
            "job_id": payload.get("job_id", ""),
            "url": payload.get("url", ""),
            "hostname": payload.get("hostname", ""),
            "status": payload.get("status", "已填写"),
            "filled": int(payload.get("filled", 0)),
            "missing": int(payload.get("missing", 0)),
            "failed": int(payload.get("failed", 0)),
            "created_at": now_iso(),
        }
        with self.locked():
            with self.history_path.open("a", encoding="utf-8", newline="\n") as stream:
                stream.write(json.dumps(record, ensure_ascii=False) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
        return record

    def list_history(self) -> list[dict]:
        with self.locked():
            return list(reversed(self._history()))

    def update_history_status(self, record_id: str, status: str) -> None:
        with self.locked():
            records = self._history()
            for record in records:
                if record.get("id") == record_id:
                    record["status"] = status
                    record["updated_at"] = now_iso()
                    break
            self._write_history(records)

    def delete_history(self, record_id: str) -> None:
        with self.locked():
            records = [item for item in self._history() if item.get("id") != record_id]
            self._write_history(records)

    def add_document(self, profile_id: str, path: str, document_type: str = "resume") -> dict:
        file_path = Path(path)
        document_item = {
            "id": str(uuid4()),
            "name": file_path.name,
            "type": document_type,
            "path": str(file_path.resolve()),
            "mime_type": mimetypes.guess_type(file_path.name)[0] or "application/octet-stream",
        }
        with self.locked():
            document = self._profiles()
            profile = self._find_profile(document, profile_id)
            profile.setdefault("documents", []).append(document_item)
            self._atomic_write_json(self.profiles_path, document)
        return document_item

    def delete_document(self, profile_id: str, document_id: str) -> None:
        with self.locked():
            document = self._profiles()
            profile = self._find_profile(document, profile_id)
            profile["documents"] = [item for item in profile.get("documents", []) if item.get("id") != document_id]
            self._atomic_write_json(self.profiles_path, document)

    def get_document(self, profile_id: str, document_id: str) -> dict:
        profile = self.get_profile(profile_id)
        for document in profile.get("documents", []):
            if document.get("id") == document_id:
                path = Path(document["path"])
                result = dict(document)
                result["exists"] = path.exists()
                result["size"] = path.stat().st_size if path.exists() else 0
                return result
        raise ValueError("附件不存在")

    def read_document_chunk(self, profile_id: str, document_id: str, offset: int, size: int) -> tuple[dict, bytes]:
        document = self.get_document(profile_id, document_id)
        if not document["exists"]:
            raise FileNotFoundError(f"附件文件不存在：{document['path']}")
        safe_size = max(1, min(int(size), 512 * 1024))
        with Path(document["path"]).open("rb") as stream:
            stream.seek(max(0, int(offset)))
            chunk = stream.read(safe_size)
        return document, chunk

    def export_profile_markdown(self, profile_id: str, destination: str | Path) -> Path:
        profile = self.get_profile(profile_id)
        target = Path(destination)
        lines = [f"# {profile.get('name', '简历档案')}", "", "## 基本资料", ""]
        for key, value in profile.get("basic", {}).items():
            if value:
                lines.append(f"- {key}: {value}")
        for section_key, definition in SECTION_DEFINITIONS.items():
            title = definition["label"]
            lines.extend(["", f"## {title}", ""])
            for item in profile.get(section_key, []):
                lines.append(f"### {next((str(v) for k, v in item.items() if k != 'id' and v), '未命名')}")
                for key, value in item.items():
                    if key != "id" and value:
                        lines.append(f"- {key}: {value}")
                lines.append("")
        for key, title, _height in LONG_TEXT_FIELDS:
            if profile.get(key):
                lines.extend([f"## {title}", "", str(profile[key]), ""])
        if profile.get("custom_fields"):
            lines.extend(["## 自定义字段", ""])
            for key, value in profile["custom_fields"].items():
                lines.append(f"- {key}: {value}")
        self._atomic_write_text(target, "\n".join(lines).rstrip() + "\n", backup=False)
        return target

    def site_mappings(self) -> list[dict]:
        with self.locked():
            mappings = self._mappings()
            rows = []
            for host, labels in mappings.get("sites", {}).items():
                for label, canonical in labels.items():
                    rows.append({"hostname": host, "label": label, "canonical": canonical})
            return rows

    def export_full_package(self, destination: str | Path) -> Path:
        target = Path(destination)
        with self.locked():
            profiles = json.loads(json.dumps(self._profiles(), ensure_ascii=False))
            package = {
                "format": "resume-helper-package",
                "version": 1,
                "exported_at": now_iso(),
                "profiles": profiles,
                "mappings": self._mappings(),
                "history": self._history(),
                "settings": self._read_json(self.settings_path, {}),
            }
            target.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for profile in profiles.get("profiles", []):
                    for document in profile.get("documents", []):
                        source = Path(str(document.get("path", "")))
                        if not source.is_file():
                            document["bundle_missing"] = True
                            continue
                        suffix = source.suffix.lower()
                        arcname = f"attachments/{profile.get('id', 'profile')}/{document.get('id', uuid4().hex)}{suffix}"
                        archive.write(source, arcname)
                        document["bundle_path"] = arcname
                archive.writestr(
                    "resume-helper-package.json",
                    json.dumps(package, ensure_ascii=False, indent=2) + "\n",
                )
        return target

    def import_full_package(self, source: str | Path) -> dict:
        archive_path = Path(source)
        import_id = uuid4().hex
        attachment_root = self.data_dir / "imported-attachments" / import_id
        with zipfile.ZipFile(archive_path, "r") as archive:
            if "resume-helper-package.json" not in archive.namelist():
                raise ValueError("不是有效的简历快填数据包")
            info = archive.getinfo("resume-helper-package.json")
            if info.file_size > 20 * 1024 * 1024:
                raise ValueError("数据包索引文件异常过大")
            package = json.loads(archive.read(info).decode("utf-8-sig"))
            if package.get("format") != "resume-helper-package" or int(package.get("version", 0)) != 1:
                raise ValueError("不支持的数据包版本")

            profiles = package.get("profiles")
            mappings = package.get("mappings")
            history = package.get("history")
            settings = package.get("settings")
            if not isinstance(profiles, dict) or not isinstance(profiles.get("profiles"), list):
                raise ValueError("数据包中的档案结构无效")
            if not isinstance(mappings, dict) or not isinstance(history, list) or not isinstance(settings, dict):
                raise ValueError("数据包中的本地数据结构无效")

            total_size = 0
            pending_attachments = []
            names = set(archive.namelist())
            for profile in profiles["profiles"]:
                for document in profile.get("documents", []):
                    bundle_path = str(document.pop("bundle_path", ""))
                    document.pop("bundle_missing", None)
                    if not bundle_path:
                        continue
                    if bundle_path not in names or not bundle_path.startswith("attachments/") or ".." in bundle_path.split("/"):
                        raise ValueError("数据包包含无效的附件路径")
                    member = archive.getinfo(bundle_path)
                    if member.file_size > 200 * 1024 * 1024:
                        raise ValueError(f"附件过大：{document.get('name', bundle_path)}")
                    total_size += member.file_size
                    if total_size > 1024 * 1024 * 1024:
                        raise ValueError("数据包附件总大小超过 1 GB")
                    safe_name = self.safe_filename(str(document.get("name", "attachment")))
                    destination = attachment_root / str(profile.get("id", "profile")) / f"{document.get('id', uuid4().hex)}-{safe_name}"
                    pending_attachments.append((bundle_path, destination, document))

            for bundle_path, destination, document in pending_attachments:
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(bundle_path) as input_stream, destination.open("wb") as output_stream:
                    shutil.copyfileobj(input_stream, output_stream)
                document["path"] = str(destination.resolve())

        with self.locked():
            for path in (self.profiles_path, self.mappings_path, self.history_path, self.settings_path):
                self._backup(path)
            self._atomic_write_json(self.profiles_path, profiles, backup=False)
            self._atomic_write_json(self.mappings_path, mappings, backup=False)
            self._write_history(history)
            self._atomic_write_json(self.settings_path, settings, backup=False)
            self._upgrade_schema()
        return {"profiles": len(profiles.get("profiles", [])), "attachments": len(pending_attachments)}

    @staticmethod
    def safe_filename(value: str) -> str:
        return re.sub(r"[\\/:*?\"<>|]+", "_", value).strip() or "profile"

