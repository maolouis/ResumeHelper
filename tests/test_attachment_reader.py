from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.attachment_reader import (
    parse_basic_info,
    parse_experience_sections,
    parse_long_text_fields,
    recognize_attachment,
)
from app.desktop import apply_recognized_basic, apply_recognized_profile, registered_resume_path
from app.defaults import SECTION_DEFINITIONS


class AttachmentReaderTests(unittest.TestCase):
    def test_registered_resume_path_uses_existing_resume_without_prompt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            transcript = root / "transcript.txt"
            transcript.write_text("成绩单", encoding="utf-8")
            resume = root / "resume.txt"
            resume.write_text("姓名：张三", encoding="utf-8")
            profile = {
                "documents": [
                    {"type": "transcript", "path": str(transcript)},
                    {"type": "resume", "path": str(root / "missing.pdf")},
                    {"type": "resume", "path": str(resume)},
                ]
            }

            self.assertEqual(str(resume), registered_resume_path(profile))

    def test_recognize_attachment_extracts_basic_information(self):
        with tempfile.TemporaryDirectory() as directory:
            resume = Path(directory) / "resume.txt"
            resume.write_text("姓名：张三\n手机：13800138000\n邮箱：zhangsan@example.com", encoding="utf-8")

            result = recognize_attachment(resume)

            self.assertEqual("张三", result["fields"]["full_name"])
            self.assertEqual("13800138000", result["fields"]["phone"])
            self.assertEqual("zhangsan@example.com", result["fields"]["email"])

    def test_recognize_attachment_supports_spaced_date_and_current_city(self):
        result = parse_basic_info("出生年月：2005 年 7 月\n现居：广东广州")

        self.assertEqual("2005-07", result["fields"]["birth_date"])
        self.assertEqual("广东广州", result["fields"]["current_city"])

    def test_recognized_values_overwrite_existing_basic_fields(self):
        profile = {"basic": {"full_name": "旧姓名", "phone": "13000000000", "email": "old@example.com"}}

        written = apply_recognized_basic(
            profile,
            {"full_name": "表单未保存姓名", "phone": "13100000000", "email": "form@example.com"},
            {"full_name": "新姓名", "phone": "13800138000"},
        )

        self.assertEqual(["full_name", "phone"], written)
        self.assertEqual("新姓名", profile["basic"]["full_name"])
        self.assertEqual("13800138000", profile["basic"]["phone"])
        self.assertEqual("form@example.com", profile["basic"]["email"])

    def test_ambiguous_values_are_not_returned_as_fields(self):
        result = parse_basic_info("手机：13800138000\n手机：13900139000")

        self.assertNotIn("phone", result["fields"])
        self.assertIn("phone", result["ambiguous"])

    def test_experience_sections_parse_multiple_records(self):
        sections = parse_experience_sections(
            """教育背景
2021.09 - 2025.06 示例大学 计算机科学与技术 本科
主修课程：数据结构、操作系统 GPA：3.8/4.0（前 10%）
工作经历
2024.01 - 2024.06 示例科技有限公司 算法实习生
负责模型训练与部署。
项目经历
2023.09 - 2024.01 智能问答系统 科研项目
主要工作：项目负责人，完成检索和重排模块。
2024.03 - 2024.08 数据平台 竞赛
项目内容：完成数据清洗和可视化。
校园经历
2022.09 - 至今 学生科技协会 技术部部长
组织技术培训。
"""
        )

        self.assertEqual("示例大学", sections["education"][0]["school"])
        self.assertEqual("本科", sections["education"][0]["degree"])
        self.assertEqual("示例科技有限公司", sections["work_experience"][0]["company"])
        self.assertEqual("算法实习生", sections["work_experience"][0]["position"])
        self.assertEqual(2, len(sections["projects"]))
        self.assertEqual("智能问答系统", sections["projects"][0]["name"])
        self.assertEqual("学生科技协会", sections["campus_experience"][0]["organization"])
        self.assertEqual("至今", sections["campus_experience"][0]["end_date"])

    def test_recognized_experience_replaces_only_detected_sections(self):
        profile = {
            "basic": {"full_name": "旧姓名"},
            "education": [{"id": "old-education", "school": "旧学校"}],
            "work_experience": [{"id": "old-work", "company": "旧公司"}],
            "projects": [{"id": "keep-project", "name": "保留项目"}],
        }

        basic, replaced = apply_recognized_profile(
            profile,
            {"full_name": "未保存姓名"},
            {
                "fields": {"full_name": "新姓名"},
                "sections": {
                    "education": [{"school": "新学校", "start_date": "2022-09", "end_date": "2026-06"}],
                    "work_experience": [
                        {"company": "新公司一", "position": "开发实习生"},
                        {"company": "新公司二", "position": "工程师"},
                    ],
                },
            },
        )

        self.assertEqual(["full_name"], basic)
        self.assertEqual({"education": 1, "work_experience": 2}, replaced)
        self.assertEqual("新姓名", profile["basic"]["full_name"])
        self.assertEqual(["新学校"], [item["school"] for item in profile["education"]])
        self.assertEqual(["新公司一", "新公司二"], [item["company"] for item in profile["work_experience"]])
        self.assertNotEqual("old-education", profile["education"][0]["id"])
        self.assertEqual("保留项目", profile["projects"][0]["name"])

    def test_all_supported_attachment_fields_are_recognized_and_overwritten(self):
        text = """姓名：张三
作品主页：https://example.com/zhangsan
专业技能
Python、SQL、Docker
证书与奖项
2023.12 国家奖学金 国家级
2024.06 大学英语六级证书
语言能力
英语 CET-6 528分 熟练
论文著作
2024.08 《面向招聘的智能匹配研究》 已发表 DOI: 10.1234/example.1
专利/软件著作权
2024.05 智能简历系统 软件著作权 登记号：2024SR123456 已登记
个人优势
擅长数据分析与跨团队沟通。
自我评价
责任心强，学习能力突出。
科研成果
完成两项文本分类研究。
"""
        sections = parse_experience_sections(text)
        long_text = parse_long_text_fields(text)

        self.assertEqual(["Python", "SQL", "Docker"], [item["name"] for item in sections["professional_skills"]])
        self.assertEqual("国家奖学金 国家级", sections["certificates_awards"][0]["name"])
        self.assertEqual("国家级", sections["certificates_awards"][0]["level"])
        self.assertEqual("CET-6", sections["language_skills"][0]["certificate"])
        self.assertEqual("528", sections["language_skills"][0]["score"])
        self.assertEqual("面向招聘的智能匹配研究", sections["publications"][0]["title"])
        self.assertEqual("10.1234/example.1", sections["publications"][0]["doi"])
        self.assertEqual("2024SR123456", sections["patents"][0]["number"])
        self.assertEqual("擅长数据分析与跨团队沟通。", long_text["personal_advantages"])
        self.assertEqual("责任心强，学习能力突出。", long_text["self_evaluation"])
        self.assertEqual("完成两项文本分类研究。", long_text["research_summary"])

        with tempfile.TemporaryDirectory() as directory:
            resume = Path(directory) / "resume.txt"
            resume.write_text(text, encoding="utf-8")
            profile = {
                "basic": {"full_name": "旧姓名"},
                "certificates_awards": [{"id": "old-award", "name": "旧奖项"}],
                "professional_skills": [{"id": "old-skill", "name": "旧技能"}],
                "projects": [{"id": "keep-project", "name": "附件中没有的项目"}],
                "personal_advantages": "旧优势",
                "self_evaluation": "旧评价",
                "research_summary": "旧科研成果",
                "custom_fields": {"作品主页": "https://old.example.com"},
            }

            recognized = recognize_attachment(resume, profile)
            basic, replaced = apply_recognized_profile(profile, {}, recognized)

        self.assertEqual(["full_name"], basic)
        self.assertEqual("张三", profile["basic"]["full_name"])
        self.assertEqual(2, replaced["certificates_awards"])
        self.assertEqual(3, replaced["professional_skills"])
        self.assertEqual("附件中没有的项目", profile["projects"][0]["name"])
        self.assertEqual("责任心强，学习能力突出。", profile["self_evaluation"])
        self.assertEqual("https://example.com/zhangsan", profile["custom_fields"]["作品主页"])

    def test_labelled_attachment_content_covers_every_profile_section(self):
        required = {
            "job_intentions": ("position", "数据分析师"),
            "education": ("school", "示例大学"),
            "work_experience": ("company", "示例科技有限公司"),
            "projects": ("name", "智能匹配平台"),
            "campus_experience": ("organization", "学生科技协会"),
            "volunteer_experience": ("organization", "青年志愿者协会"),
            "certificates_awards": ("name", "国家奖学金"),
            "language_skills": ("language", "英语"),
            "professional_skills": ("name", "Python"),
            "trainings": ("name", "数据分析训练营"),
            "publications": ("title", "智能招聘研究"),
            "patents": ("name", "智能简历系统"),
            "family_members": ("name", "张父"),
            "emergency_contacts": ("name", "李四"),
            "references": ("name", "王老师"),
        }
        lines = []
        for section, (key, value) in required.items():
            definition = SECTION_DEFINITIONS[section]
            label = dict(definition["fields"])[key]
            lines.extend((definition["label"], f"{label}：{value}"))

        sections = parse_experience_sections("\n".join(lines))

        self.assertEqual(set(required), set(sections))
        for section, (key, value) in required.items():
            self.assertEqual(value, sections[section][0][key], section)


if __name__ == "__main__":
    unittest.main()
