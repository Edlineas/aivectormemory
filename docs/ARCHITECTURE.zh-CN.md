# AIVectorMemory 开发架构说明

本文档面向后续开发与维护，整理当前仓库里 Python MCP 服务、Wails 桌面端、Web Dashboard、SQLite/sqlite-vec 与前端 Vue 的协作关系。

## 1. 总体分层

```text
IDE / MCP Client
  -> aivectormemory Python 包
     -> SQLite + sqlite-vec + ONNX Embedding

Desktop UI (Vue + Wails)
  -> desktop/frontend
  -> desktop/app.go Wails 绑定层
  -> desktop/internal/* Go 服务层
  -> 同一份 ~/.aivectormemory 数据目录

Web Dashboard
  -> aivectormemory.web.app
  -> aivectormemory.web.routes.*
  -> 同一份 SQLite 数据与 Embedding 能力
```

核心结论：

- Python MCP 服务、桌面端、Web Dashboard 共享同一套数据目录，默认在 `~/.aivectormemory/`。
- 桌面端不是单独的后端，它是 `Wails Shell + Vue 前端 + Go 绑定层`，必要时再拉起 Python Web Dashboard。
- `sqlite-vec` 既可以从用户目录加载，也可以从 `.app/Contents/Resources` 内加载，这就是桌面安装包可独立运行的关键。

## 2. 仓库结构

### Python 侧

- [`aivectormemory/__main__.py`](../aivectormemory/__main__.py)
  Python 包入口，负责 CLI、安装、Web、再生成等命令分发。
- [`aivectormemory/server.py`](../aivectormemory/server.py)
  MCP Server 入口。
- [`aivectormemory/tools/`](../aivectormemory/tools)
  `remember`、`recall`、`task`、`track` 等 MCP 工具实现。
- [`aivectormemory/db/`](../aivectormemory/db)
  SQLite 连接、Schema、Repository、迁移脚本。
- [`aivectormemory/embedding/`](../aivectormemory/embedding)
  向量编码与模型加载。
- [`aivectormemory/web/`](../aivectormemory/web)
  Web Dashboard 的 HTTP 入口、路由与静态资源。

### 桌面端

- [`desktop/main.go`](../desktop/main.go)
  Wails 启动入口，嵌入 `frontend/dist` 并启动桌面壳。
- [`desktop/app.go`](../desktop/app.go)
  桌面端的应用服务边界。负责：
  - 向前端暴露 Wails 绑定方法
  - 初始化数据库、Embedding、Auth、Settings、Web Launcher
  - 环境检测、版本检测、安装/升级入口
- [`desktop/internal/db/`](../desktop/internal/db)
  桌面端本地数据库访问层。
- [`desktop/internal/embedding/`](../desktop/internal/embedding)
  桌面侧 Embedding 封装与修复任务。
- [`desktop/internal/auth/`](../desktop/internal/auth)
  桌面登录鉴权。
- [`desktop/internal/settings/`](../desktop/internal/settings)
  桌面配置与开机启动管理。
- [`desktop/internal/webserver/`](../desktop/internal/webserver)
  启停 Python Web Dashboard。
- [`desktop/frontend/`](../desktop/frontend)
  Vue 3 + TypeScript 前端。

### 构建与交付

- [`desktop/wails.json`](../desktop/wails.json)
  Wails 项目配置，声明前端安装/构建命令。
- [`desktop/build/`](../desktop/build)
  DMG 资源、打包脚本、Windows 安装器模板。
- [`scripts/install.sh`](../scripts/install.sh)
  桌面发布包中的辅助安装脚本，用于将 `vec0` 复制到用户数据目录。

## 3. 关键运行链路

### 3.1 MCP 运行链路

1. IDE 通过 MCP 调用 Python 包。
2. Python 侧工具写入或读取 SQLite。
3. 语义检索与去重依赖 Embedding Engine 与 sqlite-vec。

### 3.2 桌面端链路

1. Wails 启动 [`desktop/main.go`](../desktop/main.go)。
2. [`desktop/app.go`](../desktop/app.go) 初始化：
   - `settings.Load()`
   - 通过 `desktop/runtime.go` 统一构建 `db.Open()`、`LoadVecExtension()`、`embedding.NewEngine()`、`auth.NewManager()`、`webserver.NewLauncher()`
   - 如果数据库初始化失败，只记录降级状态，不让后续 Wails 导出方法直接空指针崩溃
