"""Local attachment extraction for all supported resume profile fields."""
from __future__ import annotations

import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from .defaults import BASIC_FIELDS, LONG_TEXT_FIELDS, SECTION_DEFINITIONS, initial_mappings_document

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_TEXT_CHARS = 500_000
ALIASES = {
    "full_name": ["姓名", "真实姓名", "中文姓名", "Name"],
    "english_name": ["英文名", "英文姓名", "English Name"],
    "phone": ["手机号码", "手机", "联系电话", "电话", "Mobile", "Phone"],
    "backup_phone": ["备用电话", "备用手机"],
    "email": ["电子邮箱", "电子邮件", "邮箱", "E-mail", "Email"],
    "gender": ["性别", "Gender"],
    "birth_date": ["出生日期", "出生年月", "生日", "Date of Birth"],
    "id_number": ["身份证号", "身份证号码", "证件号码"],
    "political_status": ["政治面貌"],
    "nationality": ["民族"],
    "nationality_country": ["国籍"],
    "native_place": ["籍贯"],
    "current_city": ["现居城市", "现居地", "现居住地", "现居"],
    "address": ["联系地址", "通讯地址", "居住地址"],
    "wechat": ["微信号", "微信", "WeChat"],
}

SECTION_HEADINGS = {
    "job_intentions": ("求职意向", "职业目标", "应聘意向"),
    "education": ("教育背景", "教育经历", "教育情况", "Education"),
    "work_experience": ("工作经验", "工作经历", "实习经历", "实习经验", "Work Experience"),
    "projects": ("项目经历", "项目经验", "科研项目", "Project Experience"),
    "campus_experience": ("校园经历", "在校经历", "校园实践", "学生工作", "社团经历"),
    "volunteer_experience": ("志愿经历", "志愿服务", "社会实践"),
    "certificates_awards": ("证书与奖项", "荣誉证书", "证书奖项", "获奖情况", "奖励荣誉", "荣誉奖项", "Awards"),
    "language_skills": ("语言能力", "外语能力", "语言技能", "Languages"),
    "professional_skills": ("专业技能", "掌握技能", "技能特长", "个人技能", "计算机技能", "IT技能", "Skills"),
    "trainings": ("培训经历", "培训经验", "培训课程"),
    "publications": ("论文/著作", "论文著作", "论文成果", "学术论文", "Publications"),
    "patents": ("专利/软件著作权", "专利软著", "专利成果", "软件著作权", "Patents"),
    "family_members": ("家庭成员", "家庭情况"),
    "emergency_contacts": ("紧急联系人", "应急联系人"),
    "references": ("证明人/推荐人", "证明人", "推荐人"),
}

LONG_TEXT_HEADINGS = {
    "skills": ("专业技能", "掌握技能", "技能特长", "个人技能", "计算机技能", "IT技能", "Skills"),
    "personal_advantages": ("个人优势", "核心优势", "个人能力", "个人亮点"),
    "self_evaluation": ("自我评价", "个人评价", "自我介绍", "自我描述"),
    "hobbies": ("兴趣爱好", "个人爱好", "特长爱好"),
    "career_plan": ("职业规划", "发展规划"),
    "research_summary": ("科研成果", "科研概述", "学术成果概述", "研究成果"),
}

DATE_RANGE = re.compile(
    r"^\s*(?P<start>\d{4}\s*(?:[./-]|年)\s*\d{1,2}\s*月?)\s*"
    r"(?:[-–—~至到]+)\s*"
    r"(?P<end>至今|现在|今|Present|\d{4}\s*(?:[./-]|年)\s*\d{1,2}\s*月?)"
    r"\s*(?P<title>.*)$",
    re.I,
)


def _normalize_heading(value: str) -> str:
    return re.sub(r"[\s：:&＆/|·•（）()_-]", "", value).casefold()


def _heading_aliases() -> list[tuple[str, list[str]]]:
    aliases: dict[str, list[str]] = {}
    for section, headings in SECTION_HEADINGS.items():
        for heading in (*headings, SECTION_DEFINITIONS[section]["label"]):
            targets = aliases.setdefault(heading, [])
            if section not in targets:
                targets.append(section)
    for key, headings in LONG_TEXT_HEADINGS.items():
        for heading in headings:
            target = f"long:{key}"
            targets = aliases.setdefault(heading, [])
            if target not in targets:
                targets.append(target)
    return sorted(aliases.items(), key=lambda item: len(item[0]), reverse=True)


