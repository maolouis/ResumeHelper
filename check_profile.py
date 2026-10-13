# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import json
from pathlib import Path

data_dir = Path.home() / "AppData" / "Local" / "ResumeHelper" / "data"
with open(data_dir / 'profiles.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

profile = next(p for p in data['profiles'] if p['id'] == data['active_profile_id'])
print('Profile name:', profile['name'])
print()
print('=== Education fields ===')
for e in profile.get('education', []):
    for k, v in e.items():
        if k != 'description':
            print(f'  {k}: {v}')
print()
print('=== Language skills ===')
for l in profile.get('language_skills', []):
    print(f"  {l.get('language')} / {l.get('certificate')} / score={l.get('score')} / level={l.get('level')}")
