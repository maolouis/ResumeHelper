from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from app.native_host import NativeHost
from app.storage import DataStore
from app.defaults import SCHEMA_VERSION, SECTION_DEFINITIONS


class DataStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp.name) / "data"
        self.store = DataStore(self.data_dir)

    def tearDown(self):
        self.temp.cleanup()

    def test_initial_profile_and_json_files(self):
        state = self.store.get_state()
        self.assertEqual("", state["active_profile_id"])
        self.assertIsNone(state["active_profile"])
        self.assertEqual([], state["profiles"])
        profiles_document = json.loads(self.store.profiles_path.read_text(encoding="utf-8"))
        self.assertEqual(SCHEMA_VERSION, profiles_document["schema_version"])
        self.assertTrue(self.store.profiles_path.exists())
        self.assertFalse(any(self.data_dir.glob("*.db")))
        json.loads(self.store.profiles_path.read_text(encoding="utf-8"))

    def test_custom_field_expands_profile_and_site_mapping(self):
        self.store.create_profile("测试档案")
        state = self.store.get_state()
        profile_id = state["active_profile_id"]
        result = self.store.save_custom_fields(
            profile_id,
            [{"label": "是否接受调剂", "value": "是"}],
            "cnnc.zhiye.com",
        )
        self.assertEqual("是", result["profile"]["custom_fields"]["是否接受调剂"])
        refreshed = self.store.get_state()
        self.assertEqual(
            "custom.是否接受调剂",
            refreshed["mappings"]["sites"]["cnnc.zhiye.com"]["是否接受调剂"],
        )

    def test_missing_standard_field_is_saved_to_its_profile_index(self):
        self.store.create_profile("测试档案")
        state = self.store.get_state()
        profile_id = state["active_profile_id"]
        self.store.save_form_fields(
            profile_id,
            [
                {"label": "政治面貌", "value": "共青团员", "canonical": "basic.political_status"},
                {"label": "研究方向", "value": "智能问答", "canonical": "education[].research_direction", "record_index": 0},
            ],
            "cnnc.zhiye.com",
        )
        profile = self.store.get_profile(profile_id)
        self.assertEqual("共青团员", profile["basic"]["political_status"])
        self.assertEqual("智能问答", profile["education"][0]["research_direction"])
        self.assertNotIn("政治面貌", profile["custom_fields"])

    def test_new_resume_sections_are_saved_by_canonical_index(self):
        self.store.create_profile("测试档案")
        state = self.store.get_state()
        profile_id = state["active_profile_id"]
        self.store.save_form_fields(
            profile_id,
            [
                {"label": "紧急联系人姓名", "value": "王女士", "canonical": "emergency_contacts[].name", "record_index": 0},
                {"label": "紧急联系人电话", "value": "13800000000", "canonical": "emergency_contacts[].phone", "record_index": 0},
                {"label": "兴趣爱好", "value": "羽毛球", "canonical": "hobbies"},
            ],
            "example.jobs.com",
        )
        profile = self.store.get_profile(profile_id)
        self.assertEqual("王女士", profile["emergency_contacts"][0]["name"])
        self.assertEqual("13800000000", profile["emergency_contacts"][0]["phone"])
        self.assertEqual("羽毛球", profile["hobbies"])

    def test_page_import_registers_empty_fields_without_erasing_profile(self):
        self.store.create_profile("测试档案")
        state = self.store.get_state()
        profile_id = state["active_profile_id"]
        original_name = state["active_profile"]["basic"]["full_name"]
        result = NativeHost(self.store).handle({
            "action": "save_form_fields", "profile_id": profile_id,
            "hostname": "xiaoyuan.zhipin.com", "create_missing": True,
            "fields": [
                {"label": "姓名", "canonical": "basic.full_name", "value": ""},
                {"label": "是否服从志愿调剂", "value": ""},
                {"label": "研究方向", "canonical": "education[].research_direction", "record_index": 2, "value": ""},
                {"label": "专业排名", "canonical": "education[].rank", "record_index": 2, "value": "前10%"},
                {"label": "实践描述", "canonical": "campus_experience[].description", "context": "campus_experience", "record_index": 1, "value": "手语教学"},
                {"label": "验证码", "value": "123456"},
                {"label": "Password", "value": "secret"},
                {"label": "用户协议", "value": ""},
            ],
        })
        self.assertTrue(result["ok"])
        self.assertEqual(5, len(result["saved"]))
        self.assertEqual(4, result["created"])
        self.assertEqual(2, result["values_saved"])
        profile = self.store.get_profile(profile_id)
        self.assertEqual(original_name, profile["basic"]["full_name"])
        self.assertEqual("", profile["custom_fields"]["是否服从志愿调剂"])
        self.assertEqual("", profile["education"][2]["research_direction"])
        self.assertEqual("前10%", profile["education"][2]["rank"])
        self.assertEqual("手语教学", profile["campus_experience"][1]["description"])
        self.assertNotIn("验证码", profile["custom_fields"])
        self.assertNotIn("Password", profile["custom_fields"])
        refreshed = self.store.get_state()
        self.assertEqual("custom.是否服从志愿调剂", refreshed["mappings"]["sites"]["xiaoyuan.zhipin.com"]["是否服从志愿调剂"])
        self.assertEqual("campus_experience[].description", refreshed["mappings"]["sites"]["xiaoyuan.zhipin.com"]["campus_experience::实践描述"])
        repeated = self.store.save_form_fields(profile_id, [{"label": "是否服从志愿调剂", "value": ""}], create_missing=True)
        self.assertEqual(0, repeated["created"])

    def test_profiles_history_and_markdown_crud(self):
        self.store.create_profile("基础档案")
        state = self.store.get_state()
        first_id = state["active_profile_id"]
        second = self.store.create_profile("算法岗位版", first_id)
        self.assertNotEqual(first_id, second["id"])
        record = self.store.record_application(
            {
                "profile_id": second["id"],
                "profile_name": second["name"],
                "company": "中核集团",
                "job_title": "算法工程师",
                "url": "https://cnnc.zhiye.com/form?jobAdId=test",
                "filled": 12,
                "missing": 2,
            }
        )
        self.assertEqual(1, len(self.store.list_history()))
        self.store.update_history_status(record["id"], "已投递")
        self.assertEqual("已投递", self.store.list_history()[0]["status"])
        markdown = Path(self.temp.name) / "profile.md"
        self.store.export_profile_markdown(second["id"], markdown)
        self.assertIn("算法岗位版", markdown.read_text(encoding="utf-8"))
        self.store.delete_history(record["id"])
        self.assertEqual([], self.store.list_history())
        self.store.delete_profile(second["id"])
        self.assertEqual(1, len(self.store.list_profiles()))

    def test_delete_last_profile_leaves_valid_empty_state(self):
        profile = self.store.create_profile("唯一档案")

        self.store.delete_profile(profile["id"])

        state = self.store.get_state()
        self.assertEqual([], state["profiles"])
        self.assertEqual("", state["active_profile_id"])
        self.assertIsNone(state["active_profile"])
        replacement = self.store.create_profile("重新开始")
        self.assertEqual("重新开始", replacement["name"])
        self.assertEqual("", replacement["basic"]["full_name"])

    def test_document_chunk_and_native_host(self):
        file_path = Path(self.temp.name) / "resume.pdf"
        file_path.write_bytes(b"resume-bytes")
        profile_id = self.store.create_profile("测试档案")["id"]
        document = self.store.add_document(profile_id, str(file_path), "resume")
        host = NativeHost(self.store)
        ping = host.handle({"action": "ping"})
        self.assertTrue(ping["ok"])
        response = host.handle(
            {
                "action": "read_document_chunk",
                "profile_id": profile_id,
                "document_id": document["id"],
                "offset": 0,
                "size": 5,
            }
        )
        self.assertEqual(5, response["bytes_read"])
        self.assertEqual("cmVzdW0=", response["data"])

    def test_full_package_transfers_json_history_and_attachments(self):
        profile = self.store.create_profile("测试档案")
        profile["documents"] = []
        profile["basic"]["political_status"] = "共青团员"
        self.store.save_profile(profile)
        attachment = Path(self.temp.name) / "成绩单.pdf"
        attachment.write_bytes(b"transcript-content")
        self.store.add_document(profile["id"], str(attachment), "transcript")
        self.store.record_application({"profile_id": profile["id"], "company": "测试单位", "job_title": "测试岗位"})

        package = Path(self.temp.name) / "bundle.zip"
        self.store.export_full_package(package)
        self.store.save_form_fields(profile["id"], [{"label": "政治面貌", "canonical": "basic.political_status", "value": "群众"}])

        result = self.store.import_full_package(package)
        restored = self.store.get_profile(profile["id"])
        self.assertEqual(1, result["profiles"])
        self.assertEqual(1, result["attachments"])
        self.assertEqual("共青团员", restored["basic"]["political_status"])
        restored_path = Path(restored["documents"][0]["path"])
        self.assertTrue(restored_path.is_file())
        self.assertEqual(b"transcript-content", restored_path.read_bytes())
        self.assertEqual("测试单位", self.store.list_history()[0]["company"])

if __name__ == "__main__":
    unittest.main()