HEADING_ALIASES = _heading_aliases()


def _heading_targets(line: str) -> tuple[list[str] | None, str]:
    compact = _normalize_heading(line)
    for heading, targets in HEADING_ALIASES:
        normalized = _normalize_heading(heading)
        if compact == normalized:
            return targets, ""
        match = re.match(rf"^\s*{re.escape(heading)}\s*[:：]\s*(.+)$", line, re.I)
        if match:
            return targets, _clean_line(match[1])
    return None, ""


def _date(value: str) -> str:
    if value.casefold() in {"至今", "现在", "今", "present"}:
        return "至今"
    match = re.search(r"(\d{4})\D+(\d{1,2})", value)
    return f"{match[1]}-{int(match[2]):02d}" if match else value.strip()


def _clean_line(line: str) -> str:
    return re.sub(r"\s+", " ", line.strip().lstrip("#*•●▪·- ")).strip()


def _split_document_lines(text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: list[str] = []
    for raw_line in text.splitlines():
        line = _clean_line(raw_line)
        if not line:
            continue
        targets, inline_value = _heading_targets(line)
        if targets is not None:
            current = targets
            for target in current:
                sections.setdefault(target, [])
                if inline_value:
                    sections[target].append(inline_value)
            continue
        for target in current:
            sections[target].append(line)
    return sections


def _split_section_lines(text: str) -> dict[str, list[str]]:
    return {key: lines for key, lines in _split_document_lines(text).items() if not key.startswith("long:")}


def _dated_entries(lines: list[str]) -> list[dict]:
    entries: list[dict] = []
    current: dict | None = None
    for line in lines:
        match = DATE_RANGE.match(line)
        if match:
            current = {
                "start_date": _date(match["start"]),
                "end_date": _date(match["end"]),
                "title": match["title"].strip(" |｜,，;；"),
                "body": [],
            }
            entries.append(current)
        elif current:
            if not current["body"] and current["title"].count("（") > current["title"].count("）"):
                current["title"] += line
            else:
                current["body"].append(line)
        elif entries:
            entries[-1]["body"].append(line)
    return entries


def _description(lines: list[str]) -> str:
    return "\n".join(line for line in (_clean_line(item) for item in lines) if line)


def _parse_education(entry: dict) -> dict:
    title = entry["title"]
    record = {"start_date": entry["start_date"], "end_date": entry["end_date"]}
    school = re.search(r"^(.+?(?:大学|学院|学校))(?=\s|$)", title)
    if school:
        record["school"] = school[1].strip()
        remainder = title[school.end():].strip()
    else:
        remainder = title
    degree = re.search(r"(?:^|\s)(博士|硕士|本科|大专|专科|高中|中专|MBA)(?:\s|$)", remainder, re.I)
    if degree:
        record["degree"] = degree[1]
        remainder = (remainder[:degree.start()] + " " + remainder[degree.end():]).strip()
    if remainder:
        record["major"] = remainder
    body = _description(entry["body"])
    courses = re.search(r"主修课程\s*[:：]\s*(.+?)(?=\s+(?:绩点|GPA|排名)\s*[:：]|$)", body, re.I)
    if courses:
        record["courses"] = courses[1].strip(" ，,;；")
    gpa = re.search(r"(?:绩点|GPA)\s*[:：]\s*([0-9.]+)(?:\s*/\s*([0-9.]+))?", body, re.I)
    if gpa:
        record["gpa"] = gpa[1]
        if gpa[2]:
            record["gpa_scale"] = gpa[2]
    rank = re.search(r"(?:排名\s*[:：]\s*)?(前?\s*\d+(?:\.\d+)?\s*%)", body)
    if rank:
        record["rank"] = re.sub(r"\s+", "", rank[1])
    if body:
        record["description"] = body
    return record


def _split_work_title(title: str) -> tuple[str, str]:
    company = re.match(
        r"^(.+?(?:有限责任公司|股份有限公司|有限公司|集团|研究院|研究所|事务所|银行|中心|医院|学校|大学|学院|委员会|政府))(?=\s|$)(.*)$",
        title,
    )
    if company:
        return company[1].strip(), company[2].strip()
    position = re.search(
        r"\s+([^\s]{1,20}(?:工程师|实习生|经理|专员|顾问|研究员|分析师|助理|主管|总监|教师|开发|设计师|运营))$",
        title,
    )
    if position:
        return title[:position.start()].strip(), position[1].strip()
    return title.strip(), ""


def _parse_work(entry: dict) -> dict:
    company, position = _split_work_title(entry["title"])
    record = {"company": company, "start_date": entry["start_date"], "end_date": entry["end_date"]}
    if position:
        record["position"] = position
    body = _description(entry["body"])
    if body:
        record["description"] = body
    return record


def _parse_project(entry: dict) -> dict:
    title = re.sub(r"\s+(?:(?:国家级|省级|校级)?(?:科研项目|竞赛|创新创业项目))$", "", entry["title"]).strip()
    record = {"name": title or entry["title"], "start_date": entry["start_date"], "end_date": entry["end_date"]}
    body = _description(entry["body"])
    role = re.search(r"(?:主要工作|项目职责|角色)\s*[:：]\s*([^，。；;\n]{1,30})", body)
    if role:
        record["role"] = role[1].strip()
    if body:
        record["description"] = body
    return record


def _parse_campus(entry: dict) -> dict:
    title = entry["title"]
    role = re.search(r"\s+([^\s]{1,30}(?:主席|部长|组长|队长|负责人|干事|委员|社长|成员)(?:[/／][^\s]+)?)$", title)
    if role:
        organization, role_value = title[:role.start()].strip(), role[1].strip()
    else:
        organization, role_value = title, ""
    record = {"organization": organization, "start_date": entry["start_date"], "end_date": entry["end_date"]}
    if role_value:
        record["role"] = role_value
    body = _description(entry["body"])
    if body:
        record["description"] = body
    return record


def _section_field_aliases(section: str) -> dict[str, str]:
    prefix = f"{section}[]."
    mappings = initial_mappings_document()["global"]
    aliases: dict[str, str] = {}
    for canonical, values in mappings.items():
        if not canonical.startswith(prefix):
            continue
        key = canonical[len(prefix):]
        for alias in values:
            aliases[alias.casefold()] = key
    return aliases


def _clean_field_value(key: str, value: str) -> str:
    cleaned = value.strip(" \t|｜,，;；*")
    if not cleaned:
        return ""
    if key == "number":
        identifier = re.match(r"([A-Z0-9.-]{6,})", cleaned, re.I)
        if identifier:
            return identifier[1]
    if key.endswith("date") or key in {"start_date", "end_date", "expected_graduation"}:
        date = re.fullmatch(r"(\d{4})\s*[年./-]\s*(\d{1,2})(?:\s*[月./-]\s*(\d{1,2})\s*日?)?\s*月?", cleaned)
        if date:
            return f"{date[1]}-{int(date[2]):02d}" + (f"-{int(date[3]):02d}" if date[3] else "")
    return cleaned


def _labelled_values(section: str, line: str) -> dict[str, str]:
    aliases = _section_field_aliases(section)
    if not aliases:
        return {}
    pattern = "|".join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))
    matcher = re.compile(r"(?<![\w\u4e00-\u9fff])(" + pattern + r")[ \t]*(?:[:：][ \t]*|[ \t]+)", re.I)
    matches = list(matcher.finditer(line))
    values = {}
    for index, match in enumerate(matches):
        value = line[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(line)]
        key = aliases[match[1].casefold()]
        cleaned = _clean_field_value(key, value)
        if cleaned:
            values[key] = cleaned
    return values


