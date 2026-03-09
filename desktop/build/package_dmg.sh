#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${PROJECT_DIR}/.." && pwd)"
BIN_DIR="${PROJECT_DIR}/build/bin"

APP_NAME="${APP_NAME:-AIVectorMemory}"
VOLUME_NAME="${VOLUME_NAME:-${APP_NAME}}"
APP_BUNDLE="${1:-${BIN_DIR}/${APP_NAME}.app}"
DMG_ARCH="${DMG_ARCH:-amd64}"
OUTPUT_DMG="${2:-${BIN_DIR}/${APP_NAME}-darwin-${DMG_ARCH}.dmg}"
BACKGROUND_IMAGE="${DMG_BACKGROUND:-}"
SOURCE_BACKGROUND_IMAGE="${DMG_SOURCE_BACKGROUND:-${REPO_ROOT}/docs/image.png}"
BACKGROUND_RENDERER="${SCRIPT_DIR}/render_dmg_background.swift"

if [[ ! -d "${APP_BUNDLE}" ]]; then
  echo "App bundle not found: ${APP_BUNDLE}" >&2
  echo "Please build the desktop app first, for example:" >&2
  echo "  /tmp/gopath/bin/wails build -clean -platform darwin/amd64 -m -nosyncgomod" >&2
  exit 1
fi

if ! command -v hdiutil >/dev/null 2>&1; then
  echo "hdiutil is required to package macOS DMG files." >&2
  exit 1
fi

STAGING_DIR="$(mktemp -d /tmp/${APP_NAME}.dmg.XXXXXX)"
STAGING_ROOT="${STAGING_DIR}/root"
RW_DMG="${STAGING_DIR}/${APP_NAME}-temp.dmg"
DEVICE=""
MOUNT_POINT=""
HAS_BACKGROUND="false"

cleanup() {
  if [[ -n "${DEVICE}" ]]; then
    hdiutil detach "${DEVICE}" -quiet >/dev/null 2>&1 || true
  elif [[ -n "${MOUNT_POINT}" && -d "${MOUNT_POINT}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT

rm -f "${OUTPUT_DMG}"
mkdir -p "${STAGING_ROOT}"
cp -R "${APP_BUNDLE}" "${STAGING_ROOT}/"
ln -s /Applications "${STAGING_ROOT}/Applications"

if [[ -z "${BACKGROUND_IMAGE}" && -f "${BACKGROUND_RENDERER}" && -f "${SOURCE_BACKGROUND_IMAGE}" ]]; then
  GENERATED_BACKGROUND_IMAGE="${STAGING_DIR}/dmg-background.png"
  SWIFT_MODULECACHE_PATH="${SWIFT_MODULECACHE_PATH:-/tmp/swift-module-cache}" \
  CLANG_MODULE_CACHE_PATH="${CLANG_MODULE_CACHE_PATH:-/tmp/clang-module-cache}" \
  swift "${BACKGROUND_RENDERER}" \
    "${SOURCE_BACKGROUND_IMAGE}" \
    "${GENERATED_BACKGROUND_IMAGE}"
  BACKGROUND_IMAGE="${GENERATED_BACKGROUND_IMAGE}"
fi

if [[ -f "${BACKGROUND_IMAGE}" ]]; then
  mkdir -p "${STAGING_ROOT}/.background"
  cp "${BACKGROUND_IMAGE}" "${STAGING_ROOT}/.background/$(basename "${BACKGROUND_IMAGE}")"
  HAS_BACKGROUND="true"
fi

APP_SIZE_MB="$(du -sm "${APP_BUNDLE}" | awk '{print $1}')"
DMG_SIZE_MB=$((APP_SIZE_MB + 64))

hdiutil create \
  -volname "${VOLUME_NAME}" \
  -srcfolder "${STAGING_ROOT}" \
  -ov \
  -format UDRW \
  -size "${DMG_SIZE_MB}m" \
  "${RW_DMG}" >/dev/null

ATTACH_OUTPUT="$(hdiutil attach -readwrite -noverify -noautoopen "${RW_DMG}")"
DEVICE="$(echo "${ATTACH_OUTPUT}" | awk '/^\/dev\// {print $1; exit}')"
MOUNT_POINT="$(echo "${ATTACH_OUTPUT}" | awk '/\/Volumes\// {mount=$NF} END {print mount}')"

if [[ -z "${DEVICE}" || -z "${MOUNT_POINT}" ]]; then
  echo "Failed to attach temporary DMG." >&2
  exit 1
fi

if command -v osascript >/dev/null 2>&1 && [ -z "${CI:-}" ]; then
  APP_BUNDLE_NAME="$(basename "${APP_BUNDLE}")"
  BACKGROUND_FILE_NAME="$(basename "${BACKGROUND_IMAGE}")"
  HAS_BACKGROUND_VALUE="${HAS_BACKGROUND}"
  osascript <<EOF_APPLESCRIPT >/dev/null 2>&1 || echo "Note: Finder layout skipped (no GUI)"
on run
  tell application "Finder"
    tell disk "${VOLUME_NAME}"
      open
      set current view of container window to icon view
      set toolbar visible of container window to false
      set statusbar visible of container window to false
      set the bounds of container window to {100, 100, 1508, 868}
      set theViewOptions to the icon view options of container window
      set arrangement of theViewOptions to not arranged
      set icon size of theViewOptions to 140
      if "${HAS_BACKGROUND_VALUE}" is equal to "true" then
        set background picture of theViewOptions to file ".background:${BACKGROUND_FILE_NAME}"
      end if
      set position of item "${APP_BUNDLE_NAME}" to {280, 500}
      set position of item "Applications" to {1120, 500}
      close
      open
      update without registering applications
      delay 2
    end tell
  end tell
end run
EOF_APPLESCRIPT
fi

sync
hdiutil detach "${DEVICE}" -quiet
DEVICE=""
MOUNT_POINT=""

hdiutil convert "${RW_DMG}" -format UDZO -imagekey zlib-level=9 -o "${OUTPUT_DMG}" >/dev/null

echo "Created drag-install DMG: ${OUTPUT_DMG}"
