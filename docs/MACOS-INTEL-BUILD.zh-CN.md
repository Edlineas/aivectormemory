# macOS Intel 安装包构建与更新安装

本文档说明如何在本地生成 `mac Intel (amd64)` 安装包，以及如何通过 DMG 进行覆盖升级。

## 1. 前提条件

- macOS 构建环境
- Go
- Node.js / npm
- Xcode Command Line Tools
- 可用的 Python
- `sqlite-vec`

说明：

- 如果系统里已有 `wails`，脚本会直接使用。
- 如果没有 `wails`，脚本会回退到 `go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0`。
- `sqlite-vec` 默认通过 `python -c "import sqlite_vec"` 自动定位，也可以手动传 `VEC_PATH`。

## 2. 一键构建 Intel DMG

在仓库根目录执行：

```bash
cd desktop
chmod +x build/build_macos_dmg.sh build/prepare_vec.sh build/package_dmg.sh
TARGET_ARCH=amd64 ./build/build_macos_dmg.sh
```

默认产物：

```text
desktop/build/bin/AIVectorMemory-<AppVersion>-darwin-amd64.dmg
```

脚本会自动完成以下动作：

1. 调用 Wails 构建 `darwin/amd64` 的 `AIVectorMemory.app`
2. 将 `vec0.dylib` 拷贝到 `AIVectorMemory.app/Contents/Resources/`
3. 调用 `package_dmg.sh` 生成拖拽安装 DMG

## 3. 常用参数

### 指定 sqlite-vec 文件

```bash
cd desktop
VEC_PATH=/absolute/path/to/vec0.dylib TARGET_ARCH=amd64 ./build/build_macos_dmg.sh
```

### 指定 Wails 可执行文件

```bash
cd desktop
WAILS_BIN=/tmp/gopath/bin/wails TARGET_ARCH=amd64 ./build/build_macos_dmg.sh
```

### 指定输出文件名

```bash
cd desktop
OUTPUT_DMG="$PWD/build/bin/AIVectorMemory-custom-intel.dmg" TARGET_ARCH=amd64 ./build/build_macos_dmg.sh
```

## 4. 更新安装方式

当前 macOS 的更新安装方式是“覆盖安装”：

1. 下载新的 Intel DMG。
2. 打开 DMG。
3. 将 `AIVectorMemory.app` 拖入 `Applications`。
4. 如果系统提示替换旧版本，选择替换。

这不会清空以下用户数据：

- `~/.aivectormemory/memory.db`
- `~/.aivectormemory/settings.json`
- `~/.aivectormemory/desktop.json`

也就是说，应用升级与用户数据目录是分离的。

## 5. 桌面端升级检测说明

桌面端项目选择页会调用 `CheckUpgrade()`：

- Python 包升级：检测 PyPI 最新版本
- 桌面应用升级：检测 GitHub Releases 最新版本

本次调整后，桌面端会优先为当前系统/架构选择匹配的下载资产链接。对于 Intel Mac，会优先选择：

- `darwin-amd64.dmg`
- `macos-x64.dmg`
- `macos-amd64.dmg`

如果发布页里没有匹配资产，才会回退到 Release 页面。

## 6. 常见问题

### 6.1 `sqlite-vec not found`

处理方式：

```bash
python3 -m pip install sqlite-vec
```

或直接传入 `VEC_PATH`。

### 6.2 `wails not found`

处理方式：

- 安装 `wails`
- 或确保当前 Go 环境可以执行：

```bash
go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 version
```

### 6.3 构建完成后 App 无法加载向量扩展

确认以下文件存在：

```text
AIVectorMemory.app/Contents/Resources/vec0.dylib
```

桌面端会优先从 `.app` 资源目录加载，其次才是 `~/.aivectormemory/vec0.dylib`。
