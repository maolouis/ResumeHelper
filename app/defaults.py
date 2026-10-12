from __future__ import annotations

from copy import deepcopy
from uuid import uuid4


SCHEMA_VERSION = 3

BASIC_FIELDS = [
    ("full_name", "姓名"),
    ("english_name", "英文名"),
    ("phone", "手机号码"),
    ("backup_phone", "备用电话"),
    ("email", "电子邮箱"),
    ("gender", "性别"),
    ("birth_date", "出生日期"),
    ("id_type", "证件类型"),
    ("id_number", "证件号码"),
    ("id_validity", "证件有效期"),
    ("political_status", "政治面貌"),
    ("party_join_date", "入党/团时间"),
    ("nationality", "民族"),
    ("nationality_country", "国籍"),
    ("native_place", "籍贯"),
    ("birth_place", "出生地"),
    ("household_registration", "户籍所在地"),
    ("household_type", "户口性质"),
    ("marital_status", "婚姻状况"),
    ("health_status", "健康状况"),
    ("height_cm", "身高(cm)"),
    ("weight_kg", "体重(kg)"),
    ("current_city", "现居城市"),
    ("address", "联系地址"),
    ("postal_code", "邮政编码"),
    ("wechat", "微信号"),
    ("qq", "QQ"),
    ("work_years", "工作年限"),
    ("employment_status", "当前状态"),
    ("available_date", "可到岗日期"),
    ("preferred_city", "期望工作地点"),
    ("preferred_position", "期望岗位"),
    ("linkedin", "LinkedIn"),
    ("website", "个人网站"),
]


