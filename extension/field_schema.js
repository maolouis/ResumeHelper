// 简历快填 —— 单一字段事实源
// 由 scripts/gen_field_schema.py 从 app/defaults.py 自动生成，请勿手改。
// canonical key 与 app/defaults.py 完全一致；name 为规范中文名；aliases 为别名（含英文）。
// 加载方式：manifest.json 的 content_scripts 中先于 content.js 注入。
(() => {
  const FIELDS = [
    // ============ 个人基本信息（basic.*） ============
    { key: "basic.full_name", name: "姓名", section: "basic", aliases: ["姓名", "名字", "真实姓名", "中文姓名", "应聘者姓名", "name", "full name"] },
    { key: "basic.english_name", name: "英文名", section: "basic", aliases: ["英文名", "英文姓名", "english name"] },
    { key: "basic.phone", name: "手机号码", section: "basic", aliases: ["手机号码", "手机", "联系电话", "移动电话", "手机号", "本人手机", "mobile", "phone"] },
    { key: "basic.backup_phone", name: "备用电话", section: "basic", aliases: ["备用电话", "其他联系电话", "第二联系电话"] },
    { key: "basic.email", name: "电子邮箱", section: "basic", aliases: ["电子邮箱", "邮箱", "常用邮箱", "电子邮件地址", "email", "e-mail"] },
    { key: "basic.gender", name: "性别", section: "basic", aliases: ["性别", "gender", "sex"] },
    { key: "basic.birth_date", name: "出生日期", section: "basic", aliases: ["出生日期", "出生年月", "生日", "birthday", "date of birth"] },
    { key: "basic.id_type", name: "证件类型", section: "basic", aliases: ["证件类型", "证件类别"] },
    { key: "basic.id_number", name: "证件号码", section: "basic", aliases: ["证件号码", "身份证号", "身份证号码", "证件号", "id number"] },
    { key: "basic.id_validity", name: "证件有效期", section: "basic", aliases: ["证件有效期", "身份证有效期"] },
    { key: "basic.political_status", name: "政治面貌", section: "basic", aliases: ["政治面貌"] },
    { key: "basic.party_join_date", name: "入党/团时间", section: "basic", aliases: ["入党/团时间", "入党时间", "入团时间", "加入党团时间"] },
    { key: "basic.nationality", name: "民族", section: "basic", aliases: ["民族"] },
    { key: "basic.nationality_country", name: "国籍", section: "basic", aliases: ["国籍", "国家", "所在国家"] },
    { key: "basic.native_place", name: "籍贯", section: "basic", aliases: ["籍贯", "生源地"] },
    { key: "basic.birth_place", name: "出生地", section: "basic", aliases: ["出生地", "出生地点"] },
    { key: "basic.household_registration", name: "户籍所在地", section: "basic", aliases: ["户籍所在地", "户口所在地", "户籍地址"] },
    { key: "basic.household_type", name: "户口性质", section: "basic", aliases: ["户口性质", "户籍性质", "农业非农业"] },
    { key: "basic.marital_status", name: "婚姻状况", section: "basic", aliases: ["婚姻状况", "婚否"] },
    { key: "basic.health_status", name: "健康状况", section: "basic", aliases: ["健康状况", "健康状态"] },
    { key: "basic.height_cm", name: "身高(cm)", section: "basic", aliases: ["身高(cm)", "身高", "身高cm"] },
    { key: "basic.weight_kg", name: "体重(kg)", section: "basic", aliases: ["体重(kg)", "体重", "体重kg"] },
    { key: "basic.current_city", name: "现居城市", section: "basic", aliases: ["现居城市", "现居地", "居住地", "当前城市"] },
    { key: "basic.address", name: "联系地址", section: "basic", aliases: ["联系地址", "通讯地址", "详细地址", "现居地址", "address"] },
    { key: "basic.postal_code", name: "邮政编码", section: "basic", aliases: ["邮政编码", "邮编"] },
    { key: "basic.wechat", name: "微信号", section: "basic", aliases: ["微信号", "微信", "wechat"] },
    { key: "basic.qq", name: "QQ", section: "basic", aliases: ["QQ", "qq", "qq号"] },
    { key: "basic.work_years", name: "工作年限", section: "basic", aliases: ["工作年限", "工作经验年限", "从业年限"] },
    { key: "basic.employment_status", name: "当前状态", section: "basic", aliases: ["当前状态", "求职状态", "在职状态"] },
    { key: "basic.available_date", name: "可到岗日期", section: "basic", aliases: ["可到岗日期", "到岗时间", "最快到岗时间"] },
    { key: "basic.preferred_city", name: "期望工作地点", section: "basic", aliases: ["期望工作地点", "意向城市", "工作地点", "期望城市"] },
    { key: "basic.preferred_position", name: "期望岗位", section: "basic", aliases: ["期望岗位", "意向职位", "求职意向", "应聘职位", "应聘岗位"] },
    { key: "basic.linkedin", name: "LinkedIn", section: "basic", aliases: ["LinkedIn", "领英", "LinkedIn Profile", "领英主页"] },
    { key: "basic.website", name: "个人网站", section: "basic", aliases: ["个人网站", "个人主页", "Portfolio", "作品链接", "Website", "个人链接"] },

    // ============ 求职意向 ============
    { key: "job_intentions[].position", name: "期望职位", section: "job_intentions", aliases: ["期望职位", "意向岗位", "目标职位"] },
    { key: "job_intentions[].city", name: "期望城市", section: "job_intentions", aliases: ["期望城市", "意向地点", "期望地点"] },
    { key: "job_intentions[].industry", name: "期望行业", section: "job_intentions", aliases: ["期望行业", "意向行业"] },
    { key: "job_intentions[].employment_type", name: "工作性质", section: "job_intentions", aliases: ["工作性质", "职位类型", "全职兼职"] },
    { key: "job_intentions[].salary", name: "期望薪资", section: "job_intentions", aliases: ["期望薪资", "期望月薪", "薪资要求"] },
    { key: "job_intentions[].available_date", name: "到岗日期", section: "job_intentions", aliases: ["到岗日期", "可到岗时间"] },
    { key: "job_intentions[].notes", name: "补充说明", section: "job_intentions", aliases: ["补充说明"] },

    // ============ 教育经历 ============
    { key: "education[].school", name: "学校", section: "education", aliases: ["学校", "学校名称", "毕业学校", "毕业院校", "院校名称", "institution", "university", "school name", "graduation school"] },
    { key: "education[].school_type", name: "院校类型", section: "education", aliases: ["院校类型", "学校类型", "是否双一流", "院校属性"] },
    { key: "education[].degree", name: "学历", section: "education", aliases: ["学历", "学历层次", "最高学历", "degree", "highest degree", "education level", "academic degree"] },
    { key: "education[].degree_name", name: "学位", section: "education", aliases: ["学位", "学位名称"] },
    { key: "education[].major", name: "专业", section: "education", aliases: ["专业", "专业名称", "所学专业"] },
    { key: "education[].major_category", name: "专业类别", section: "education", aliases: ["专业类别", "专业大类"] },
    { key: "education[].department", name: "院系", section: "education", aliases: ["院系", "学院", "所属院系"] },
    { key: "education[].study_type", name: "培养方式", section: "education", aliases: ["培养方式", "学习形式", "统招非统招"] },
    { key: "education[].start_date", name: "开始时间", section: "education", aliases: ["开始时间", "入学时间", "教育开始时间", "就读开始时间", "education start date", "start date", "from"] },
    { key: "education[].end_date", name: "结束时间", section: "education", aliases: ["结束时间", "毕业时间", "毕业日期", "毕业年月", "教育结束时间", "就读结束时间", "graduation date", "education end date", "end date", "to"] },
    { key: "education[].expected_graduation", name: "预计毕业时间", section: "education", aliases: ["预计毕业时间", "预期毕业时间"] },
    { key: "education[].gpa", name: "GPA/平均成绩", section: "education", aliases: ["GPA/平均成绩", "GPA", "平均成绩", "平均绩点", "绩点"] },
    { key: "education[].gpa_scale", name: "GPA满分", section: "education", aliases: ["GPA满分", "绩点满分"] },
    { key: "education[].rank", name: "专业排名", section: "education", aliases: ["专业排名", "班级排名", "成绩排名"] },
    { key: "education[].rank_total", name: "专业人数", section: "education", aliases: ["专业人数", "排名总人数"] },
    { key: "education[].adviser", name: "导师", section: "education", aliases: ["导师", "指导老师", "硕士导师"] },
    { key: "education[].research_direction", name: "研究方向", section: "education", aliases: ["研究方向"] },
    { key: "education[].courses", name: "主修课程", section: "education", aliases: ["主修课程", "核心课程", "课程"] },
    { key: "education[].description", name: "教育描述", section: "education", aliases: ["教育描述", "教育经历描述", "在校经历"] },

    // ============ 工作/实习经历 ============
    { key: "work_experience[].company", name: "公司/单位", section: "work_experience", aliases: ["公司/单位", "公司", "公司名称", "单位名称", "工作单位", "实习单位"] },
    { key: "work_experience[].department", name: "部门", section: "work_experience", aliases: ["部门", "所在部门", "所属部门"] },
    { key: "work_experience[].industry", name: "所属行业", section: "work_experience", aliases: ["所属行业", "公司行业", "行业"] },
    { key: "work_experience[].company_type", name: "单位性质", section: "work_experience", aliases: ["单位性质", "公司性质", "企业性质"] },
    { key: "work_experience[].position", name: "职位", section: "work_experience", aliases: ["职位", "岗位", "职位名称", "实习职位"] },
    { key: "work_experience[].employment_type", name: "工作性质", section: "work_experience", aliases: ["工作性质", "任职类型", "全职实习"] },
    { key: "work_experience[].city", name: "工作地点", section: "work_experience", aliases: ["工作地点", "任职地点", "工作城市"] },
    { key: "work_experience[].start_date", name: "开始时间", section: "work_experience", aliases: ["开始时间", "工作开始时间", "任职开始时间", "入职时间"] },
    { key: "work_experience[].end_date", name: "结束时间", section: "work_experience", aliases: ["结束时间", "工作结束时间", "任职结束时间", "离职时间"] },
    { key: "work_experience[].report_to", name: "汇报对象", section: "work_experience", aliases: ["汇报对象", "直属上级"] },
    { key: "work_experience[].reason_for_leaving", name: "离职原因", section: "work_experience", aliases: ["离职原因", "离任原因"] },
    { key: "work_experience[].description", name: "工作内容", section: "work_experience", aliases: ["工作内容", "工作描述", "职责描述", "实习内容", "工作职责"] },

    // ============ 项目经历 ============
    { key: "projects[].name", name: "项目名称", section: "projects", aliases: ["项目名称"] },
    { key: "projects[].role", name: "项目角色", section: "projects", aliases: ["项目角色", "担任角色", "项目职务"] },
    { key: "projects[].organization", name: "所属单位", section: "projects", aliases: ["所属单位", "项目单位", "所属组织"] },
    { key: "projects[].technologies", name: "技术栈/工具", section: "projects", aliases: ["技术栈/工具", "技术栈", "项目技术", "使用工具", "软件环境"] },
    { key: "projects[].start_date", name: "开始时间", section: "projects", aliases: ["开始时间", "项目开始时间"] },
    { key: "projects[].end_date", name: "结束时间", section: "projects", aliases: ["结束时间", "项目结束时间"] },
    { key: "projects[].project_url", name: "项目链接", section: "projects", aliases: ["项目链接", "项目地址", "作品链接"] },
    { key: "projects[].description", name: "项目描述", section: "projects", aliases: ["项目描述", "项目内容", "项目职责", "项目成果"] },

    // ============ 在校实践/校园经历 ============
    { key: "campus_experience[].organization", name: "实践/组织名称", section: "campus_experience", aliases: ["实践/组织名称", "实践名称", "在校实践名称", "组织名称", "社团名称", "学生组织", "学校组织"] },
    { key: "campus_experience[].role", name: "职务", section: "campus_experience", aliases: ["职务", "社团职务", "组织职务", "担任职务", "校园职务"] },
    { key: "campus_experience[].start_date", name: "开始时间", section: "campus_experience", aliases: ["开始时间", "在校实践开始时间", "社团开始时间", "校园经历开始时间"] },
    { key: "campus_experience[].end_date", name: "结束时间", section: "campus_experience", aliases: ["结束时间", "在校实践结束时间", "社团结束时间", "校园经历结束时间"] },
    { key: "campus_experience[].description", name: "实践描述", section: "campus_experience", aliases: ["实践描述", "在校实践描述", "社团经历", "校园经历", "活动描述", "学生工作内容"] },

    // ============ 社会实践/志愿经历 ============
    { key: "volunteer_experience[].organization", name: "组织/活动名称", section: "volunteer_experience", aliases: ["组织/活动名称", "实践单位", "志愿组织", "活动名称"] },
    { key: "volunteer_experience[].role", name: "角色", section: "volunteer_experience", aliases: ["角色", "实践角色", "志愿者职务"] },
    { key: "volunteer_experience[].start_date", name: "开始时间", section: "volunteer_experience", aliases: ["开始时间", "社会实践开始时间", "志愿开始时间"] },
    { key: "volunteer_experience[].end_date", name: "结束时间", section: "volunteer_experience", aliases: ["结束时间", "社会实践结束时间", "志愿结束时间"] },
    { key: "volunteer_experience[].hours", name: "服务时长", section: "volunteer_experience", aliases: ["服务时长", "志愿时长"] },
    { key: "volunteer_experience[].description", name: "经历描述", section: "volunteer_experience", aliases: ["经历描述", "社会实践内容", "志愿经历描述", "活动内容"] },

    // ============ 证书与奖项 ============
    { key: "certificates_awards[].category", name: "类别", section: "certificates_awards", aliases: ["类别", "证书奖项类别", "荣誉类别"] },
    { key: "certificates_awards[].name", name: "名称", section: "certificates_awards", aliases: ["名称", "证书名称", "奖项名称", "荣誉名称", "资格证书"] },
    { key: "certificates_awards[].issuer", name: "颁发机构", section: "certificates_awards", aliases: ["颁发机构", "发证机构", "授予单位"] },
    { key: "certificates_awards[].level", name: "获奖级别", section: "certificates_awards", aliases: ["获奖级别", "奖项级别", "奖学金级别", "级别"] },
    { key: "certificates_awards[].grade", name: "获奖等级", section: "certificates_awards", aliases: ["获奖等级", "证书等级", "奖项等级", "名次"] },
    { key: "certificates_awards[].score", name: "成绩", section: "certificates_awards", aliases: ["成绩", "证书成绩", "考试成绩"] },
    { key: "certificates_awards[].date", name: "获得时间", section: "certificates_awards", aliases: ["获得时间", "获奖时间", "发证日期"] },
    { key: "certificates_awards[].expiry_date", name: "有效期至", section: "certificates_awards", aliases: ["有效期至", "证书有效期"] },
    { key: "certificates_awards[].description", name: "说明", section: "certificates_awards", aliases: ["说明"] },

    // ============ 语言能力 ============
    { key: "language_skills[].language", name: "语种", section: "language_skills", aliases: ["语种", "外语语种", "语言"] },
    { key: "language_skills[].level", name: "掌握程度", section: "language_skills", aliases: ["掌握程度", "语言水平", "外语水平"] },
    { key: "language_skills[].certificate", name: "证书", section: "language_skills", aliases: ["证书", "语言证书", "外语证书", "英语证书"] },
    { key: "language_skills[].score", name: "成绩", section: "language_skills", aliases: ["成绩", "语言成绩", "外语成绩", "英语成绩"] },
    { key: "language_skills[].listening", name: "听力水平", section: "language_skills", aliases: ["听力水平"] },
    { key: "language_skills[].speaking", name: "口语水平", section: "language_skills", aliases: ["口语水平"] },
    { key: "language_skills[].reading", name: "阅读水平", section: "language_skills", aliases: ["阅读水平"] },
    { key: "language_skills[].writing", name: "写作水平", section: "language_skills", aliases: ["写作水平"] },

    // ============ 专业技能 ============
    { key: "professional_skills[].name", name: "技能名称", section: "professional_skills", aliases: ["技能名称", "专业技能名称", "软件名称"] },
    { key: "professional_skills[].level", name: "熟练程度", section: "professional_skills", aliases: ["熟练程度", "技能熟练度", "掌握水平"] },
    { key: "professional_skills[].years", name: "使用年限", section: "professional_skills", aliases: ["使用年限", "技能年限"] },
    { key: "professional_skills[].certificate", name: "相关证书", section: "professional_skills", aliases: ["相关证书"] },
    { key: "professional_skills[].description", name: "技能说明", section: "professional_skills", aliases: ["技能说明", "技能描述"] },

    // ============ 培训经历 ============
    { key: "trainings[].name", name: "培训名称", section: "trainings", aliases: ["培训名称", "课程名称"] },
    { key: "trainings[].provider", name: "培训机构", section: "trainings", aliases: ["培训机构", "培训单位"] },
    { key: "trainings[].start_date", name: "开始时间", section: "trainings", aliases: ["开始时间", "培训开始时间"] },
    { key: "trainings[].end_date", name: "结束时间", section: "trainings", aliases: ["结束时间", "培训结束时间"] },
    { key: "trainings[].certificate", name: "获得证书", section: "trainings", aliases: ["获得证书", "培训证书"] },
    { key: "trainings[].description", name: "培训内容", section: "trainings", aliases: ["培训内容", "培训描述"] },

    // ============ 论文/著作 ============
    { key: "publications[].title", name: "题目", section: "publications", aliases: ["题目", "论文题目", "论文名称", "著作名称"] },
    { key: "publications[].publication", name: "期刊/会议", section: "publications", aliases: ["期刊/会议", "期刊名称", "会议名称", "发表刊物"] },
    { key: "publications[].authors", name: "作者/排名", section: "publications", aliases: ["作者/排名", "论文作者", "作者排名", "署名顺序"] },
    { key: "publications[].publication_date", name: "发表时间", section: "publications", aliases: ["发表时间", "出版时间"] },
    { key: "publications[].status", name: "发表状态", section: "publications", aliases: ["发表状态", "收录状态"] },
    { key: "publications[].doi", name: "DOI/链接", section: "publications", aliases: ["DOI/链接", "DOI", "论文链接"] },
    { key: "publications[].description", name: "说明", section: "publications", aliases: ["说明"] },

    // ============ 专利/软件著作权 ============
    { key: "patents[].name", name: "名称", section: "patents", aliases: ["名称", "专利名称", "软著名称", "成果名称"] },
    { key: "patents[].number", name: "申请号/登记号", section: "patents", aliases: ["申请号/登记号", "专利号", "申请号", "登记号"] },
    { key: "patents[].type", name: "类型", section: "patents", aliases: ["类型", "专利类型", "成果类型"] },
    { key: "patents[].status", name: "状态", section: "patents", aliases: ["状态", "专利状态", "申请状态"] },
    { key: "patents[].application_date", name: "申请时间", section: "patents", aliases: ["申请时间", "专利申请日"] },
    { key: "patents[].authorization_date", name: "授权时间", section: "patents", aliases: ["授权时间", "授权公告日"] },
    { key: "patents[].description", name: "说明", section: "patents", aliases: ["说明"] },

    // ============ 家庭成员 ============
    { key: "family_members[].name", name: "姓名", section: "family_members", aliases: ["姓名", "家庭成员姓名", "家属姓名", "亲属姓名"] },
    { key: "family_members[].relationship", name: "与本人关系", section: "family_members", aliases: ["与本人关系", "家庭成员关系", "亲属关系"] },
    { key: "family_members[].birth_date", name: "出生日期", section: "family_members", aliases: ["出生日期", "家庭成员出生日期"] },
    { key: "family_members[].work_unit", name: "工作单位", section: "family_members", aliases: ["工作单位", "家属工作单位", "家庭成员单位"] },
    { key: "family_members[].position", name: "职务", section: "family_members", aliases: ["职务", "家属职务", "家庭成员职务"] },
    { key: "family_members[].phone", name: "联系电话", section: "family_members", aliases: ["联系电话", "家属联系电话", "家庭成员电话"] },

    // ============ 紧急联系人 ============
    { key: "emergency_contacts[].name", name: "姓名", section: "emergency_contacts", aliases: ["姓名", "紧急联系人姓名"] },
    { key: "emergency_contacts[].relationship", name: "与本人关系", section: "emergency_contacts", aliases: ["与本人关系", "紧急联系人关系", "与紧急联系人关系"] },
    { key: "emergency_contacts[].phone", name: "联系电话", section: "emergency_contacts", aliases: ["联系电话", "紧急联系人电话", "紧急联系电话"] },
    { key: "emergency_contacts[].email", name: "电子邮箱", section: "emergency_contacts", aliases: ["电子邮箱", "紧急联系人邮箱"] },
    { key: "emergency_contacts[].address", name: "联系地址", section: "emergency_contacts", aliases: ["联系地址", "紧急联系人地址"] },

    // ============ 证明人/推荐人 ============
    { key: "references[].name", name: "姓名", section: "references", aliases: ["姓名", "证明人姓名", "推荐人姓名"] },
    { key: "references[].relationship", name: "与本人关系", section: "references", aliases: ["与本人关系", "与证明人关系", "与推荐人关系"] },
    { key: "references[].company", name: "工作单位", section: "references", aliases: ["工作单位", "证明人单位", "推荐人单位"] },
    { key: "references[].position", name: "职务", section: "references", aliases: ["职务", "证明人职务", "推荐人职务"] },
    { key: "references[].phone", name: "联系电话", section: "references", aliases: ["联系电话", "证明人电话", "推荐人电话"] },
    { key: "references[].email", name: "电子邮箱", section: "references", aliases: ["电子邮箱", "证明人邮箱", "推荐人邮箱"] },

    // ============ 长文本字段 ============
    { key: "skills", name: "专业技能", section: "long_text", aliases: ["专业技能", "技能特长", "技能", "计算机技能", "IT技能"] },
    { key: "personal_advantages", name: "个人优势", section: "long_text", aliases: ["个人优势", "核心优势", "个人能力", "个人亮点"] },
    { key: "self_evaluation", name: "自我评价", section: "long_text", aliases: ["自我评价", "个人评价", "自我介绍", "自我描述"] },
    { key: "hobbies", name: "兴趣爱好", section: "long_text", aliases: ["兴趣爱好", "个人爱好", "特长爱好"] },
    { key: "career_plan", name: "职业规划", section: "long_text", aliases: ["职业规划", "职业目标", "发展规划"] },
    { key: "research_summary", name: "科研成果概述", section: "long_text", aliases: ["科研成果概述", "科研成果", "科研概述", "学术成果概述"] },

    // ============ 派生字段（非存储，填写时推导） ============
    { key: "basic.age", name: "年龄", section: "basic", aliases: ["年龄", "age", "周岁"] }
  ];

  globalThis.__RESUME_FIELD_SCHEMA = { version: 1, fields: FIELDS };
})();
