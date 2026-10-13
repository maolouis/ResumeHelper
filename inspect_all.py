# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app.attachment_reader import recognize_attachment
import json

result = recognize_attachment(r'F:\OneDrive\personal_file\简历\luo_mingzhi_resume_cn.pdf')
sections = result.get('sections', {})

print('=== Basic info ===')
basic = result.get('basic', {})
for k, v in basic.items():
    print(f'  {k}: {v}')

print()
print('=== Education ===')
for e in sections.get('education', []):
    print(json.dumps(e, ensure_ascii=False))

print()
print('=== Awards ===')
for a in sections.get('certificates_awards', []):
    print(json.dumps(a, ensure_ascii=False))

print()
print('=== Language ===')
for l in sections.get('language_skills', []):
    print(json.dumps(l, ensure_ascii=False))