SECTION_DEFINITIONS = {
    "job_intentions": {
        "label": "求职意向",
        "fields": [
            ("position", "期望职位"),
            ("city", "期望城市"),
            ("industry", "期望行业"),
            ("employment_type", "工作性质"),
            ("salary", "期望薪资"),
            ("available_date", "到岗日期"),
            ("notes", "补充说明"),
        ],
    },
    "education": {
        "label": "教育经历",
        "fields": [
            ("school", "学校"),
            ("school_type", "院校类型"),
            ("degree", "学历"),
            ("degree_name", "学位"),
            ("major", "专业"),
            ("major_category", "专业类别"),
            ("department", "院系"),
            ("study_type", "培养方式"),
            ("start_date", "开始时间"),
            ("end_date", "结束时间"),
            ("expected_graduation", "预计毕业时间"),
            ("gpa", "GPA/平均成绩"),
            ("gpa_scale", "GPA满分"),
            ("rank", "专业排名"),
            ("rank_total", "专业人数"),
            ("adviser", "导师"),
            ("research_direction", "研究方向"),
            ("courses", "主修课程"),
            ("description", "教育描述"),
        ],
    },
    "work_experience": {
        "label": "工作/实习经历",
        "fields": [
            ("company", "公司/单位"),
            ("department", "部门"),
            ("industry", "所属行业"),
            ("company_type", "单位性质"),
            ("position", "职位"),
            ("employment_type", "工作性质"),
            ("city", "工作地点"),
            ("start_date", "开始时间"),
            ("end_date", "结束时间"),
            ("report_to", "汇报对象"),
            ("reason_for_leaving", "离职原因"),
            ("description", "工作内容"),
        ],
    },
    "projects": {
        "label": "项目经历",
        "fields": [
            ("name", "项目名称"),
            ("role", "项目角色"),
            ("organization", "所属单位"),
            ("technologies", "技术栈/工具"),
            ("start_date", "开始时间"),
            ("end_date", "结束时间"),
            ("project_url", "项目链接"),
            ("description", "项目描述"),
        ],
    },
    "campus_experience": {
        "label": "在校实践/校园经历",
        "fields": [
            ("organization", "实践/组织名称"),
            ("role", "职务"),
            ("start_date", "开始时间"),
            ("end_date", "结束时间"),
            ("is_current", "至今"),
            ("description", "实践描述"),
        ],
    },
    "volunteer_experience": {
        "label": "社会实践/志愿经历",
        "fields": [
            ("organization", "组织/活动名称"),
            ("role", "角色"),
            ("start_date", "开始时间"),
            ("end_date", "结束时间"),
            ("hours", "服务时长"),
            ("description", "经历描述"),
        ],
    },
    "certificates_awards": {
        "label": "证书与奖项",
        "fields": [
            ("category", "类别"),
            ("name", "名称"),
            ("issuer", "颁发机构"),
            ("level", "等级/名次"),
            ("score", "成绩"),
            ("date", "获得时间"),
            ("expiry_date", "有效期至"),
            ("description", "说明"),
        ],
    },
    "language_skills": {
        "label": "语言能力",
        "fields": [
            ("language", "语种"),
            ("level", "掌握程度"),
            ("certificate", "证书"),
            ("score", "成绩"),
            ("listening", "听力水平"),
            ("speaking", "口语水平"),
            ("reading", "阅读水平"),
            ("writing", "写作水平"),
        ],
    },
    "professional_skills": {
        "label": "专业技能",
        "fields": [
            ("name", "技能名称"),
            ("level", "熟练程度"),
            ("years", "使用年限"),
            ("certificate", "相关证书"),
            ("description", "技能说明"),
        ],
    },
    "trainings": {
        "label": "培训经历",
        "fields": [
            ("name", "培训名称"),
            ("provider", "培训机构"),
            ("start_date", "开始时间"),
            ("end_date", "结束时间"),
            ("certificate", "获得证书"),
            ("description", "培训内容"),
        ],
    },
    "publications": {
        "label": "论文/著作",
        "fields": [
            ("title", "题目"),
            ("publication", "期刊/会议"),
            ("authors", "作者/排名"),
            ("publication_date", "发表时间"),
            ("status", "发表状态"),
            ("doi", "DOI/链接"),
            ("description", "说明"),
        ],
    },
    "patents": {
        "label": "专利/软件著作权",
        "fields": [
            ("name", "名称"),
            ("number", "申请号/登记号"),
            ("type", "类型"),
            ("status", "状态"),
            ("application_date", "申请时间"),
            ("authorization_date", "授权时间"),
            ("description", "说明"),
        ],
    },
    "family_members": {
        "label": "家庭成员",
        "fields": [
            ("name", "姓名"),
            ("relationship", "与本人关系"),
            ("birth_date", "出生日期"),
            ("work_unit", "工作单位"),
            ("position", "职务"),
            ("phone", "联系电话"),
        ],
    },
    "emergency_contacts": {
        "label": "紧急联系人",
        "fields": [
            ("name", "姓名"),
            ("relationship", "与本人关系"),
            ("phone", "联系电话"),
            ("email", "电子邮箱"),
            ("address", "联系地址"),
        ],
    },
    "references": {
        "label": "证明人/推荐人",
        "fields": [
            ("name", "姓名"),
            ("relationship", "与本人关系"),
            ("company", "工作单位"),
            ("position", "职务"),
            ("phone", "联系电话"),
            ("email", "电子邮箱"),
        ],
    },
}


LONG_TEXT_FIELDS = [
    ("skills", "专业技能", 5),
    ("personal_advantages", "个人优势", 5),
    ("self_evaluation", "自我评价", 5),
    ("hobbies", "兴趣爱好", 4),
    ("career_plan", "职业规划", 4),
    ("research_summary", "科研成果概述", 4),
]


DOCUMENT_TYPES = {
    "resume": "个人简历",
    "photo": "证件照/头像",
    "transcript": "成绩单",
    "degree_certificate": "学位证",
    "diploma": "毕业证",
    "certificate": "证书/奖项证明",
    "portfolio": "作品集",
    "cover_letter": "求职信",
    "recommendation": "推荐信",
    "other": "其他附件",
}


