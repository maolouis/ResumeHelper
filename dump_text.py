# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from app.attachment_reader import read_attachment_text

text = read_attachment_text(r'F:\OneDrive\personal_file\简历\luo_mingzhi_resume_cn.pdf')
lines = text.splitlines()
for i, line in enumerate(lines):
    print(f'{i:3}: {line}')
