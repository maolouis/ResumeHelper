# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
from pathlib import Path

data_dir = Path.home() / "AppData" / "Local" / "ResumeHelper" / "data"
profiles_path = data_dir / 'profiles.json'
with open(profiles_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

profile = next(p for p in data['profiles'] if p['id'] == data['active_profile_id'])

for e in profile.get('education', []):
    # 移除错误的 degree_title
    if 'degree_title' in e:
        del e['degree_title']
    if not e.get('degree_name') and e.get('degree') == '本科':
        e['degree_name'] = '学士学位'
        print('Set degree_name=学士学位')
    print('Final education fields:', list(e.keys()))

with open(profiles_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Saved.')
