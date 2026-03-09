🌐 简体中文 | [繁體中文](README.zh-TW.md) | [English](../README.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [日本語](README.ja.md)

<p align="center">
  <img src="logo.png" alt="AIVectorMemory Logo" width="200">
</p>

<p align="center">
  <img src="image.png" alt="AI Vector Memory Architecture" width="100%">
</p>
<h1 align="center">AIVectorMemory</h1>
<p align="center">
  <strong>给 AI 编程助手装上记忆 — 跨会话持久化记忆 MCP Server</strong>
</p>
<p align="center">
  <a href="https://pypi.org/project/aivectormemory/"><img src="https://img.shields.io/pypi/v/aivectormemory?color=blue&label=PyPI" alt="PyPI"></a>
  <a href="https://pypi.org/project/aivectormemory/"><img src="https://img.shields.io/pypi/pyversions/aivectormemory" alt="Python"></a>
  <a href="https://github.com/Edlineas/aivectormemory/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache_2.0-green" alt="License"></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP"></a>
</p>

---

> **你还在用 CLAUDE.md / MEMORY.md 当记忆？** 这类 Markdown 文件记忆模式有致命缺陷：文件越写越大，每次会话全量注入吃掉大量 Token；内容只能关键词匹配，搜"数据库超时"找不到"MySQL 连接池踩坑"；多项目共用一个文件互相污染；没有任务追踪，开发进度全靠人脑记；更别提 200 行截断、手动维护、无法去重合并这些日常痛点了。
>
> **AIVectorMemory 是完全不同的方案。** 本地向量数据库存储，语义搜索精准召回（用词不同也能匹配），按需检索只加载相关记忆（Token 消耗直降 50%+），多项目自动隔离互不干扰，内置问题追踪 + 任务管理让 AI 全自动管理开发流程。所有数据永久保存在你的电脑上，零云依赖，换会话、换 IDE 都不丢。

## ✨ 核心特性


| 特性 | 说明 |
|------|------|
| 🧠 **跨会话记忆** | 踩过的坑、做过的决策、定下的规范，换个会话照样记得，AI 终于不再失忆 |
| 🔍 **语义搜索** | 向量相似度匹配，搜"数据库超时"就能找到"MySQL 连接池踩坑"，用词不同也能精准召回 |
| 💰 **省 50%+ Token** | 语义检索按需召回，告别每次对话复制粘贴项目背景的全量上下文注入 |
| 🔗 **任务驱动开发** | 问题追踪 → 任务拆分 → 状态同步 → 联动归档，AI 全自动管理完整开发流程 |
| 📊 **桌面端 + Web 看板** | 原生桌面应用（macOS/Windows/Linux）+ Web 看板，可视化管理记忆和任务，3D 向量网络一眼看清知识关联 |
| 🏠 **完全本地** | 零依赖云服务，ONNX 本地推理，无需 API Key，数据不出你的电脑 |
| 🔌 **全 IDE 通吃** | Cursor / Kiro / Claude Code / Windsurf / VSCode / OpenCode / Trae — 一键安装，开箱即用 |
| 📁 **多项目隔离** | 一个 DB 管所有项目，自动隔离互不干扰，切换项目无感知 |
| 🔄 **智能去重** | 相似度 > 0.95 自动合并更新，记忆库永远干净，不会越用越乱 |
| 🌐 **7 语言支持** | 简体中文 / 繁體中文 / English / Español / Deutsch / Français / 日本語，看板 + Steering 全栈国际化 |

<p align="center">
  QQ群：1085682431 &nbsp;|&nbsp; 微信：changhuibiz<br>
  共同参与项目开发加QQ群或微信交流
</p>
<p align="center">
  <img src="003.png" alt="登录界面" width="100%">
  <br>
  <em>登录界面</em>
</p>

<p align="center">
  <img src="001.png" alt="项目选择" width="100%">
  <br>
  <em>项目选择</em>
</p>

<p align="center">
  <img src="002.png" alt="统计概览 & 向量网络可视化" width="100%">
  <br>
  <em>统计概览 & 向量网络可视化</em>
</p>

## 🏗️ 架构

```
┌─────────────────────────────────────────────────┐
│                   AI IDE                         │
│  OpenCode / Claude Code / Cursor / Kiro / ...   │
└──────────────────────┬──────────────────────────┘
                       │ MCP Protocol (stdio)
┌──────────────────────▼──────────────────────────┐
│              AIVectorMemory Server                    │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ remember │ │  recall   │ │   auto_save      │ │
│  │ forget   │ │  task     │ │   status/track   │ │
│  └────┬─────┘ └────┬─────┘ └───────┬──────────┘ │
│       │            │               │             │
│  ┌────▼────────────▼───────────────▼──────────┐  │
│  │         Embedding Engine (ONNX)            │  │
│  │      intfloat/multilingual-e5-small        │  │
│  └────────────────────┬───────────────────────┘  │
│                       │                          │
│  ┌────────────────────▼───────────────────────┐  │
│  │     SQLite + sqlite-vec (向量索引)          │  │
│  │     ~/.aivectormemory/memory.db                 │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## 🧭 开发文档

- [开发架构说明](ARCHITECTURE.zh-CN.md)
- [macOS Intel 安装包构建与更新安装](MACOS-INTEL-BUILD.zh-CN.md)

## 🚀 快速开始

### 方式一：pip 安装（推荐）

```bash
# 安装
pip install aivectormemory

# 升级到最新版
pip install --upgrade aivectormemory

# 进入你的项目目录，一键配置 IDE
cd /path/to/your/project
run install
```

`run install` 会交互式引导你选择 IDE，自动生成 MCP 配置、Steering 规则和 Hooks，无需手动编写。

> **macOS 用户注意**：
> - 遇到 `externally-managed-environment` 错误，加 `--break-system-packages`
> - 遇到 `enable_load_extension` 错误，说明当前 Python 不支持 SQLite 扩展加载（macOS 自带 Python 和 python.org 官方安装包均不支持），请改用 Homebrew Python：
>   ```bash
>   brew install python
>   /opt/homebrew/bin/python3 -m pip install aivectormemory
>   ```

### 方式二：uvx 运行（零安装）

无需 `pip install`，直接运行：

```bash
cd /path/to/your/project
uvx aivectormemory install
```

> 需要先安装 [uv](https://docs.astral.sh/uv/getting-started/installation/)，`uvx` 会自动下载并运行，无需手动安装包。

### 方式三：手动配置

```json
{
  "mcpServers": {
    "aivectormemory": {
      "command": "run",
      "args": ["--project-dir", "/path/to/your/project"]
    }
  }
}
```

<details>
<summary>📍 各 IDE 配置文件位置</summary>

| IDE | 配置文件路径 |
|-----|------------|
| Kiro | `.kiro/settings/mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Claude Code | `.mcp.json` |
| Windsurf | `.windsurf/mcp.json` |
| VSCode | `.vscode/mcp.json` |
| Trae | `.trae/mcp.json` |
| OpenCode | `opencode.json` |

</details>

## 🛠️ 8 个 MCP 工具

### `remember` — 存入记忆

```
content (string, 必填)   记忆内容，Markdown 格式
tags    (string[], 必填)  标签，如 ["踩坑", "python"]
scope   (string)          "project"（默认）/ "user"（跨项目）
```

相似度 > 0.95 自动更新已有记忆，不重复存储。

### `recall` — 语义搜索

```
query   (string)     语义搜索关键词
tags    (string[])   标签精确过滤
scope   (string)     "project" / "user" / "all"
top_k   (integer)    返回数量，默认 5
```

向量相似度匹配，用词不同也能找到相关记忆。

### `forget` — 删除记忆

```
memory_id  (string)     单个 ID
memory_ids (string[])   批量 ID
```

### `status` — 会话状态

```
state (object, 可选)   不传=读取，传=更新
  is_blocked, block_reason, current_task,
  next_step, progress[], recent_changes[], pending[]
```

跨会话保持工作进度，新会话自动恢复上下文。

### `track` — 问题跟踪

```
action   (string)   "create" / "update" / "archive" / "list"
title    (string)   问题标题
issue_id (integer)  问题 ID
status   (string)   "pending" / "in_progress" / "completed"
content  (string)   排查内容
```

### `task` — 任务管理

```
action     (string, 必填)  "batch_create" / "update" / "list" / "delete" / "archive"
feature_id (string)        关联功能标识（list 时必填）
tasks      (array)         任务列表（batch_create，支持子任务）
task_id    (integer)       任务 ID（update）
status     (string)        "pending" / "in_progress" / "completed" / "skipped"
```

通过 feature_id 关联 spec 文档，update 自动同步 tasks.md checkbox 并联动问题状态。

### `readme` — README 生成

```
action   (string)    "generate"（默认）/ "diff"（差异对比）
lang     (string)    语言：en / zh-TW / ja / de / fr / es
sections (string[])  指定章节：header / tools / deps
```

从 TOOL_DEFINITIONS / pyproject.toml 自动生成 README 内容，支持多语言。

### `auto_save` — 自动保存偏好

```
preferences  (string[])  用户表达的技术偏好（固定 scope=user，跨项目通用）
extra_tags   (string[])  额外标签
```

每次对话结束自动提取并存储用户偏好，智能去重。

## 📊 Web 看板

```bash
run web --port 9080
run web --port 9080 --quiet          # 屏蔽请求日志
run web --port 9080 --quiet --daemon  # 后台运行（macOS/Linux）
```

浏览器访问 `http://localhost:9080`，默认用户名 `admin`，密码 `admin123`（首次登录后可在设置中修改）。

- 多项目切换，记忆浏览/搜索/编辑/删除/导出/导入
- 语义搜索（向量相似度匹配）
- 项目数据一键删除
- 会话状态、问题追踪
- 标签管理（重命名、合并、批量删除）
- Token 认证保护
- 3D 向量记忆网络可视化
- 🌐 多语言支持（简体中文 / 繁體中文 / English / Español / Deutsch / Français / 日本語）

<p align="center">
  <img src="20260306234753_6_1635.jpg" alt="微信群" width="280">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="8_1635.jpg" alt="QQ群：1085682431" width="280">
  <br>
  <em>微信扫码加群 &nbsp;|&nbsp; QQ扫码加群</em>
</p>

## ⚡ 配合 Steering 规则

AIVectorMemory 是存储层，通过 Steering 规则告诉 AI **何时、如何**调用这些工具。

运行 `run install` 会自动生成 Steering 规则和 Hooks 配置，无需手动编写。

| IDE | Steering 位置 | Hooks |
|-----|--------------|-------|
| Kiro | `.kiro/steering/aivectormemory.md` | `.kiro/hooks/*.hook` |
| Cursor | `.cursor/rules/aivectormemory.md` | `.cursor/hooks.json` |
| Claude Code | `CLAUDE.md`（追加） | `.claude/settings.json` |
| Windsurf | `.windsurf/rules/aivectormemory.md` | `.windsurf/hooks.json` |
| VSCode | `.github/copilot-instructions.md`（追加） | `.claude/settings.json` |
| Trae | `.trae/rules/aivectormemory.md` | — |
| OpenCode | `AGENTS.md`（追加） | `.opencode/plugins/*.js` |

<details>
<summary>📋 Steering 规则范例（自动生成）</summary>

```markdown
# AIVectorMemory - 工作规则

## 1. 新会话启动（必须按顺序执行）

1. `recall`（tags: ["项目知识"], scope: "project", top_k: 100）加载项目知识
2. `recall`（tags: ["preference"], scope: "user", top_k: 20）加载用户偏好
3. `status`（不传 state）读取会话状态
4. 有阻塞 → 汇报并等待；无阻塞 → 进入处理流程

## 2. 收到消息后的处理流程

- 步骤 A：`status` 读取状态，有阻塞则等待
- 步骤 B：判断消息类型（闲聊/纠正/偏好/代码问题）
- 步骤 C：`track create` 记录问题
- 步骤 D：排查（`recall` 查踩坑 + 查看代码 + 找根因）
- 步骤 E：向用户说明方案，设阻塞等确认
- 步骤 F：修改代码（修改前 `recall` 查踩坑）
- 步骤 G：运行测试验证
- 步骤 H：设阻塞等待用户验证
- 步骤 I：用户确认 → `track archive` + 清阻塞

## 3. 阻塞规则

提方案等确认、修复完等验证时必须 `status({ is_blocked: true })`。
用户明确确认后才能清除阻塞，禁止自行清除。

## 4-9. 问题追踪 / 代码检查 / Spec 任务管理 / 记忆质量 / 工具速查 / 开发规范

（完整规则由 `run install` 自动生成）
```

</details>

<details>
<summary>🔗 Hooks 配置范例（Kiro 专属，自动生成）</summary>

会话结束自动保存已移除，开发流程检查（`.kiro/hooks/dev-workflow-check.kiro.hook`）：

```json
{
  "enabled": true,
  "name": "开发流程检查",
  "version": "1",
  "when": { "type": "promptSubmit" },
  "then": {
    "type": "askAgent",
    "prompt": "核心原则：操作前验证、禁止盲目测试、自测通过才能说完成"
  }
}
```

</details>

## 🇨🇳 中国大陆用户

首次运行自动下载 Embedding 模型（~200MB），如果慢：

```bash
export HF_ENDPOINT=https://hf-mirror.com
```

或在 MCP 配置中加 env：

```json
{
  "env": { "HF_ENDPOINT": "https://hf-mirror.com" }
}
```

## 📦 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Python >= 3.10 |
| 向量数据库 | SQLite + sqlite-vec |
| Embedding | ONNX Runtime + intfloat/multilingual-e5-small |
| 分词器 | HuggingFace Tokenizers |
| 协议 | Model Context Protocol (MCP) |
| Web | 原生 HTTPServer + Vanilla JS |

## 📋 更新日志

### v1.0.11

- 🐛 桌面端版本比较改为语义版本比较，修复本地版本更高时误报升级
- 🐛 健康检查页面字段名与后端对齐，修复一致性状态永远显示 Mismatch
- 🔧 check_track.sh hook 添加 Python fallback，解决无系统 sqlite3 时 hook 静默失败（#4）

### v1.0.10

- 🖥️ 桌面端一键安装 + 升级检测功能
- 🖥️ 启动时自动检测 Python 和 aivectormemory 安装状态
- 🖥️ 未安装时显示一键安装按钮，已安装时检测 PyPI 和桌面端新版本
- 🐛 安装检测改用 importlib.metadata.version() 获取准确包版本

### v1.0.8

- 🔧 修复 PyPI 安装包体积异常（sdist 从 32MB 降至 230KB），排除了误打包的开发文件

### v1.0.6

**新增：原生桌面应用**
- 🖥️ 新增原生桌面客户端，支持 macOS（ARM64）、Windows（x64）、Linux（x64）三平台
- 🖥️ 桌面端与 Web 看板共享同一数据库，功能完全一致
- 🖥️ 暗色/亮色主题切换，Glass 毛玻璃视觉风格
- 🖥️ 登录认证、项目选择、统计概览、记忆管理、问题追踪、任务管理、标签管理、设置、数据维护 — 全功能覆盖
- 📦 GitHub Releases 自动发布安装包，下载即用

**新增：CI/CD 自动构建**
- 🔄 GitHub Actions 自动构建三平台桌面端安装包
- 🔄 打 tag 推送即触发编译、打包、发布全流程

**修复**
- 🐛 Windows 平台兼容性问题修复
- 🐛 sqlite-vec 扩展下载地址修复

### v1.0.5

**优化：Token 消耗降低**
- ⚡ 工作规则从每条消息动态注入改为静态加载，减少重复 Token 消耗
- ⚡ 对 Claude Code 用户影响最大 — 每条消息少消耗约 2K Token

### v1.0.4

**新增：全栈国际化（7 语言）**
- 🌐 Web 看板 + 桌面端 UI 完整支持 7 种语言：简体中文 / 繁體中文 / English / Español / Deutsch / Français / 日本語
- 🌐 设置页面一键切换语言，实时生效
- 🌐 MCP 工具返回内容跟随语言设置，AI 回复自动使用对应语言
- 🌐 切换语言时自动重新生成所有已安装项目的工作规则文件

**新增：Web 看板设置页**
- ⚙️ 语言切换、主题设置、系统信息展示
- ⚙️ 数据库健康检查、修复、备份等维护工具

### v1.0.3

**优化：记忆搜索**
- 🔍 `recall` 搜索支持 OR/AND 两种标签匹配模式，解决多标签搜索漏结果的问题
- 🔍 语义搜索 + 标签过滤时默认 OR 匹配（更宽泛），纯标签浏览时保持 AND 匹配（更精确）

<details>
<summary>📋 v0.2.x 及更早版本更新日志</summary>

查看 [CHANGELOG-archive.md](CHANGELOG-archive.md)

</details>

## License

Apache-2.0