def _parse_labelled_records(section: str, lines: list[str]) -> tuple[list[dict], set[int]]:
    primary = SECTION_DEFINITIONS[section]["fields"][0][0]
    description_key = next((key for key, _label in SECTION_DEFINITIONS[section]["fields"] if key == "description"), "")
    records: list[dict] = []
    used: set[int] = set()
    current: dict = {}
    for index, line in enumerate(lines):
        values = _labelled_values(section, line)
        if not values:
            if current and description_key and len(line) <= 500:
                current[description_key] = "\n".join(filter(None, [current.get(description_key, ""), line]))
                used.add(index)
            continue
        used.add(index)
        if current and (primary in values or any(key in current for key in values)):
            records.append(current)
            current = {}
        current.update(values)
    if current:
        records.append(current)
    return records, used


def _extract_loose_date(value: str) -> tuple[str, str]:
    match = re.search(r"(?<!\d)((?:19|20)\d{2})(?:\s*[./年-]\s*(\d{1,2})\s*月?)?", value)
    if not match:
        return "", value
    date = match[1] + (f"-{int(match[2]):02d}" if match[2] else "")
    remainder = (value[:match.start()] + " " + value[match.end():]).strip(" -–—|｜,，;；")
    return date, re.sub(r"\s+", " ", remainder)