def _id() -> str:
    return str(uuid4())


def default_profile() -> dict:
    """Initial profile extracted from the user-provided resume."""
    basic = {key: "" for key, _label in BASIC_FIELDS}
    basic.update(
        {
            "full_name": "李艳萍",
            "phone": "13553595415",
            "email": "3176990159@qq.com",
            "qq": "3176990159",
        }
    )
    return {
        "id": _id(),
        "name": "李艳萍 - 默认简历",
        "basic": basic,
        "job_intentions": [],
        "education": [
            {
                "id": _id(),
                "school": "广东工业大学",
                "degree": "本科",
                "major": "会计学/计算机科学与技术（辅修）",
                "start_date": "2020-09",
                "end_date": "2024-06",
            },
            {
                "id": _id(),
                "school": "广东工业大学",
                "degree": "硕士",
                "major": "计算机技术",
                "start_date": "2024-09",
                "end_date": "2027-06",
                "research_direction": "机器学习、深度学习",
                "description": "基于深度学习的缺失多视图聚类；在多个公开数据集上对比SOTA算法，聚类准确率提升5%-8%。",
            },
        ],
        "work_experience": [
            {
                "id": _id(),
                "company": "广东铭太信息科技有限公司",
                "position": "数据分析实习生",
                "employment_type": "实习",
                "start_date": "2024-03",
                "end_date": "2024-06",
                "description": "运用SQL、Python和ETL平台完成财务及招投标数据脱敏、清洗、筛选、统计分析；使用企业审计BI系统完成业务数据处理、多维分析与可视化，建立财务分析指标并探索异常预警模型。",
            },
            {
                "id": _id(),
                "company": "广东省国土资源测绘院",
                "position": "人工智能算法实习生",
                "employment_type": "实习",
                "start_date": "2026-01",
                "end_date": "2026-03",
                "description": "负责地质数据库运维与数据治理；完成AI智能问答模块的本地化部署和联调；设计并实现基于Graph RAG架构的地质资料智能问答系统。",
            },
        ],
        "projects": [
            {
                "id": _id(),
                "name": "基于Graph RAG的信息智能问答平台",
                "role": "核心开发",
                "technologies": "LangChain, PostgreSQL, pgvector, Neo4j, Streamlit, Qwen, BGE-reranker",
                "start_date": "2026-01",
                "end_date": "2026-03",
                "description": "构建地质知识图谱并实现自然语言转图查询；设计向量粗排与BGE重排的双路混合检索，将有效召回率提升至85%以上；使用Streamlit完成知识图谱可视化、查询结果导出和多种对话记忆模式。",
            }
        ],
        "campus_experience": [
            {
                "id": _id(),
                "organization": "计算机学院研究生会",
                "role": "副主席",
                "start_date": "2025-06",
                "end_date": "2026-06",
                "description": "分管实践部、宣传部与秘书部，统筹志愿者招募、培训、现场调度、内容审核和文件归档。",
            },
            {
                "id": _id(),
                "organization": "校爱心社",
                "role": "手语部部长",
                "start_date": "2021-06",
                "end_date": "2022-06",
                "description": "组织每周手语教学课程，策划并参与校内手语表演及公益活动，协调教学安排与活动统筹。",
            },
        ],
        "volunteer_experience": [],
        "certificates_awards": [
            {"id": _id(), "category": "奖项", "name": "优秀学生二等奖学金", "level": "校级"},
            {"id": _id(), "category": "奖项", "name": "全国大学生商务“三创”赛校级三等奖", "level": "校级三等奖"},
            {"id": _id(), "category": "奖项", "name": "优秀研究生二等奖学金", "level": "校级"},
            {"id": _id(), "category": "奖项", "name": "全国大学生数学竞赛（经管类）", "level": "初赛二等奖"},
            {"id": _id(), "category": "奖项", "name": "统计建模大赛", "level": "省级三等奖"},
            {"id": _id(), "category": "奖项", "name": "国家励志奖学金", "level": "国家级"},
            {"id": _id(), "category": "证书", "name": "大学英语六级证书", "level": "CET-6"},
            {"id": _id(), "category": "证书", "name": "机动车驾驶证", "level": "C2"},
        ],
        "language_skills": [
            {"id": _id(), "language": "英语", "level": "大学英语六级", "certificate": "CET-6"}
        ],
        "professional_skills": [
            {"id": _id(), "name": "Python / SQL / 数据分析", "level": "熟练"},
            {"id": _id(), "name": "机器学习 / 深度学习", "level": "熟练", "description": "TensorFlow, PyTorch"},
            {"id": _id(), "name": "大模型与Agent开发", "level": "熟练", "description": "LangChain, Dify, LlamaIndex"},
            {"id": _id(), "name": "数据库与数据工程", "level": "熟练", "description": "MySQL, PostgreSQL, ETL, BI"},
            {"id": _id(), "name": "工程工具", "level": "熟练", "description": "Linux, Shell, Docker, Git"},
        ],
        "trainings": [],
        "publications": [
            {
                "id": _id(),
                "title": "缺失多视图聚类相关论文",
                "publication": "CCF C类会议",
                "status": "已接收",
                "description": "基于深度学习的缺失多视图聚类研究，在多个公开数据集上对比SOTA算法。",
            }
        ],
        "patents": [
            {
                "id": _id(),
                "name": "基于张量的缺失多视图聚类算法",
                "type": "发明专利",
                "status": "已进入初审",
            }
        ],
        "family_members": [],
        "emergency_contacts": [],
        "references": [],
        "skills": "Python, SQL, MySQL, PostgreSQL, TensorFlow, PyTorch, LangChain, Dify, LlamaIndex, Linux, Shell, Docker, Git, ETL, BI",
        "personal_advantages": "具备机器学习、深度学习、大模型与Agent开发、数据工程及复合业务背景，能够将AI技术与金融、审计、ERP等业务场景结合落地。",
        "self_evaluation": "性格开朗活泼，熟络后热忱主动，乐于交流；对未知领域保持好奇，善于深入探究问题并持续学习；待人真诚友善、耐心细致，表达清晰，具备良好的沟通协调与团队协作能力。",
        "hobbies": "",
        "career_plan": "",
        "research_summary": "缺失多视图聚类研究；CCF C类会议论文已接收；一项相关发明专利已进入初审。",
        "custom_fields": {},
        "documents": [
            {"id": _id(), "name": "李艳萍 (2).pdf", "type": "resume", "path": r"F:\李艳萍 (2).pdf", "mime_type": "application/pdf"},
            {"id": _id(), "name": "李艳萍-证件照.png", "type": "photo", "path": r"F:\李艳萍-证件照.png", "mime_type": "image/png"},
        ],
    }


