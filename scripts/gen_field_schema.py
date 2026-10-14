#!/usr/bin/env python3
"""从 app/defaults.py 生成 extension/field_schema.js（单一字段事实源）。

用法（在项目根目录）：
    python scripts/gen_field_schema.py

生成规则：
- canonical key 与 defaults.py 完全一致（basic.* / section[].* / 长文本 / 派生字段）。
- name 为规范中文名（BASIC_FIELDS / SECTION_DEFINITIONS label / LONG_TEXT_FIELDS label）。
- section 为区块名（basic / 各 section / long_text）。
- aliases = 去重后的 [name] + defaults.py global 别名表，name 恒在首位。

字段顺序与 defaults.py 保持一致：basic → 各 section（定义顺序）→ 长文本 → 派生字段。
"""
from __future__ import annotations

import io
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.defaults import (  # noqa: E402
    BASIC_FIELDS,
    LONG_TEXT_FIELDS,
    SECTION_DEFINITIONS,
    initial_mappings_document,
)

# 派生字段：不在档案里存储，填写时由已有字段推导（如 年龄 <- 出生日期）。
# 仅用于匹配与展示，不写入档案 schema。
DERIVED_FIELDS = [
    ("basic.age", "年龄", "basic", ["年龄", "age", "周岁"]),
]

OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "extension", "field_schema.js")


def _dedupe(items: list[str]) -> list[str]:
    seen: list[str] = []
    for item in items:
        if item not in seen:
            seen.append(item)
    return seen


def build_fields() -> list[tuple[str, str, str, list[str]]]:
    mappings = initial_mappings_document()["global"]
    fields: list[tuple[str, str, str, list[str]]] = []

    for key, label in BASIC_FIELDS:
        canonical = f"basic.{key}"
        fields.append((canonical, label, "basic", _dedupe([label, *mappings.get(canonical, [])])))

    for section, definition in SECTION_DEFINITIONS.items():
        for key, label in definition["fields"]:
            canonical = f"{section}[].{key}"
            fields.append((canonical, label, section, _dedupe([label, *mappings.get(canonical, [])])))

    for key, label, _height in LONG_TEXT_FIELDS:
        fields.append((key, label, "long_text", _dedupe([label, *mappings.get(key, [])])))

    for key, label, section, aliases in DERIVED_FIELDS:
        fields.append((key, label, section, _dedupe([label, *aliases])))

    return fields


def render(fields: list[tuple[str, str, str, list[str]]]) -> str:
    lines = [
        "// 简历快填 —— 单一字段事实源",
        "// 由 scripts/gen_field_schema.py 从 app/defaults.py 自动生成，请勿手改。",
        "// canonical key 与 app/defaults.py 完全一致；name 为规范中文名；aliases 为别名（含英文）。",
        "// 加载方式：manifest.json 的 content_scripts 中先于 content.js 注入。",
        "(() => {",
        "  const FIELDS = [",
    ]
    for key, name, section, aliases in fields:
        name_json = json.dumps(name, ensure_ascii=False)
        aliases_json = json.dumps(aliases, ensure_ascii=False)
        lines.append(
            f'    {{ key: "{key}", name: {name_json}, section: "{section}", aliases: {aliases_json} }},'
        )
    lines.append("  ];")
    lines.append("")
    lines.append("  globalThis.__RESUME_FIELD_SCHEMA = { version: 1, fields: FIELDS };")
    lines.append("})();")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    fields = build_fields()
    output = render(fields)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with io.open(OUT_PATH, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(output)
    print(f"生成 {OUT_PATH}（{len(fields)} 个字段）")


if __name__ == "__main__":
    main()
