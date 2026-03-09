#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${PROJECT_DIR}/build/bin"
APP_NAME="${APP_NAME:-AIVectorMemory}"
TARGET_ARCH="${TARGET_ARCH:-amd64}"
APP_VERSION="${APP_VERSION:-$(awk -F'"' '/const AppVersion/ {print $2; exit}' "${PROJECT_DIR}/app.go")}"

normalize_arch() {
  case "$1" in
    amd64|x86_64) printf 'amd64\n' ;;
    arm64|aarch64) printf 'arm64\n' ;;
    *)
      echo "Unsupported TARGET_ARCH: $1" >&2
      exit 1
      ;;
  esac
}

resolve_wails_cmd() {
  if [[ -n "${WAILS_BIN:-}" ]]; then
    printf '%s\n' "${WAILS_BIN}"
    return 0
  fi

  if command -v wails >/dev/null 2>&1; then
    command -v wails
    return 0
  fi

  if [[ -x /tmp/gopath/bin/wails ]]; then
    printf '/tmp/gopath/bin/wails\n'
    return 0
  fi

  printf 'go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0\n'
}

ARCH="$(normalize_arch "${TARGET_ARCH}")"
PLATFORM="darwin/${ARCH}"
PLATFORM_SUFFIX="darwin-${ARCH}"
APP_BUNDLE="${BIN_DIR}/${APP_NAME}.app"
OUTPUT_DMG="${OUTPUT_DMG:-${BIN_DIR}/${APP_NAME}-${APP_VERSION}-${PLATFORM_SUFFIX}.dmg}"
WAILS_CMD="$(resolve_wails_cmd)"

mkdir -p "${BIN_DIR}"

echo "Building ${APP_NAME} for ${PLATFORM}"
if [[ "${WAILS_CMD}" == "go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0" ]]; then
  (cd "${PROJECT_DIR}" && go run github.com/wailsapp/wails/v2/cmd/wails@v2.11.0 build -clean -platform "${PLATFORM}" -m -nosyncgomod)
else
  (cd "${PROJECT_DIR}" && "${WAILS_CMD}" build -clean -platform "${PLATFORM}" -m -nosyncgomod)
fi

if [[ ! -d "${APP_BUNDLE}" ]]; then
  echo "Build finished but app bundle is missing: ${APP_BUNDLE}" >&2
  exit 1
fi

echo "Bundling sqlite-vec into app resources"
"${SCRIPT_DIR}/prepare_vec.sh" "${APP_BUNDLE}/Contents/Resources" "vec0.dylib"

echo "Packaging DMG -> ${OUTPUT_DMG}"
DMG_ARCH="${ARCH}" "${SCRIPT_DIR}/package_dmg.sh" "${APP_BUNDLE}" "${OUTPUT_DMG}"

echo "macOS installer ready: ${OUTPUT_DMG}"
