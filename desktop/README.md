# Desktop

This directory contains the Wails desktop app for AIVectorMemory.

## Development

Run live development with:

```bash
cd desktop
wails dev
```

The desktop shell embeds `frontend/dist` in production and binds Go methods from [`app.go`](./app.go) into the Vue frontend.

## Build

For a complete macOS DMG build, prefer the wrapper script:

```bash
cd desktop
TARGET_ARCH=amd64 ./build/build_macos_dmg.sh
```

It will:

- build `AIVectorMemory.app` with Wails
- copy `vec0.dylib` into `Contents/Resources`
- generate a drag-install DMG

More details:

- [Build assets README](./build/README.md)
- [macOS Intel packaging guide](../docs/MACOS-INTEL-BUILD.zh-CN.md)
- [Architecture guide](../docs/ARCHITECTURE.zh-CN.md)