def _parse_award_line(line: str) -> dict:
    date, name = _extract_loose_date(line)
    record = {"name": name or line, "category": "奖项" if re.search(r"奖|荣誉|奖学金|竞赛|大赛", line) else "证书"}
    if date:
        record["date"] = date
    level = re.search(r"(国家级|省级|市级|校级|院级|特等奖|一等奖|二等奖|三等奖|金奖|银奖|铜奖|优秀奖)", line)
    if level:
        record["level"] = level[1]
    return record


def _parse_language_line(line: str) -> dict:
    language = re.search(r"(英语|中文|汉语|普通话|日语|法语|德语|俄语|韩语|西班牙语|粤语|English|Japanese|French|German)", line, re.I)
    certificate = re.search(r"(CET[- ]?[46]|TEM[- ]?[48]|IELTS|TOEFL|TOEIC|HSK\s*\d*|大学英语[四六]级|雅思|托福|专四|专八)", line, re.I)
    score = re.search(r"(?<!\d)(\d{2,3}(?:\.\d+)?)\s*分", line)
    level = re.search(r"(母语|精通|熟练|良好|一般|基础|流利|商务水平|工作沟通)", line)
    record = {"language": language[1] if language else line.split("：", 1)[0].split(":", 1)[0].strip()}
    if certificate:
        record["certificate"] = certificate[1].upper().replace(" ", "-")
    if score:
        record["score"] = score[1]
    if level:
        record["level"] = level[1]
    if len(record) == 1 and record["language"] == line:
        record["level"] = line
    return record


def _parse_skill_lines(lines: list[str]) -> list[dict]:
    records = []
    for line in lines:
        parts = [part.strip() for part in re.split(r"[、,，;；]", line) if part.strip()]
        simple_list = len(parts) > 1 and all(len(part) <= 35 and not re.search(r"能够|负责|使用|掌握|熟悉|精通.+(?:及|和)", part) for part in parts)
        if simple_list:
            records.extend({"name": part} for part in parts)
            continue
        match = re.match(r"^([^:：]{1,35})[:：]\s*(.+)$", line)
        records.append({"name": match[1].strip() if match else line, **({"description": match[2].strip()} if match else {})})
    return records


def _parse_publication_line(line: str) -> dict:
    date, remainder = _extract_loose_date(line)
    quoted = re.search(r"[《\"]([^》\"]+)[》\"]", remainder)
    record = {"title": quoted[1].strip() if quoted else remainder}
    if date:
        record["publication_date"] = date
    status = re.search(r"(已发表|已录用|已接收|在投|见刊|已出版|SCI|EI|CSSCI|核心期刊)", line, re.I)
    if status:
        record["status"] = status[1]
    doi = re.search(r"(?:doi\s*[:：]?\s*)?(10\.\d{4,9}/\S+|https?://\S+)", line, re.I)
    if doi:
        record["doi"] = doi[1].rstrip(".,，。;；")
    return record


def _parse_patent_line(line: str) -> dict:
    date, remainder = _extract_loose_date(line)
    number = re.search(r"(?:申请号|专利号|登记号)\s*[:：]?\s*([A-Z]{0,3}\d[\d.]+[A-Z]?|\d{6,})", line, re.I)
    record = {"name": remainder}
    if number:
        record["number"] = number[1]
    patent_type = re.search(r"(发明专利|实用新型|外观设计|软件著作权|软著)", line)
    if patent_type:
        record["type"] = patent_type[1]
    status = re.search(r"(已授权|已受理|申请中|已登记|授权)", line)
    if status:
        record["status"] = status[1]
    if date:
        record["authorization_date" if status and "授权" in status[1] else "application_date"] = date
    return record


def _parse_training_entries(lines: list[str]) -> list[dict]:
    records = []
    for entry in _dated_entries(lines):
        record = {"name": entry["title"], "start_date": entry["start_date"], "end_date": entry["end_date"]}
        body = _description(entry["body"])
        if body:
            record["description"] = body
        records.append(record)
    return records


