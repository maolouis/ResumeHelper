# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app.attachment_reader import read_attachment_text, parse_basic_info

text = read_attachment_text(r'F:\OneDrive\personal_file\简历\luo_mingzhi_resume_cn.pdf')
# 只取前4行测试
head = '\n'.join(text.splitlines()[:4])
print('=== Head text ===')
print(head)
print()
result = parse_basic_info(text)
print('=== Parsed basic info ===')
for k, v in result.items():
    print(f'  {k}: {v}')