3. Vue 前端通过 `wailsjs/go/main/App` 调用 Go 方法。
4. Go 方法落到 `desktop/internal/*` 进行数据库、配置或子进程操作。

补充约束：

- `SaveSettings()` 不再只是写 `desktop.json`，而是会在 `db_path`、`python_path`、`web_port` 变化时先构建新运行时，再交换旧运行时，避免“配置已变、实际运行对象没变”。
- `LaunchWebDashboard()`、认证、数据库读写等绑定方法都必须先经过运行时可用性检查，返回明确错误，而不是直接解引用空对象。

### 3.3 Web Dashboard 链路

1. 桌面端点击打开 Web 看板时，由 [`desktop/internal/webserver/launcher.go`](../desktop/internal/webserver/launcher.go) 启动 Python 命令 `python -m aivectormemory web`。
2. Python HTTPServer 入口为 [`aivectormemory/web/app.py`](../aivectormemory/web/app.py)。
3. API 请求交给 `aivectormemory.web.routes.*`。

补充约束：

- 问题跟踪与 memory 的标签同步必须同时维护 `memories.tags` JSON 和 `memory_tags` 关联表；局部更新时，未显式传入 `tags` 不能默认清空已有标签。

## 4. 数据与配置落点

- 数据库：`~/.aivectormemory/memory.db`
- Python 侧设置：`~/.aivectormemory/settings.json`
- 桌面端设置：`~/.aivectormemory/desktop.json`
- sqlite-vec 用户级扩展：`~/.aivectormemory/vec0.dylib|so|dll`
- macOS App Bundle 内嵌扩展：`AIVectorMemory.app/Contents/Resources/vec0.dylib`

这意味着桌面覆盖安装时，只替换应用本身，不会清空用户数据库和配置。

## 5. 前端模块划分

- `src/views/`
  页面级视图，例如项目选择、统计、任务、问题、设置。
- `src/components/`
  可复用 UI 组件。
- `src/composables/`
  领域数据访问封装，负责调用 Wails 绑定方法。
- `src/stores/`
  Pinia 状态管理。
- `src/i18n/`
  桌面端文案国际化。

当前升级提示入口位于 [`desktop/frontend/src/views/ProjectSelect.vue`](../desktop/frontend/src/views/ProjectSelect.vue)，逻辑依赖 [`desktop/app.go`](../desktop/app.go) 的 `CheckEnvironment()`、`CheckUpgrade()` 和 `InstallPackage()`。

## 6. macOS 打包链路

当前 macOS 交付链路分成两层：

1. 底层 DMG 封装
   - [`desktop/build/package_dmg.sh`](../desktop/build/package_dmg.sh)
   - 负责把 `.app` 与 `Applications` 快捷方式封装成拖拽安装 DMG
2. 上层完整构建
   - [`desktop/build/build_macos_dmg.sh`](../desktop/build/build_macos_dmg.sh)
   - 负责：
     - 调用 Wails 构建指定架构的 `.app`
     - 调用 [`desktop/build/prepare_vec.sh`](../desktop/build/prepare_vec.sh) 注入 `vec0.dylib`
     - 再调用 `package_dmg.sh` 产出版本化 DMG

## 7. 更新安装策略

当前仓库的“更新安装”不是应用内热更新，而是：

1. 桌面端调用 `CheckUpgrade()` 检查 PyPI 和 GitHub Releases 最新版本。
2. 如果有新桌面版本，优先给出当前系统/架构匹配的安装包下载地址。
3. 用户下载新的 DMG 后，把应用再次拖入 `Applications` 覆盖旧版本。
4. 数据与配置仍保留在 `~/.aivectormemory/`。

这条链路足够稳定，也符合当前项目没有内置自动替换安装器的事实。

## 8. 后续开发建议

- 新增桌面功能时，优先把业务逻辑放进 `desktop/internal/*`，不要继续膨胀 `desktop/app.go`。
- 如果桌面端与 Python Web 侧出现重复业务，优先沉到共享的数据层或明确定义职责边界。
- 桌面更新如果后续要做真正自动升级，建议单独设计发布元数据、签名策略和回滚策略，不要直接在当前 `CheckUpgrade()` 上继续堆逻辑。