def _unlabelled_records(section: str, lines: list[str]) -> list[dict]:
    if section == "certificates_awards":
        return [_parse_award_line(line) for line in lines]
    if section == "language_skills":
        return [_parse_language_line(line) for line in lines]
    if section == "professional_skills":
        return _parse_skill_lines(lines)
    if section == "publications":
        return [_parse_publication_line(line) for line in lines]
    if section == "patents":
        return [_parse_patent_line(line) for line in lines]
    if section == "trainings":
        return _parse_training_entries(lines)
    if section == "job_intentions" and lines:
        return [{"position": lines[0], **({"notes": "\n".join(lines[1:])} if len(lines) > 1 else {})}]
    return []


def _parse_specialized_lines(section: str, lines: list[str]) -> list[dict]:
    records = []
    for line in lines:
        labelled = _labelled_values(section, line)
        inferred = _unlabelled_records(section, [line])
        if labelled:
            base = inferred[0] if inferred else {}
            base.update(labelled)
            records.append(base)
        else:
            records.extend(inferred)
    return records


def parse_experience_sections(text: str) -> dict[str, list[dict]]:
    parsers = {
        "education": _parse_education,
        "work_experience": _parse_work,
        "projects": _parse_project,
        "campus_experience": _parse_campus,
        "volunteer_experience": _parse_campus,
    }
    result: dict[str, list[dict]] = {}
    for section, lines in _split_section_lines(text).items():
        parser = parsers.get(section)
        if section in {"certificates_awards", "language_skills", "professional_skills", "publications", "patents"}:
            records = _parse_specialized_lines(section, lines)
        elif parser:
            records = [parser(entry) for entry in _dated_entries(lines)]
            if not records:
                records, used = _parse_labelled_records(section, lines)
                records.extend(_unlabelled_records(section, [line for index, line in enumerate(lines) if index not in used]))
        else:
            records, used = _parse_labelled_records(section, lines)
            records.extend(_unlabelled_records(section, [line for index, line in enumerate(lines) if index not in used]))
        required_key = {
            "education": "school",
            "work_experience": "company",
            "projects": "name",
            "campus_experience": "organization",
            "volunteer_experience": "organization",
            "certificates_awards": "name",
            "language_skills": "language",
            "professional_skills": "name",
            "trainings": "name",
            "publications": "title",
            "patents": "name",
            "family_members": "name",
            "emergency_contacts": "name",
            "references": "name",
            "job_intentions": "position",
        }[section]
        records = [record for record in records if record.get(required_key)]
        if records:
            allowed = {key for key, _label in SECTION_DEFINITIONS[section]["fields"]}
            result[section] = [{key: value for key, value in record.items() if key in allowed and value} for record in records]
    return result


def parse_long_text_fields(text: str) -> dict[str, str]:
    sections = _split_document_lines(text)
    result = {}
    for key, _label, _height in LONG_TEXT_FIELDS:
        value = _description(sections.get(f"long:{key}", []))
        if value:
            result[key] = value
    return result


def parse_custom_fields(text: str, labels: list[str] | tuple[str, ...] | set[str]) -> dict[str, str]:
    cleaned_labels = sorted({str(label).strip() for label in labels if str(label).strip()}, key=len, reverse=True)
    if not cleaned_labels:
        return {}
    lookup = {label.casefold(): label for label in cleaned_labels}
    pattern = "|".join(re.escape(label) for label in cleaned_labels)
    matcher = re.compile(r"(?<![\w\u4e00-\u9fff])(" + pattern + r")[ \t]*(?:[:：][ \t]*|[ \t]+)", re.I)
    candidates: dict[str, list[str]] = {}
    for raw_line in text.splitlines():
        line = _clean_line(raw_line)
        matches = list(matcher.finditer(line))
        for index, match in enumerate(matches):
            value = line[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(line)]
            value = value.strip(" \t|｜,，;；*")
            if value and len(value) <= 1000:
                candidates.setdefault(lookup[match[1].casefold()], []).append(value)
    return {label: values[0] for label, values in candidates.items() if len(set(values)) == 1}


