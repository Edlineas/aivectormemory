#!/bin/bash
# Prepare sqlite-vec for desktop runtime or app bundle resources.

set -euo pipefail

DEST="${1:-$HOME/.aivectormemory}"
TARGET_NAME="${2:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
SOURCE_PATH="${VEC_PATH:-}"

resolve_source_path() {
    if [ -n "$SOURCE_PATH" ]; then
        printf '%s\n' "$SOURCE_PATH"
        return 0
    fi

    "$PYTHON_BIN" -c "import sqlite_vec; print(sqlite_vec.loadable_path())" 2>/dev/null || true
}

resolve_existing_file() {
    local candidate="$1"

    if [ -z "$candidate" ]; then
        return 1
    fi

    if [ -f "$candidate" ]; then
        printf '%s\n' "$candidate"
        return 0
    fi

    if [ -f "${candidate}.dylib" ]; then
        printf '%s\n' "${candidate}.dylib"
        return 0
    fi

    if [ -f "${candidate}.so" ]; then
        printf '%s\n' "${candidate}.so"
        return 0
    fi

    if [ -f "${candidate}.dll" ]; then
        printf '%s\n' "${candidate}.dll"
        return 0
    fi

    return 1
}

default_target_name() {
    local source_file="$1"
    case "$source_file" in
        *.dylib) printf 'vec0.dylib\n' ;;
        *.so) printf 'vec0.so\n' ;;
        *.dll) printf 'vec0.dll\n' ;;
        *) printf 'vec0\n' ;;
    esac
}

SOURCE_CANDIDATE="$(resolve_source_path)"
SOURCE_FILE="$(resolve_existing_file "$SOURCE_CANDIDATE" || true)"

if [ -z "$SOURCE_FILE" ]; then
    echo "sqlite-vec not found. Set VEC_PATH or install sqlite-vec for $PYTHON_BIN." >&2
    exit 1
fi

if [ -z "$TARGET_NAME" ]; then
    TARGET_NAME="$(default_target_name "$SOURCE_FILE")"
fi

mkdir -p "$DEST"
cp "$SOURCE_FILE" "$DEST/$TARGET_NAME"
echo "Copied $(basename "$SOURCE_FILE") -> $DEST/$TARGET_NAME"
echo "sqlite-vec ready"
