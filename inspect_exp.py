# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app.attachment_reader import recognize_attachment
import json

result = recognize_attachment(r'F:\OneDrive\personal_file\简历\luo_mingzhi_resume_cn.pdf')
sections = result.get('sections', {})

for section in ['education', 'work_experience', 'projects', 'campus_experience']:
    print(f'=== {section} ===')
    for r in sections.get(section, []):
        print(json.dumps(r, ensure_ascii=False))
    print()
