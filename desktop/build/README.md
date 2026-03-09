# Build Directory

The build directory is used to house all the build files and assets for your application.

The structure is:

* `bin` - Output directory
* `darwin` - macOS specific files
* `windows` - Windows specific files

## Mac

The `darwin` directory holds files specific to Mac builds.
These may be customised and used as part of the build. To return these files to the default state, simply delete them
and
build with `wails build`.

The directory contains the following files:

- `Info.plist` - the main plist file used for Mac builds. It is used when building using `wails build`.
- `Info.dev.plist` - same as the main plist file but used when building using `wails dev`.
- `render_dmg_background.swift` - renders the drag-install DMG background from `docs/image.png` with a 60% white overlay.

### Complete macOS build

To build a full macOS installer, use the wrapper script:

```bash
cd desktop
TARGET_ARCH=amd64 ./build/build_macos_dmg.sh
```

The wrapper script will:

- build the Wails app for the target arch
- bundle `vec0.dylib` into `AIVectorMemory.app/Contents/Resources`
- call `package_dmg.sh` to generate the final DMG

### Drag-install DMG

If you already have an `.app` bundle and only want to package the DMG, run:

```bash
cd desktop
/tmp/gopath/bin/wails build -clean -platform darwin/amd64 -m -nosyncgomod
./build/package_dmg.sh
```

What the packaging script does:

- Copies `AIVectorMemory.app` into a temporary DMG staging folder
- Adds an `Applications` symlink so users can drag the app into the system Applications folder
- Uses `docs/image.png` as the base artwork and applies a 60% white overlay for a cleaner drag-install window background
- Uses Finder layout automation to place the app and `Applications` shortcut side by side in the lower half of the window
- Exports the final image to `build/bin/AIVectorMemory-darwin-amd64.dmg`

You may also provide custom paths:

```bash
./build/package_dmg.sh /path/to/AIVectorMemory.app /path/to/output.dmg
```

### sqlite-vec resource preparation

`prepare_vec.sh` can copy `sqlite-vec` either into the user data directory or into an app bundle resource directory:

```bash
./build/prepare_vec.sh "$HOME/.aivectormemory"
./build/prepare_vec.sh /path/to/AIVectorMemory.app/Contents/Resources vec0.dylib
```

## Windows

The `windows` directory contains the manifest and rc files used when building with `wails build`.
These may be customised for your application. To return these files to the default state, simply delete them and
build with `wails build`.

- `icon.ico` - The icon used for the application. This is used when building using `wails build`. If you wish to
  use a different icon, simply replace this file with your own. If it is missing, a new `icon.ico` file
  will be created using the `appicon.png` file in the build directory.
- `installer/*` - The files used to create the Windows installer. These are used when building using `wails build`.
- `info.json` - Application details used for Windows builds. The data here will be used by the Windows installer,
  as well as the application itself (right click the exe -> properties -> details)
- `wails.exe.manifest` - The main application manifest file.
