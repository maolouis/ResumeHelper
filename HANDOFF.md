# 简历快填项目交接

更新时间：2026-10-12

## 当前状态

当前源码版本为 `0.4.5`，桌面程序、Native Messaging Host、Edge 扩展和测试代码均位于本目录。项目不是 Git 仓库，没有可用的提交历史或分支信息。

本轮修改已经在本机源码环境中验证通过。按需求没有重新构建安装程序，因此 `release\ResumeHelperSetup.exe` 和已有 `dist` 产物不能视为包含本轮全部网页识别改动。继续本机调试时应加载项目内的 `extension` 目录。

程序不会自动提交招聘申请。真实网站验证只使用虚构数据填写页面 DOM，没有上传附件，也没有点击提交。

## 已完成功能

- 删除了复位入口，增加“识别附件一键覆盖档案”。识别时直接使用当前档案已登记的简历附件，不要求重复选择文件。
- 附件识别会尝试覆盖所有明确识别出的档案栏目，包括基本信息、求职意向、教育、工作、项目、校园、志愿经历、证书奖项、语言、专业技能、培训、论文、专利/软著及长文本字段。
- 仅覆盖附件中确实识别到的栏目；附件没有出现的经历栏目保留原值。
- 支持删除档案，包括删除最后一份档案；桌面程序和插件能处理完全没有档案的状态。
- 修复桌面程序和插件侧栏中浅色背景上的白色文字问题。
- 字段识别综合使用 `label/for`、ARIA、placeholder、控件容器、栏目上下文和技术属性。
- 增加学校、最高学历、毕业时间、性别的高置信度规则，并优先使用最高学历教育记录。
- 支持原生控件及 Arco、Semi、Ant Design、Element、iView、ARIA、React Select 等常见自定义控件。
- 支持 `YYYY-MM`、`MM/YYYY`、中文年月和英文月份；支持 Greenhouse 将起止日期拆成月、年控件的结构。
- 写入后会回读页面值。页面没有保留目标值时，本次填写记为失败并展示原因。
- 分类器置信度阈值为 `0.7`。低于阈值的字段不会填写，并在插件结果中显示“低置信度，已跳过”。
- 普通 DOM 事件无法驱动受控组件时，后台通过 `chrome.debugger` 发送可信鼠标和键盘事件。该权限可能让 Edge 短暂显示扩展调试提示，属于预期行为。
- Native Host 名称为 `cn.resumehelper.native`，固定扩展 ID 为 `fniljchgjfbfaegpaogbddffaiadgcpo`。

## 关键文件

- `extension/content.js`：页面扫描、字段分类、重复经历定位、控件填写、回读验证和低置信度处理。
- `extension/service_worker.js`：Native Host 通信、页面调度和 `chrome.debugger` 可信输入回退。
- `extension/manifest.json`：扩展 `0.4.5` 配置；当前包含 `debugger` 权限。
- `extension/sidepanel.js`、`extension/sidepanel.css`：插件操作界面、结果提示和可读性样式。
- `app/attachment_reader.py`：PDF、DOCX、TXT、Markdown 简历文字提取及全部档案栏目的解析。
- `app/desktop.py`：桌面界面、附件覆盖、档案删除和空状态。
- `app/defaults.py`：档案结构、字段别名和默认映射。
- `app/native_host.py`：Native Messaging 请求处理。
- `tests/test_live_recruitment_sites.js`：SHEIN/Greenhouse 公开申请表的联网填写回归，不提交申请。
- `tests/test_recruitment_variants.js`：学校、最高学历、毕业时间、性别及拆分年月的离线变体测试。

## 本机连接状态

Edge 和 Chrome 的当前用户注册表均已注册：

```text
HKCU\Software\Microsoft\Edge\NativeMessagingHosts\cn.resumehelper.native
HKCU\Software\Google\Chrome\NativeMessagingHosts\cn.resumehelper.native
```

两项均指向：

