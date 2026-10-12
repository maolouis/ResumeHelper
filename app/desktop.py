from __future__ import annotations

import os
import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk
from uuid import uuid4

from .defaults import BASIC_FIELDS, DOCUMENT_TYPES, LONG_TEXT_FIELDS, SECTION_DEFINITIONS
from .storage import DataStore
from .attachment_reader import recognize_attachment


SUPPORTED_RESUME_SUFFIXES = {".pdf", ".docx", ".txt", ".md"}


def registered_resume_path(profile: dict) -> str | None:
    for document in profile.get("documents", []):
        path = Path(document.get("path", ""))
        if document.get("type") == "resume" and path.suffix.lower() in SUPPORTED_RESUME_SUFFIXES and path.is_file():
            return str(path)
    return None


def apply_recognized_basic(profile: dict, form_values: dict, recognized: dict) -> list[str]:
    basic = profile.setdefault("basic", {})
    basic.update({key: str(value or "").strip() for key, value in form_values.items()})
    written = []
    for key, value in recognized.items():
        cleaned = str(value or "").strip()
        if cleaned:
            basic[key] = cleaned
            written.append(key)
    return written


def apply_recognized_profile(profile: dict, form_values: dict, recognized: dict) -> tuple[list[str], dict[str, int]]:
    written = apply_recognized_basic(profile, form_values, recognized.get("fields", {}))
    replaced = {}
    for section, records in recognized.get("sections", {}).items():
        if section not in SECTION_DEFINITIONS or not records:
            continue
        profile[section] = [{"id": str(uuid4()), **record} for record in records]
        replaced[section] = len(records)
    for key, value in recognized.get("long_text", {}).items():
        if key in {field_key for field_key, _label, _height in LONG_TEXT_FIELDS} and str(value).strip():
            profile[key] = str(value).strip()
    custom_fields = profile.setdefault("custom_fields", {})
    for label, value in recognized.get("custom_fields", {}).items():
        if label in custom_fields and str(value).strip():
            custom_fields[label] = str(value).strip()
    return written, replaced


class ScrollableFrame(ttk.Frame):
    def __init__(self, parent):
        super().__init__(parent)
        self.canvas = tk.Canvas(self, highlightthickness=0, background="#f5f7fa")
        scrollbar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.content = ttk.Frame(self.canvas, padding=20)
        self.content.bind("<Configure>", lambda _event: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
        self.window = self.canvas.create_window((0, 0), window=self.content, anchor="nw")
        self.canvas.bind("<Configure>", lambda event: self.canvas.itemconfigure(self.window, width=event.width))
        self.canvas.configure(yscrollcommand=scrollbar.set)
        self.canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")


class RecordDialog(tk.Toplevel):
    def __init__(self, parent, title: str, fields: list[tuple[str, str]], initial: dict | None = None):
        super().__init__(parent)
        self.title(title)
        self.geometry("660x560")
        self.minsize(540, 430)
        self.transient(parent)
        self.grab_set()
        self.result = None
        self.initial = initial or {}
        self.inputs: dict[str, tk.Widget] = {}

        outer = ttk.Frame(self, padding=20)
        outer.pack(fill="both", expand=True)
        canvas = tk.Canvas(outer, highlightthickness=0)
        scrollbar = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        form = ttk.Frame(canvas)
        form.bind("<Configure>", lambda _event: canvas.configure(scrollregion=canvas.bbox("all")))
        window = canvas.create_window((0, 0), window=form, anchor="nw")
        canvas.bind("<Configure>", lambda event: canvas.itemconfigure(window, width=event.width))
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        for row, (key, label) in enumerate(fields):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="nw", padx=(0, 12), pady=8)
            if key in {"description", "notes", "courses"}:
                widget = tk.Text(form, height=6, wrap="word", font=("Microsoft YaHei UI", 10), relief="solid", borderwidth=1)
                widget.insert("1.0", str(self.initial.get(key, "")))
            else:
                variable = tk.StringVar(value=str(self.initial.get(key, "")))
                widget = ttk.Entry(form, textvariable=variable)
                widget._resume_variable = variable  # type: ignore[attr-defined]
            widget.grid(row=row, column=1, sticky="ew", pady=8)
            self.inputs[key] = widget
        form.columnconfigure(1, weight=1)

        actions = ttk.Frame(self, padding=(20, 0, 20, 20))
        actions.pack(fill="x")
        ttk.Button(actions, text="取消", command=self.destroy).pack(side="right")
        ttk.Button(actions, text="保存", style="Accent.TButton", command=self._save).pack(side="right", padx=(0, 8))
        self.bind("<Escape>", lambda _event: self.destroy())

    def _save(self):
        result = {"id": self.initial.get("id", str(uuid4()))}
        for key, widget in self.inputs.items():
            if isinstance(widget, tk.Text):
                result[key] = widget.get("1.0", "end").strip()
            else:
                result[key] = widget._resume_variable.get().strip()  # type: ignore[attr-defined]
        self.result = result
        self.destroy()