def empty_profile(name: str = "新简历") -> dict:
    profile = {
        "id": _id(),
        "name": name,
        "basic": {key: "" for key, _label in BASIC_FIELDS},
        "custom_fields": {},
        "documents": [],
    }
    for section in SECTION_DEFINITIONS:
        profile[section] = []
    for key, _label, _height in LONG_TEXT_FIELDS:
        profile[key] = ""
    return profile


def initial_profiles_document() -> dict:
    return {"schema_version": SCHEMA_VERSION, "active_profile_id": "", "profiles": []}


def initial_mappings_document() -> dict:
    aliases = {
        "basic.full_name": ["姓名", "名字", "真实姓名", "中文姓名", "应聘者姓名", "name", "full name"],
        "basic.english_name": ["英文名", "英文姓名", "english name"],
        "basic.phone": ["手机", "手机号码", "联系电话", "移动电话", "手机号", "本人手机", "mobile", "phone"],
        "basic.backup_phone": ["备用电话", "其他联系电话", "第二联系电话"],
        "basic.email": ["邮箱", "电子邮箱", "常用邮箱", "电子邮件地址", "email", "e-mail"],
        "basic.gender": ["性别", "gender", "sex"],
        "basic.birth_date": ["出生日期", "出生年月", "生日", "birthday", "date of birth"],
        "basic.id_type": ["证件类型", "证件类别"],
        "basic.id_number": ["身份证号", "证件号码", "身份证号码", "证件号", "id number"],
        "basic.id_validity": ["证件有效期", "身份证有效期"],
        "basic.political_status": ["政治面貌"],
        "basic.party_join_date": ["入党时间", "入团时间", "加入党团时间"],
        "basic.nationality": ["民族"],
        "basic.nationality_country": ["国籍"],
        "basic.native_place": ["籍贯", "生源地"],
        "basic.birth_place": ["出生地", "出生地点"],
        "basic.household_registration": ["户籍所在地", "户口所在地", "户籍地址"],
        "basic.household_type": ["户口性质", "户籍性质", "农业非农业"],
        "basic.marital_status": ["婚姻状况", "婚否"],
        "basic.health_status": ["健康状况", "健康状态"],
        "basic.height_cm": ["身高", "身高cm"],
        "basic.weight_kg": ["体重", "体重kg"],
        "basic.current_city": ["现居地", "现居城市", "居住地", "当前城市"],
        "basic.address": ["联系地址", "通讯地址", "详细地址", "现居地址", "address"],
        "basic.postal_code": ["邮政编码", "邮编"],
        "basic.wechat": ["微信", "微信号", "wechat"],
        "basic.qq": ["qq", "qq号"],
        "basic.work_years": ["工作年限", "工作经验年限", "从业年限"],
        "basic.employment_status": ["当前状态", "求职状态", "在职状态"],
        "basic.available_date": ["可到岗日期", "到岗时间", "最快到岗时间"],
        "basic.preferred_city": ["期望工作地点", "意向城市", "工作地点", "期望城市", "国家", "所在国家", "Country"],
        "basic.preferred_position": ["期望岗位", "意向职位", "求职意向", "应聘职位", "应聘岗位"],
        "basic.linkedin": ["LinkedIn", "领英", "LinkedIn Profile", "领英主页"],
        "basic.website": ["个人网站", "个人主页", "Portfolio", "作品链接", "Website", "个人链接"],
        "skills": ["专业技能", "技能特长", "技能", "计算机技能", "IT技能"],
        "personal_advantages": ["个人优势", "核心优势", "个人能力", "个人亮点"],
        "self_evaluation": ["自我评价", "个人评价", "自我介绍", "自我描述"],
        "hobbies": ["兴趣爱好", "个人爱好", "特长爱好"],
        "career_plan": ["职业规划", "职业目标", "发展规划"],
        "research_summary": ["科研成果", "科研概述", "学术成果概述"],
    }

    section_aliases = {
        "job_intentions[].position": ["期望职位", "意向岗位", "目标职位"],
        "job_intentions[].city": ["期望城市", "意向地点", "期望地点"],
        "job_intentions[].industry": ["期望行业", "意向行业"],
        "job_intentions[].employment_type": ["工作性质", "职位类型", "全职兼职"],
        "job_intentions[].salary": ["期望薪资", "期望月薪", "薪资要求"],
        "job_intentions[].available_date": ["到岗日期", "可到岗时间"],
        "education[].school": ["学校", "学校名称", "毕业学校", "毕业院校", "院校名称", "institution", "university", "school name", "graduation school"],
        "education[].school_type": ["院校类型", "学校类型", "是否双一流", "院校属性"],
        "education[].degree": ["学历", "学历层次", "最高学历", "degree", "highest degree", "education level", "academic degree"],
        "education[].degree_name": ["学位", "学位名称"],
        "education[].major": ["专业", "专业名称", "所学专业"],
        "education[].major_category": ["专业类别", "专业大类"],
        "education[].department": ["院系", "学院", "所属院系"],
        "education[].study_type": ["培养方式", "学习形式", "统招非统招"],
        "education[].start_date": ["入学时间", "教育开始时间", "就读开始时间", "education start date", "start date", "from"],
        "education[].end_date": ["毕业时间", "毕业日期", "毕业年月", "教育结束时间", "就读结束时间", "graduation date", "education end date", "end date", "to"],
        "education[].expected_graduation": ["预计毕业时间", "预期毕业时间"],
        "education[].gpa": ["GPA", "平均成绩", "平均绩点", "绩点"],
        "education[].gpa_scale": ["GPA满分", "绩点满分"],
        "education[].rank": ["专业排名", "班级排名", "成绩排名"],
        "education[].rank_total": ["专业人数", "排名总人数"],
        "education[].adviser": ["导师", "指导老师", "硕士导师"],
        "education[].research_direction": ["研究方向"],
        "education[].courses": ["主修课程", "核心课程", "课程"],
        "education[].description": ["教育经历描述", "在校经历", "教育描述"],
        "work_experience[].company": ["公司", "公司名称", "单位名称", "工作单位", "实习单位"],
        "work_experience[].department": ["部门", "所在部门", "所属部门"],
        "work_experience[].industry": ["所属行业", "公司行业", "行业"],
        "work_experience[].company_type": ["单位性质", "公司性质", "企业性质"],
        "work_experience[].position": ["职位", "岗位", "职位名称", "实习职位"],
        "work_experience[].employment_type": ["工作性质", "任职类型", "全职实习"],
        "work_experience[].city": ["工作地点", "任职地点", "工作城市"],
        "work_experience[].start_date": ["工作开始时间", "任职开始时间", "入职时间"],
        "work_experience[].end_date": ["工作结束时间", "任职结束时间", "离职时间"],
        "work_experience[].report_to": ["汇报对象", "直属上级"],
        "work_experience[].reason_for_leaving": ["离职原因", "离任原因"],
        "work_experience[].description": ["工作内容", "工作描述", "职责描述", "实习内容", "工作职责"],
        "projects[].name": ["项目名称"],
        "projects[].role": ["项目角色", "担任角色", "项目职务"],
        "projects[].organization": ["项目单位", "所属单位", "所属组织"],
        "projects[].technologies": ["技术栈", "项目技术", "使用工具", "软件环境"],
        "projects[].start_date": ["项目开始时间"],
        "projects[].end_date": ["项目结束时间"],
        "projects[].project_url": ["项目链接", "项目地址", "作品链接"],
        "projects[].description": ["项目描述", "项目内容", "项目职责", "项目成果"],
        "campus_experience[].organization": ["实践名称", "在校实践名称", "组织名称", "社团名称", "学生组织", "学校组织"],
        "campus_experience[].role": ["社团职务", "组织职务", "担任职务", "校园职务"],
        "campus_experience[].start_date": ["在校实践开始时间", "社团开始时间", "校园经历开始时间"],
        "campus_experience[].end_date": ["在校实践结束时间", "社团结束时间", "校园经历结束时间"],
        "campus_experience[].is_current": ["在校实践至今", "是否仍在", "至今"],
        "campus_experience[].description": ["实践描述", "在校实践描述", "社团经历", "校园经历", "活动描述", "学生工作内容"],
        "volunteer_experience[].organization": ["实践单位", "志愿组织", "活动名称"],
        "volunteer_experience[].role": ["实践角色", "志愿者职务"],
        "volunteer_experience[].hours": ["志愿时长", "服务时长"],
        "volunteer_experience[].description": ["社会实践内容", "志愿经历描述", "活动内容"],
        "certificates_awards[].category": ["证书奖项类别", "荣誉类别"],
        "certificates_awards[].name": ["证书名称", "奖项名称", "荣誉名称", "资格证书"],
        "certificates_awards[].issuer": ["颁发机构", "发证机构", "授予单位"],
        "certificates_awards[].level": ["证书等级", "奖项级别", "获奖等级", "名次"],
        "certificates_awards[].score": ["证书成绩", "考试成绩"],
        "certificates_awards[].date": ["获奖时间", "获得时间", "发证日期"],
        "certificates_awards[].expiry_date": ["证书有效期", "有效期至"],
        "language_skills[].language": ["语种", "外语语种", "语言"],
        "language_skills[].level": ["语言水平", "掌握程度", "外语水平"],
        "language_skills[].certificate": ["语言证书", "外语证书", "英语证书"],
        "language_skills[].score": ["语言成绩", "外语成绩", "英语成绩"],
        "professional_skills[].name": ["技能名称", "专业技能名称", "软件名称"],
        "professional_skills[].level": ["技能熟练度", "熟练程度", "掌握水平"],
        "professional_skills[].years": ["技能年限", "使用年限"],
        "professional_skills[].description": ["技能说明", "技能描述"],
        "trainings[].name": ["培训名称", "课程名称"],
        "trainings[].provider": ["培训机构", "培训单位"],
        "trainings[].certificate": ["培训证书", "获得证书"],
        "trainings[].description": ["培训内容", "培训描述"],
        "publications[].title": ["论文题目", "论文名称", "著作名称"],
        "publications[].publication": ["期刊名称", "会议名称", "发表刊物"],
        "publications[].authors": ["论文作者", "作者排名", "署名顺序"],
        "publications[].publication_date": ["发表时间", "出版时间"],
        "publications[].status": ["发表状态", "收录状态"],
        "publications[].doi": ["DOI", "论文链接"],
        "patents[].name": ["专利名称", "软著名称", "成果名称"],
        "patents[].number": ["专利号", "申请号", "登记号"],
        "patents[].type": ["专利类型", "成果类型"],
        "patents[].status": ["专利状态", "申请状态"],
        "patents[].application_date": ["申请时间", "专利申请日"],
        "patents[].authorization_date": ["授权时间", "授权公告日"],
        "family_members[].name": ["家庭成员姓名", "家属姓名", "亲属姓名"],
        "family_members[].relationship": ["家庭成员关系", "亲属关系", "与本人关系"],
        "family_members[].work_unit": ["家属工作单位", "家庭成员单位"],
        "family_members[].position": ["家属职务", "家庭成员职务"],
        "family_members[].phone": ["家属联系电话", "家庭成员电话"],
        "emergency_contacts[].name": ["紧急联系人姓名"],
        "emergency_contacts[].relationship": ["紧急联系人关系", "与紧急联系人关系"],
        "emergency_contacts[].phone": ["紧急联系人电话", "紧急联系电话"],
        "emergency_contacts[].email": ["紧急联系人邮箱"],
        "references[].name": ["证明人姓名", "推荐人姓名"],
        "references[].relationship": ["与证明人关系", "与推荐人关系"],
        "references[].company": ["证明人单位", "推荐人单位"],
        "references[].position": ["证明人职务", "推荐人职务"],
        "references[].phone": ["证明人电话", "推荐人电话"],
        "references[].email": ["证明人邮箱", "推荐人邮箱"],
    }
    aliases.update(section_aliases)

    for section, definition in SECTION_DEFINITIONS.items():
        for key, label in definition["fields"]:
            aliases.setdefault(f"{section}[].{key}", []).append(label)

    return {"schema_version": SCHEMA_VERSION, "global": aliases, "sites": {}}


def clone_profile(profile: dict, name: str) -> dict:
    result = deepcopy(profile)
    result["id"] = _id()
    result["name"] = name
    for section in SECTION_DEFINITIONS:
        for record in result.get(section, []):
            record["id"] = _id()
    for document in result.get("documents", []):
        document["id"] = _id()
    return result
