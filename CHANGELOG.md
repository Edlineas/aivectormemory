# CHANGELOG

- [2026-03-10 01:13] FIX: 持久化 issue tags 并补齐桌面端与 Python 侧兼容迁移，避免标签静默丢失 (Files: desktop/internal/db/connection.go, desktop/internal/db/issues.go, desktop/internal/db/db_test.go, desktop/frontend/wailsjs/go/models.ts, aivectormemory/db/schema.py, aivectormemory/db/migrations/__init__.py, aivectormemory/db/migrations/v11.py, aivectormemory/db/issue_repo.py, aivectormemory/web/routes/issues.py, aivectormemory/web/static/app.js)
- [2026-03-09 12:10] REFACTOR: DMG 背景改为使用原版 docs/image.png 并叠加 60% 白色蒙版，移除额外 logo 与文案设计 (Files: desktop/build/package_dmg.sh, desktop/build/render_dmg_background.swift, desktop/build/README.md, desktop/README.md)
- [2026-03-09 12:10] FEAT: DMG 安装窗口改为使用架构图背景、项目 logo 和 README 主文案，并优化拖拽安装图标布局 (Files: desktop/build/package_dmg.sh, desktop/build/render_dmg_background.swift, desktop/build/README.md, desktop/README.md)
- [2026-03-09 11:59] FEAT: 新增 macOS 拖拽安装 DMG 打包脚本，支持将应用拖入 Applications 安装 (Files: desktop/build/package_dmg.sh, desktop/build/README.md, desktop/README.md)