class DocumentTypeDialog(tk.Toplevel):
    def __init__(self, parent):
        super().__init__(parent)
        self.title("选择附件用途")
        self.geometry("430x170")
        self.resizable(False, False)
        self.transient(parent)
        self.grab_set()
        self.result = None
        self.label_to_key = {label: key for key, label in DOCUMENT_TYPES.items()}
        frame = ttk.Frame(self, padding=22)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="附件用途").pack(anchor="w", pady=(0, 8))
        self.value = tk.StringVar(value=DOCUMENT_TYPES["resume"])
        ttk.Combobox(frame, textvariable=self.value, values=list(self.label_to_key), state="readonly").pack(fill="x")
        actions = ttk.Frame(frame)
        actions.pack(fill="x", pady=(18, 0))
        ttk.Button(actions, text="取消", command=self.destroy).pack(side="right")
        ttk.Button(actions, text="确定", style="Accent.TButton", command=self._save).pack(side="right", padx=(0, 8))

    def _save(self):
        self.result = self.label_to_key[self.value.get()]
        self.destroy()


class ResumeHelperApp:
    def __init__(self, root: tk.Tk, store: DataStore | None = None):
        self.root = root
        self.store = store or DataStore()
        self.state: dict = {}
        self.profile: dict = {}
        self.profile_name_to_id: dict[str, str] = {}
        self.basic_vars: dict[str, tk.StringVar] = {}
        self.long_text_widgets: dict[str, tk.Text] = {}
        self.custom_rows: list[tuple[str, str]] = []
        self.mapping_rows: list[dict] = []

        root.title("简历快填 - 本地资料管理")
        root.geometry("1180x760")
        root.minsize(960, 640)
        root.configure(background="#eef2f6")
        self._configure_styles()
        self._build_shell()
        self.refresh_all()

    def _configure_styles(self):
        style = ttk.Style(self.root)
        style.theme_use("clam")
        self.root.option_add("*Text.background", "#ffffff")
        self.root.option_add("*Text.foreground", "#1f2937")
        self.root.option_add("*Text.insertBackground", "#1f2937")
        self.root.option_add("*Text.selectBackground", "#1769aa")
        self.root.option_add("*Text.selectForeground", "#ffffff")
        self.root.option_add("*TCombobox*Listbox.background", "#ffffff")
        self.root.option_add("*TCombobox*Listbox.foreground", "#1f2937")
        style.configure("TFrame", background="#f5f7fa")
        style.configure("TLabel", background="#f5f7fa", foreground="#1f2937", font=("Microsoft YaHei UI", 10))
        style.configure("Header.TLabel", font=("Microsoft YaHei UI", 18, "bold"), foreground="#111827")
        style.configure("Subtle.TLabel", foreground="#667085", font=("Microsoft YaHei UI", 9))
        style.configure("Metric.TLabel", font=("Segoe UI", 24, "bold"), foreground="#1769aa")
        style.configure("Section.TLabel", font=("Microsoft YaHei UI", 12, "bold"), foreground="#111827")
        style.configure("TButton", font=("Microsoft YaHei UI", 9), padding=(12, 7), foreground="#1f2937", background="#e4eaf1")
        style.map("TButton", foreground=[("disabled", "#667085"), ("active", "#111827")], background=[("active", "#d4deeb")])
        style.configure("Accent.TButton", foreground="#ffffff", background="#1769aa", font=("Microsoft YaHei UI", 9, "bold"))
        style.map("Accent.TButton", foreground=[("disabled", "#ffffff"), ("active", "#ffffff")], background=[("disabled", "#475467"), ("active", "#125a92")])
        for name in ("TEntry", "TCombobox"):
            style.configure(name, foreground="#1f2937", fieldbackground="#ffffff", selectforeground="#ffffff", selectbackground="#1769aa")
            style.map(name, foreground=[("disabled", "#667085"), ("readonly", "#1f2937")], fieldbackground=[("readonly", "#ffffff")])
        style.configure("TLabelframe", background="#f5f7fa")
        style.configure("TLabelframe.Label", background="#f5f7fa", foreground="#1f2937")
        style.configure("Treeview", rowheight=30, font=("Microsoft YaHei UI", 9), foreground="#1f2937", background="#ffffff", fieldbackground="#ffffff")
        style.map("Treeview", foreground=[("selected", "#ffffff")], background=[("selected", "#1769aa")])
        style.configure("Treeview.Heading", font=("Microsoft YaHei UI", 9, "bold"), foreground="#1f2937", background="#e4eaf1")
        style.configure("TNotebook", background="#eef2f6", borderwidth=0)
        style.configure("TNotebook.Tab", font=("Microsoft YaHei UI", 10), padding=(15, 9), foreground="#344054", background="#e4eaf1")
        style.map("TNotebook.Tab", foreground=[("selected", "#111827")], background=[("selected", "#ffffff")])

    def _build_shell(self):
        header = ttk.Frame(self.root, padding=(22, 16, 22, 12))
        header.pack(fill="x")
        title_box = ttk.Frame(header)
        title_box.pack(side="left")
        ttk.Label(title_box, text="简历快填", style="Header.TLabel").pack(anchor="w")
        ttk.Label(title_box, text="资料仅保存在本机，插件不会自动提交申请", style="Subtle.TLabel").pack(anchor="w", pady=(2, 0))

        profile_box = ttk.Frame(header)
        profile_box.pack(side="right")
        ttk.Label(profile_box, text="当前档案").grid(row=0, column=0, padx=(0, 8))
        self.profile_var = tk.StringVar()
        self.profile_combo = ttk.Combobox(profile_box, textvariable=self.profile_var, state="readonly", width=25)
        self.profile_combo.grid(row=0, column=1, padx=(0, 8))
        self.profile_combo.bind("<<ComboboxSelected>>", self._on_profile_selected)
        ttk.Button(profile_box, text="新增", style="Accent.TButton", command=self._create_profile).grid(row=0, column=2, padx=3)
        self.clone_profile_button = ttk.Button(profile_box, text="复制", command=self._clone_profile)
        self.clone_profile_button.grid(row=0, column=3, padx=3)
        self.rename_profile_button = ttk.Button(profile_box, text="重命名", command=self._rename_profile)
        self.rename_profile_button.grid(row=0, column=4, padx=3)
        self.delete_profile_button = ttk.Button(profile_box, text="删除", command=self._delete_profile)
        self.delete_profile_button.grid(row=0, column=5, padx=3)

        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill="both", expand=True, padx=18, pady=(0, 10))
        self._build_overview_tab()
        self._build_basic_tab()
        self._build_experience_tab()
        self._build_content_tab()
        self._build_custom_tab()
        self._build_documents_tab()
        self._build_history_tab()
        self._build_mappings_tab()

        footer = ttk.Frame(self.root, padding=(20, 7, 20, 10))
        footer.pack(fill="x")
        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(footer, textvariable=self.status_var, style="Subtle.TLabel").pack(side="left")
        self.data_dir_var = tk.StringVar()
        ttk.Label(footer, textvariable=self.data_dir_var, style="Subtle.TLabel").pack(side="right")

    def _new_tab(self, title: str) -> ttk.Frame:
        frame = ttk.Frame(self.notebook, padding=18)
        self.notebook.add(frame, text=title)
        return frame

    def _build_overview_tab(self):
        tab = self._new_tab("概览")
        self.empty_profile_message = ttk.Label(
            tab,
            text="暂无简历档案。请点击右上角“新增”创建空白档案，或导入完整数据包。",
            style="Section.TLabel",
        )
        self.empty_profile_message.pack(fill="x", pady=(0, 14))
        top = ttk.Frame(tab)
        top.pack(fill="x")
        self.overview_metrics_frame = top
        self.metric_vars = {key: tk.StringVar(value="0") for key in ["profiles", "records", "documents", "history"]}
        for column, (key, label) in enumerate(
            [("profiles", "简历档案"), ("records", "经历记录"), ("documents", "本地附件"), ("history", "填写历史")]
        ):
            card = ttk.LabelFrame(top, text=label, padding=18)
            card.grid(row=0, column=column, sticky="nsew", padx=(0 if column == 0 else 8, 0))
            ttk.Label(card, textvariable=self.metric_vars[key], style="Metric.TLabel").pack(anchor="w")
            top.columnconfigure(column, weight=1)

        tools = ttk.LabelFrame(tab, text="本地工具", padding=18)
        tools.pack(fill="x", pady=(18, 0))
        ttk.Button(tools, text="打开数据目录", command=self._open_data_dir).pack(side="left")
        self.export_profile_button = ttk.Button(tools, text="导出当前档案为 Markdown", command=self._export_markdown)
        self.export_profile_button.pack(side="left", padx=8)
        ttk.Button(tools, text="导出完整数据包", command=self._export_package).pack(side="left")
        ttk.Button(tools, text="导入完整数据包", command=self._import_package).pack(side="left", padx=8)
        self.recognize_attachment_button = ttk.Button(tools, text="识别附件一键覆盖档案", command=self._recognize_attachment)
        self.recognize_attachment_button.pack(side="left")
        ttk.Button(tools, text="刷新全部数据", command=self.refresh_all).pack(side="left")

        guide = ttk.LabelFrame(tab, text="Edge 插件使用顺序", padding=18)
        guide.pack(fill="both", expand=True, pady=(18, 0))
        steps = (
            "1. 在 edge://extensions 打开开发人员模式并加载项目中的 extension 文件夹。\n\n"
            "2. 运行 scripts\\build.ps1，再运行 scripts\\install_native_host.ps1 注册本地主机。\n\n"
            "3. 登录招聘网站，打开职位申请表，点击 Edge 工具栏中的“简历快填”。\n\n"
            "4. 先扫描页面，再执行一键填写；核对结果后由你手动提交。"
        )
        ttk.Label(guide, text=steps, justify="left", wraplength=920).pack(anchor="nw")

    def _build_basic_tab(self):
        tab = ScrollableFrame(self.notebook)
        self.notebook.add(tab, text="基本资料")
        ttk.Label(tab.content, text="基本资料", style="Section.TLabel").grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 12))
        ttk.Button(tab.content, text="识别附件一键覆盖档案", command=self._recognize_attachment).grid(row=0, column=3, sticky="e", pady=(0, 12))
        for index, (key, label) in enumerate(BASIC_FIELDS):
            row = index // 2 + 1
            column = (index % 2) * 2
            variable = tk.StringVar()
            self.basic_vars[key] = variable
            ttk.Label(tab.content, text=label).grid(row=row, column=column, sticky="w", padx=(0, 10), pady=8)
            ttk.Entry(tab.content, textvariable=variable).grid(row=row, column=column + 1, sticky="ew", padx=(0, 24), pady=8)
        tab.content.columnconfigure(1, weight=1)
        tab.content.columnconfigure(3, weight=1)
        ttk.Button(tab.content, text="保存基本资料", style="Accent.TButton", command=self._save_basic).grid(
            row=len(BASIC_FIELDS) // 2 + 2, column=0, columnspan=4, sticky="e", pady=(18, 4)
        )

    def _build_experience_tab(self):
        tab = self._new_tab("经历资料")
        controls = ttk.Frame(tab)
        controls.pack(fill="x", pady=(0, 12))
        ttk.Label(controls, text="类别").pack(side="left")
        self.section_label_to_key = {value["label"]: key for key, value in SECTION_DEFINITIONS.items()}
        self.section_var = tk.StringVar(value=next(iter(self.section_label_to_key)))
        combo = ttk.Combobox(controls, textvariable=self.section_var, values=list(self.section_label_to_key), state="readonly", width=20)
        combo.pack(side="left", padx=(8, 14))
        combo.bind("<<ComboboxSelected>>", lambda _event: self._refresh_experience())
        ttk.Button(controls, text="新增", style="Accent.TButton", command=self._add_experience).pack(side="left")
        ttk.Button(controls, text="编辑", command=self._edit_experience).pack(side="left", padx=6)
        ttk.Button(controls, text="删除", command=self._delete_experience).pack(side="left")

        self.experience_tree = ttk.Treeview(tab, show="headings", selectmode="browse")
        self.experience_tree.pack(fill="both", expand=True)
        scrollbar = ttk.Scrollbar(self.experience_tree, orient="vertical", command=self.experience_tree.yview)
        self.experience_tree.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.experience_tree.bind("<Double-1>", lambda _event: self._edit_experience())

    def _build_content_tab(self):
        tab = ScrollableFrame(self.notebook)
        self.notebook.add(tab, text="技能与自述")
        for row, (key, label, height) in enumerate(LONG_TEXT_FIELDS):
            ttk.Label(tab.content, text=label, style="Section.TLabel").grid(row=row * 2, column=0, sticky="w", pady=(4, 6))
            widget = tk.Text(tab.content, height=height, wrap="word", font=("Microsoft YaHei UI", 10), relief="solid", borderwidth=1)
            widget.grid(row=row * 2 + 1, column=0, sticky="ew", pady=(0, 14))
            self.long_text_widgets[key] = widget
        tab.content.columnconfigure(0, weight=1)
        ttk.Button(tab.content, text="保存技能与自述", style="Accent.TButton", command=self._save_long_text).grid(
            row=len(LONG_TEXT_FIELDS) * 2, column=0, sticky="e", pady=(4, 12)
        )

    def _tree_with_actions(self, tab: ttk.Frame, columns: list[tuple[str, str, int]], actions: list[tuple[str, object]]):
        bar = ttk.Frame(tab)
        bar.pack(fill="x", pady=(0, 12))
        for index, (label, command) in enumerate(actions):
            style = "Accent.TButton" if index == 0 else "TButton"
            ttk.Button(bar, text=label, style=style, command=command).pack(side="left", padx=(0, 6))
        tree = ttk.Treeview(tab, columns=[item[0] for item in columns], show="headings", selectmode="browse")
        for key, label, width in columns:
            tree.heading(key, text=label)
            tree.column(key, width=width, minwidth=80, stretch=True)
        tree.pack(fill="both", expand=True)
        return tree

    def _build_custom_tab(self):
        tab = self._new_tab("自定义字段")
        self.custom_tree = self._tree_with_actions(
            tab,
            [("label", "字段名称", 250), ("value", "字段值", 600)],
            [("新增字段", self._add_custom), ("编辑", self._edit_custom), ("删除", self._delete_custom)],
        )
        self.custom_tree.bind("<Double-1>", lambda _event: self._edit_custom())

    def _build_documents_tab(self):
        tab = self._new_tab("附件")
        self.documents_tree = self._tree_with_actions(
            tab,
            [("name", "文件名", 220), ("type", "用途", 110), ("status", "状态", 90), ("path", "本地路径", 520)],
            [("添加附件", self._add_document), ("识别附件一键覆盖档案", self._recognize_selected_attachment), ("移除记录", self._delete_document), ("打开所在目录", self._open_document_location)],
        )

    def _build_history_tab(self):
        tab = self._new_tab("岗位历史")
        self.history_tree = self._tree_with_actions(
            tab,
            [
                ("created", "填写时间", 155),
                ("company", "公司", 150),
                ("job", "岗位", 180),
                ("status", "状态", 90),
                ("result", "结果", 120),
                ("url", "网址", 350),
            ],
            [("刷新", self._refresh_history), ("标记已投递", self._mark_submitted), ("删除记录", self._delete_history)],
        )

    def _build_mappings_tab(self):
        tab = self._new_tab("站点映射")
        self.mappings_tree = self._tree_with_actions(
            tab,
            [("host", "网站", 220), ("label", "页面字段", 240), ("canonical", "档案字段", 330)],
            [("新增映射", self._add_mapping), ("删除映射", self._delete_mapping), ("刷新", self._refresh_mappings)],
        )

    def _status(self, text: str):
        self.status_var.set(text)
        self.root.after(5000, lambda: self.status_var.set("就绪"))

    def refresh_all(self):
        try:
            self.state = self.store.get_state()
            self.profile = self.state["active_profile"] or {}
            has_profile = bool(self.profile)
            names = []
            self.profile_name_to_id.clear()
            for item in self.state["profiles"]:
                display = item["name"]
                if display in self.profile_name_to_id:
                    display = f"{display} ({item['id'][:6]})"
                names.append(display)
                self.profile_name_to_id[display] = item["id"]
            self.profile_combo["values"] = names
            current_display = next((name for name, pid in self.profile_name_to_id.items() if pid == self.profile.get("id")), "")
            self.profile_var.set(current_display)
            self.profile_combo.configure(state="readonly" if has_profile else "disabled")
            for button in (self.clone_profile_button, self.rename_profile_button, self.delete_profile_button):
                button.configure(state="normal" if has_profile else "disabled")
            for button in (self.export_profile_button, self.recognize_attachment_button):
                button.configure(state="normal" if has_profile else "disabled")
            for index in range(1, self.notebook.index("end")):
                self.notebook.tab(index, state="normal" if has_profile else "disabled")
            if has_profile:
                self.empty_profile_message.pack_forget()
            else:
                self.notebook.select(0)
                if not self.empty_profile_message.winfo_manager():
                    self.empty_profile_message.pack(fill="x", pady=(0, 14), before=self.overview_metrics_frame)
            self.data_dir_var.set(f"数据目录：{self.state['data_dir']}")
            self._load_basic()
            self._refresh_experience()
            self._load_long_text()
            self._refresh_custom()
            self._refresh_documents()
            self._refresh_history()
            self._refresh_mappings()
            records = sum(len(self.profile.get(key, [])) for key in SECTION_DEFINITIONS)
            self.metric_vars["profiles"].set(str(len(self.state["profiles"])))
            self.metric_vars["records"].set(str(records))
            self.metric_vars["documents"].set(str(len(self.profile.get("documents", []))))
            self.metric_vars["history"].set(str(len(self.store.list_history())))
            self._status("数据已刷新" if has_profile else "暂无档案，请新建或导入档案")
        except Exception as exc:
            messagebox.showerror("读取失败", str(exc), parent=self.root)

    def _on_profile_selected(self, _event=None):
        profile_id = self.profile_name_to_id.get(self.profile_var.get())
        if profile_id:
            self.store.set_active_profile(profile_id)
            self.refresh_all()

    def _create_profile(self):
        name = simpledialog.askstring("新增档案", "档案名称：", initialvalue="新简历", parent=self.root)
        if name and name.strip():
            self.store.create_profile(name.strip())
            self.refresh_all()

    def _clone_profile(self):
        if not self.profile:
            return
        name = simpledialog.askstring("复制档案", "新档案名称：", initialvalue=f"{self.profile.get('name', '简历')} - 副本", parent=self.root)
        if name and name.strip():
            self.store.create_profile(name.strip(), self.profile["id"])
            self.refresh_all()

    def _rename_profile(self):
        if not self.profile:
            return
        name = simpledialog.askstring("重命名档案", "新的档案名称：", initialvalue=self.profile.get("name", ""), parent=self.root)
        if name and name.strip():
            self.profile["name"] = name.strip()
            self.store.save_profile(self.profile)
            self.refresh_all()

    def _delete_profile(self):
        if not self.profile:
            return
        if messagebox.askyesno("删除档案", f"确定删除“{self.profile.get('name', '')}”吗？", parent=self.root):
            try:
                self.store.delete_profile(self.profile["id"])
                self.refresh_all()
            except Exception as exc:
                messagebox.showerror("无法删除", str(exc), parent=self.root)

    def _load_basic(self):
        basic = self.profile.get("basic", {})
        for key, variable in self.basic_vars.items():
            variable.set(str(basic.get(key, "")))

    def _save_basic(self):
        self.profile["basic"] = {key: variable.get().strip() for key, variable in self.basic_vars.items()}
        self.store.save_profile(self.profile)
        self._status("基本资料已保存")

    def _current_section(self) -> tuple[str, dict]:
        key = self.section_label_to_key[self.section_var.get()]
        return key, SECTION_DEFINITIONS[key]

    def _refresh_experience(self):
        key, definition = self._current_section()
        fields = definition["fields"]
        columns = [item[0] for item in fields]
        self.experience_tree.configure(columns=columns)
        for field_key, label in fields:
            self.experience_tree.heading(field_key, text=label)
            self.experience_tree.column(field_key, width=150 if field_key != "description" else 360, minwidth=90)
        self.experience_tree.delete(*self.experience_tree.get_children())
        for item in self.profile.get(key, []):
            values = [self._short(item.get(field_key, ""), 90) for field_key, _label in fields]
            self.experience_tree.insert("", "end", iid=item["id"], values=values)

    @staticmethod
    def _short(value, limit=80):
        text = str(value or "").replace("\n", " ")
        return text if len(text) <= limit else text[: limit - 1] + "…"

    def _add_experience(self):
        key, definition = self._current_section()
        dialog = RecordDialog(self.root, f"新增{definition['label']}", definition["fields"])
        self.root.wait_window(dialog)
        if dialog.result:
            self.profile.setdefault(key, []).append(dialog.result)
            self.store.save_profile(self.profile)
            self.refresh_all()

    def _selected_id(self, tree: ttk.Treeview) -> str | None:
        selection = tree.selection()
        return selection[0] if selection else None

    def _edit_experience(self):
        record_id = self._selected_id(self.experience_tree)
        if not record_id:
            self._status("请先选择一条经历")
            return
        key, definition = self._current_section()
        initial = next((item for item in self.profile.get(key, []) if item.get("id") == record_id), None)
        if not initial:
            return
        dialog = RecordDialog(self.root, f"编辑{definition['label']}", definition["fields"], initial)
        self.root.wait_window(dialog)
        if dialog.result:
            self.profile[key] = [dialog.result if item.get("id") == record_id else item for item in self.profile.get(key, [])]
            self.store.save_profile(self.profile)
            self.refresh_all()

    def _delete_experience(self):
        record_id = self._selected_id(self.experience_tree)
        if not record_id:
            return
        key, definition = self._current_section()
        if messagebox.askyesno("删除记录", f"确定删除这条{definition['label']}吗？", parent=self.root):
            self.profile[key] = [item for item in self.profile.get(key, []) if item.get("id") != record_id]
            self.store.save_profile(self.profile)
            self.refresh_all()

    def _load_long_text(self):
        for key, widget in self.long_text_widgets.items():
            widget.delete("1.0", "end")
            widget.insert("1.0", str(self.profile.get(key, "")))

    def _save_long_text(self):
        for key, widget in self.long_text_widgets.items():
            self.profile[key] = widget.get("1.0", "end").strip()
        self.store.save_profile(self.profile)
        self._status("技能与自述已保存")

    def _refresh_custom(self):
        self.custom_tree.delete(*self.custom_tree.get_children())
        self.custom_rows = list(self.profile.get("custom_fields", {}).items())
        for index, (label, value) in enumerate(self.custom_rows):
            self.custom_tree.insert("", "end", iid=str(index), values=(label, value))

    def _add_custom(self):
        label = simpledialog.askstring("新增字段", "字段名称：", parent=self.root)
        if not label or not label.strip():
            return
        value = simpledialog.askstring("新增字段", "字段值：", parent=self.root)
        if value is None:
            return
        self.profile.setdefault("custom_fields", {})[label.strip()] = value.strip()
        self.store.save_profile(self.profile)
        self.refresh_all()

    def _edit_custom(self):
        selected = self._selected_id(self.custom_tree)
        if selected is None:
            return
        old_label, old_value = self.custom_rows[int(selected)]
        label = simpledialog.askstring("编辑字段", "字段名称：", initialvalue=old_label, parent=self.root)
        if not label or not label.strip():
            return
        value = simpledialog.askstring("编辑字段", "字段值：", initialvalue=old_value, parent=self.root)
        if value is None:
            return
        self.profile.setdefault("custom_fields", {}).pop(old_label, None)
        self.profile["custom_fields"][label.strip()] = value.strip()
        self.store.save_profile(self.profile)
        self.refresh_all()

    def _delete_custom(self):
        selected = self._selected_id(self.custom_tree)
        if selected is None:
            return
        label, _value = self.custom_rows[int(selected)]
        self.profile.setdefault("custom_fields", {}).pop(label, None)
        self.store.save_profile(self.profile)
        self.refresh_all()

    def _refresh_documents(self):
        self.documents_tree.delete(*self.documents_tree.get_children())
        for item in self.profile.get("documents", []):
            exists = Path(item.get("path", "")).exists()
            type_label = DOCUMENT_TYPES.get(item.get("type", ""), item.get("type", ""))
            self.documents_tree.insert(
                "", "end", iid=item["id"], values=(item.get("name", ""), type_label, "可用" if exists else "文件缺失", item.get("path", ""))
            )

    def _add_document(self):
        path = filedialog.askopenfilename(
            title="选择简历或附件",
            filetypes=[("简历与图片", "*.pdf *.doc *.docx *.png *.jpg *.jpeg"), ("所有文件", "*.*")],
            parent=self.root,
        )
        if not path:
            return
        dialog = DocumentTypeDialog(self.root)
        self.root.wait_window(dialog)
        if not dialog.result:
            return
        self.store.add_document(self.profile["id"], path, dialog.result)
        self.refresh_all()

    def _delete_document(self):
        document_id = self._selected_id(self.documents_tree)
        if document_id and messagebox.askyesno("移除附件", "只移除附件记录，不删除本地文件。继续吗？", parent=self.root):
            self.store.delete_document(self.profile["id"], document_id)
            self.refresh_all()

    def _open_document_location(self):
        document_id = self._selected_id(self.documents_tree)
        if not document_id:
            return
        item = next((doc for doc in self.profile.get("documents", []) if doc.get("id") == document_id), None)
        if item:
            parent = Path(item["path"]).parent
            if parent.exists():
                os.startfile(parent)  # type: ignore[attr-defined]

    def _refresh_history(self):
        self.history_tree.delete(*self.history_tree.get_children())
        for item in self.store.list_history():
            result = f"填{item.get('filled', 0)} 缺{item.get('missing', 0)} 失败{item.get('failed', 0)}"
            self.history_tree.insert(
                "", "end", iid=item["id"], values=(item.get("created_at", ""), item.get("company", ""), item.get("job_title", ""), item.get("status", ""), result, item.get("url", ""))
            )

    def _mark_submitted(self):
        record_id = self._selected_id(self.history_tree)
        if record_id:
            self.store.update_history_status(record_id, "已投递")
            self.refresh_all()

    def _delete_history(self):
        record_id = self._selected_id(self.history_tree)
        if record_id and messagebox.askyesno("删除历史", "确定删除这条岗位记录吗？", parent=self.root):
            self.store.delete_history(record_id)
            self.refresh_all()

    def _refresh_mappings(self):
        self.mappings_tree.delete(*self.mappings_tree.get_children())
        self.mapping_rows = self.store.site_mappings()
        for index, item in enumerate(self.mapping_rows):
            self.mappings_tree.insert("", "end", iid=str(index), values=(item["hostname"], item["label"], item["canonical"]))

    def _add_mapping(self):
        hostname = simpledialog.askstring("新增映射", "网站域名，例如 cnnc.zhiye.com：", parent=self.root)
        if not hostname:
            return
        label = simpledialog.askstring("新增映射", "网页上显示的字段名称：", parent=self.root)
        if not label:
            return
        canonical = simpledialog.askstring("新增映射", "档案字段，例如 basic.full_name：", parent=self.root)
        if not canonical:
            return
        self.store.add_mapping(hostname.strip(), label.strip(), canonical.strip())
        self.refresh_all()

    def _delete_mapping(self):
        selected = self._selected_id(self.mappings_tree)
        if selected is None:
            return
        item = self.mapping_rows[int(selected)]
        self.store.delete_mapping(item["hostname"], item["label"])
        self.refresh_all()

    def _open_data_dir(self):
        self.store.data_dir.mkdir(parents=True, exist_ok=True)
        os.startfile(self.store.data_dir)  # type: ignore[attr-defined]

    def _export_markdown(self):
        if not self.profile:
            messagebox.showinfo("导出档案", "当前没有可导出的简历档案。", parent=self.root)
            return
        default_name = self.store.safe_filename(self.profile.get("name", "简历档案")) + ".md"
        target = filedialog.asksaveasfilename(
            title="导出 Markdown",
            defaultextension=".md",
            initialfile=default_name,
            filetypes=[("Markdown", "*.md")],
            parent=self.root,
        )
        if target:
            self.store.export_profile_markdown(self.profile["id"], target)
            self._status(f"已导出：{target}")

    def _export_package(self):
        target = filedialog.asksaveasfilename(
            title="导出完整数据包",
            defaultextension=".zip",
            initialfile="简历快填-完整数据包.zip",
            filetypes=[("ZIP 数据包", "*.zip")],
            parent=self.root,
        )
        if not target:
            return
        try:
            self.store.export_full_package(target)
            self._status(f"完整数据包已导出：{target}")
        except Exception as exc:
            messagebox.showerror("导出失败", str(exc), parent=self.root)

    def _import_package(self):
        source = filedialog.askopenfilename(
            title="导入完整数据包",
            filetypes=[("ZIP 数据包", "*.zip")],
            parent=self.root,
        )
        if not source:
            return
        if not messagebox.askyesno(
            "导入完整数据包",
            "导入会替换当前档案、字段映射和岗位历史。现有数据会先备份，是否继续？",
            parent=self.root,
        ):
            return
        try:
            result = self.store.import_full_package(source)
            self.refresh_all()
            messagebox.showinfo(
                "导入完成",
                f"已导入 {result['profiles']} 份档案和 {result['attachments']} 个附件。",
                parent=self.root,
            )
        except Exception as exc:
            messagebox.showerror("导入失败", str(exc), parent=self.root)

    def _recognize_selected_attachment(self):
        if not self.profile:
            messagebox.showinfo("识别附件", "请先新增或导入一份简历档案。", parent=self.root)
            return
        document_id = self._selected_id(self.documents_tree)
        if not document_id:
            messagebox.showinfo("识别附件", "请先选中一份简历附件。", parent=self.root)
            return
        document = self.store.get_document(self.profile["id"], document_id)
        self._recognize_attachment(document["path"])

    def _recognize_attachment(self, path=None):
        if not self.profile:
            messagebox.showinfo("识别附件", "请先新增或导入一份简历档案。", parent=self.root)
            return
        if not path:
            path = registered_resume_path(self.profile)
            if not path:
                messagebox.showinfo(
                    "识别附件",
                    "当前档案没有可读取的个人简历附件，请先在“附件”页添加 PDF、DOCX、TXT 或 Markdown 简历。",
                    parent=self.root,
                )
                return
        progress = tk.Toplevel(self.root)
        progress.title("识别附件")
        progress.transient(self.root)
        progress.grab_set()
        progress.protocol("WM_DELETE_WINDOW", lambda: None)
        ttk.Label(progress, text="正在本地读取附件…", padding=24).pack()
        bar = ttk.Progressbar(progress, mode="indeterminate", length=300)
        bar.pack(padx=24, pady=(0, 24))
        bar.start()
        results = queue.Queue()

        def read():
            try:
                results.put((recognize_attachment(path, self.profile), None))
            except Exception as exc:
                results.put((None, str(exc)))

        def check():
            try:
                result, error = results.get_nowait()
            except queue.Empty:
                self.root.after(100, check)
                return
            progress.destroy()
            if error:
                messagebox.showerror("识别失败", error, parent=self.root)
                return
            form_values = {key: var.get() for key, var in self.basic_vars.items()}
            filled, replaced = apply_recognized_profile(self.profile, form_values, result)
            try:
                self.store.save_profile(self.profile)
                self.refresh_all()
                self.notebook.select(1)
                labels = dict(BASIC_FIELDS)
                sections = "、".join(
                    f"{SECTION_DEFINITIONS[key]['label']} {count} 条" for key, count in replaced.items()
                )
                summary = f"已从附件识别并覆盖 {len(filled)} 项基本信息"
                if sections:
                    summary += f"；{sections}"
                if result.get("long_text"):
                    summary += f"；技能与自述 {len(result['long_text'])} 项"
                if result.get("custom_fields"):
                    summary += f"；自定义字段 {len(result['custom_fields'])} 项"
                if result["ambiguous"]:
                    summary += "；多个候选值未自动填入：" + "、".join(labels[key] for key in result["ambiguous"])
                self.status_var.set(summary)
            except Exception as exc:
                messagebox.showerror("保存失败", str(exc), parent=self.root)

        threading.Thread(target=read, daemon=True).start()
        self.root.after(100, check)


def main() -> int:
    root = tk.Tk()
    ResumeHelperApp(root)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

