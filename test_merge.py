# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app.attachment_reader import read_attachment_text, _split_section_lines, _parse_skill_lines

path = r'F:\OneDrive\personal_file\简历\luo_mingzhi_resume_cn.pdf'
text = read_attachment_text(path)
sections = _split_section_lines(text)
skill_lines = sections.get('professional_skills', [])
result = _parse_skill_lines(skill_lines)
for i, s in enumerate(result):
    print(f'=== Skill {i+1} ===')
    print('name:', s.get('name', ''))
    print('desc:', s.get('description', ''))
    print()
