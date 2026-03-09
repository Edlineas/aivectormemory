# CHANGELOG

- [2026-03-10 00:20] FIX: 修复桌面端 Issue 创建/详情/归档标识错位，并补齐 mac Intel 发布矩阵 (Files: desktop/app.go, desktop/internal/db/issues.go, desktop/internal/db/db_test.go, desktop/frontend/src/composables/useIssues.ts, desktop/frontend/src/views/IssuesView.vue, .github/workflows/release.yml, docs/MACOS-INTEL-BUILD.zh-CN.md)
- [2026-03-09 20:42] DOCS: 新增开发架构文档与 mac Intel 打包/更新安装说明，整理桌面构建入口文档 (Files: docs/ARCHITECTURE.zh-CN.md, docs/MACOS-INTEL-BUILD.zh-CN.md, docs/README.zh-CN.md, desktop/README.md, desktop/build/README.md)
- [2026-03-09 20:42] FEAT: 新增 macOS Intel 一键 DMG 构建脚本，优化 sqlite-vec 资源打包与桌面升级下载地址匹配逻辑 (Files: desktop/build/build_macos_dmg.sh, desktop/build/prepare_vec.sh, desktop/build/package_dmg.sh, desktop/app.go, desktop/app_test.go)
- [2026-03-09 12:10] REFACTOR: DMG 背景改为使用原版 docs/image.png 并叠加 60% 白色蒙版，移除额外 logo 与文案设计 (Files: desktop/build/package_dmg.sh, desktop/build/render_dmg_background.swift, desktop/build/README.md, desktop/README.md)
- [2026-03-09 12:10] FEAT: DMG 安装窗口改为使用架构图背景、项目 logo 和 README 主文案，并优化拖拽安装图标布局 (Files: desktop/build/package_dmg.sh, desktop/build/render_dmg_background.swift, desktop/build/README.md, desktop/README.md)
- [2026-03-09 11:59] FEAT: 新增 macOS 拖拽安装 DMG 打包脚本，支持将应用拖入 Applications 安装 (Files: desktop/build/package_dmg.sh, desktop/build/README.md, desktop/README.md)