def read_attachment_text(path: str | Path) -> str:
    source = Path(path)
    if not source.is_file():
        raise FileNotFoundError("附件文件不存在")
    if source.stat().st_size > MAX_FILE_BYTES:
        raise ValueError("附件超过 20 MB，请选择较小的简历文件")
    suffix = source.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(source)
        if reader.is_encrypted and not reader.decrypt(""):
            raise ValueError("PDF 已加密，请先提供未加密的文件")
        if len(reader.pages) > 100:
            raise ValueError("PDF 页数超过 100 页，请选择简历附件")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif suffix == ".docx":
        with zipfile.ZipFile(source) as archive:
            info = archive.getinfo("word/document.xml")
            if info.file_size > MAX_FILE_BYTES:
                raise ValueError("Word 文档解压后过大")
            root = ET.fromstring(archive.read(info))
        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
        text = "\n".join("".join(node.itertext()) for node in root.findall(".//w:p", ns))
    elif suffix in {".txt", ".md"}:
        raw = source.read_bytes()
        for encoding in ("utf-8-sig", "gb18030", "utf-16"):
            try:
                text = raw.decode(encoding)
                break
            except UnicodeError:
                continue
        else:
            raise ValueError("无法识别文本编码，请另存为 UTF-8")
    else:
        raise ValueError("支持 PDF、DOCX、TXT、Markdown；图片、扫描件和旧版 DOC 暂不支持")
    if not text.strip():
        raise ValueError("附件没有可读取文字；扫描版 PDF 请先进行 OCR 或改用文字版简历")
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError("附件文字过多，请选择简历文件")
    return text


def parse_basic_info(text: str) -> dict:
    aliases = {key: list(values) for key, values in ALIASES.items()}
    for key, label in BASIC_FIELDS:
        aliases.setdefault(key, []).append(label)
    alias_to_key = {alias.casefold(): key for key, values in aliases.items() for alias in values}
    pattern = "|".join(re.escape(alias) for alias in sorted(alias_to_key, key=len, reverse=True))
    # Require a boundary and separator; avoids finding '姓名' inside '联系人姓名'.
    matcher = re.compile(r"(?<![\w\u4e00-\u9fff])(" + pattern + r")[ \t]*(?:[:：][ \t]*|[ \t]+)", re.I)
    candidates: dict[str, list[str]] = {}
    for line in text.splitlines():
        line = line.strip().lstrip("#* ")
        matches = list(matcher.finditer(line))
        for index, match in enumerate(matches):
            value = line[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(line)]
            value = value.strip(" \t|｜,，;；*")
            if value and len(value) <= 120:
                candidates.setdefault(alias_to_key[match[1].casefold()], []).append(value)
    # Only infer unlabelled contact details when the whole document has a unique value.
    if "email" not in candidates:
        candidates["email"] = re.findall(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    if "phone" not in candidates:
        candidates["phone"] = re.findall(r"(?<!\d)(?:\+?86[- ]?)?1[3-9]\d(?:[- ]?\d){8}(?!\d)", text)
    fields, ambiguous = {}, []
    for key, values in candidates.items():
        values = list(dict.fromkeys(values))
        if len(values) != 1:
            if values:
                ambiguous.append(key)
            continue
        value = values[0]
        if key in {"phone", "backup_phone"}:
            value = re.sub(r"[\s-]", "", value)
            if not re.fullmatch(r"(?:\+?86)?1[3-9]\d{9}|(?:\+?\d{1,3})?\d{7,12}", value):
                continue
        if key == "email" and not re.fullmatch(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", value):
            continue
        if key == "gender" and value not in {"男", "女", "男性", "女性", "Male", "Female", "male", "female"}:
            continue
        if key == "full_name" and (len(value) > 50 or re.search(r"简历|求职|联系人|推荐人", value)):
            continue
        if key.endswith("date"):
            compact_value = re.sub(r"\s+", "", value)
            date = re.fullmatch(r"(\d{4})[年./-](\d{1,2})(?:[月./-](\d{1,2})日?)?月?", compact_value)
            if not date or not 1 <= int(date[2]) <= 12 or (date[3] and not 1 <= int(date[3]) <= 31):
                continue
            value = f"{date[1]}-{int(date[2]):02d}" + (f"-{int(date[3]):02d}" if date[3] else "")
        fields[key] = value
    return {"fields": fields, "ambiguous": ambiguous}


def recognize_attachment(path: str | Path, profile: dict | None = None) -> dict:
    text = read_attachment_text(path)
    result = parse_basic_info(text)
    result["sections"] = parse_experience_sections(text)
    result["long_text"] = parse_long_text_fields(text)
    result["custom_fields"] = parse_custom_fields(text, (profile or {}).get("custom_fields", {}).keys())
    if not any((result["fields"], result["sections"], result["long_text"], result["custom_fields"])):
        raise ValueError("没有识别到明确的档案字段，请检查附件的文字内容")
    return result