```text
%LOCALAPPDATA%\ResumeHelper\native-host\cn.resumehelper.native.json
```

本机已验证 Host 可执行文件能够响应 `ping` 和 `get_state`，Edge 隔离实例也能从源码扩展成功连接 Host。若常用 Edge 仍运行旧后台脚本，需要进入 `edge://extensions`，对“简历快填 - 本地版”点击一次“重新加载”。

## 已执行验证

以下检查在 2026-10-12 通过：

```powershell
node --check extension\content.js
node --check extension\service_worker.js
node --check tests\test_live_recruitment_sites.js
npm test
py -m unittest discover -s tests -v
npm run test:live
node tests\test_native_host_exe.js "$env:LOCALAPPDATA\ResumeHelper\bin\ResumeHelperHost.exe"
node tests\test_edge_native_messaging.js
Get-Content -Raw extension\manifest.json | ConvertFrom-Json | Out-Null
```

结果：

- JavaScript matcher、DOM 和招聘字段变体测试全部通过。
- Python 共 19 项测试通过，包括附件全字段覆盖、经历替换、空档案和删除最后档案。
- SHEIN 中国企业公开 Greenhouse 表单验证通过：学校、学历、起始月/年、结束月/年共 6 个教育控件全部填写并回读成功。
- Native Host EXE 集成测试通过，版本为 `0.4.5`。
- Edge 源码扩展到 Native Host 的端到端通信通过。

## 中国企业招聘网站验证

- SHEIN：公开 Greenhouse 申请表可匿名访问，已完成实际填写和回读验证；未提交。
- PingCAP：公开 Greenhouse 职位页可匿名访问，读取到 26 个表单控件，包括学校、学历和拆分起止年月。当前抽取到的公开职位为日文页面，本轮只做结构检查。
- 极飞科技：北森申请表在匿名会话中跳转微信登录页，无法在不使用账号的情况下测试实际表单。
- 字节跳动、广晟控股等国内站点的申请入口也存在登录或扫码门槛。不要为通过测试自动操作用户登录、验证码或提交按钮。

## 运行方式

安装 Python 依赖和 Node 测试依赖：

```powershell
py -m pip install -r requirements.txt
npm install
```

从源码启动桌面程序：

```powershell
py run_app.py
```

开发环境 Native Host 注册流程：

```powershell
.\scripts\build.ps1
.\scripts\install_native_host.ps1
```

然后在 `edge://extensions` 中启用开发人员模式，加载本项目的 `extension` 文件夹。修改扩展源码后需要在该页面重新加载扩展。

## 已知限制

- 扫描版 PDF 没有文字层时不能直接识别，目前没有集成 OCR。
- 封闭 Shadow DOM、Canvas 控件、跨域 iframe 或网站临时改版仍可能导致字段不可见。
- 需要登录、扫码或验证码的网站只能由用户完成身份验证后再测试。
- 可信输入依赖 Chromium `debugger` 权限；当其他调试器已附加同一标签页时可能失败。
- 联网测试依赖目标职位仍公开以及网络稳定。SHEIN 测试偶尔可能在页面加载阶段超时，单独重跑可区分网络问题和字段回归。
- 分类器目前是规则、别名、上下文和相似度组合，没有训练独立机器学习模型。现有低置信度保护应保留；收集足够匿名标注样本后再评估最小模型。

## 后续工作建议

1. 收集不同国内 ATS 的匿名 DOM 结构和人工确认结果，重点覆盖北森、Moka、牛客、用友和企业自建系统。
2. 将“字段候选、最终映射、是否被用户纠正”保存为本地匿名训练样本，再决定是否训练小型分类器。
3. 增加日文或其他语言别名前，应先确认产品实际使用范围，避免扩大误匹配面。
4. 准备跨电脑交付时运行 `scripts\build_installer.ps1`，再在一台未安装过本程序的 Windows 电脑上验证安装、扩展加载、Native Host、卸载和数据保留。
5. 发布新安装包前再次运行本文件“已执行验证”中的全部命令。
