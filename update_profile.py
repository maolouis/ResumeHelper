# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
import uuid
from pathlib import Path
from app.attachment_reader import recognize_attachment

data_dir = Path.home() / "AppData" / "Local" / "ResumeHelper" / "data"
profiles_path = data_dir / "profiles.json"
pdf_path = r'F:\OneDrive\personal_file\简历\luo_mingzhi_resume_cn.pdf'

with open(profiles_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

active_id = data['active_profile_id']
profiles = data['profiles']
if isinstance(profiles, list):
    profile = next((p for p in profiles if p.get('id') == active_id), profiles[0])
else:
    profile = profiles[active_id]

print('Active profile:', profile.get('name'))

# 解析 PDF
result = recognize_attachment(pdf_path)

# 1. 更新 basic
basic = profile.setdefault('basic', {})
for key, value in result.get('fields', {}).items():
    if str(value).strip():
        basic[key] = str(value).strip()
print('Updated basic fields:', len(result.get('fields', {})))

# 2. 更新所有 sections
for section, records in result.get('sections', {}).items():
    if records:
        profile[section] = [{'id': str(uuid.uuid4()), **record} for record in records]
        print(f'  section {section}: {len(records)} records')

# 保存
with open(profiles_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Profile saved.')
