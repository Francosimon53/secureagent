#!/bin/bash

# Generate app icons from SVG
# Requires: librsvg (brew install librsvg) and iconutil (comes with Xcode)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ICONS_DIR="$PROJECT_DIR/src-tauri/icons"
SVG_FILE="$ICONS_DIR/icon.svg"

echo "Generating icons from $SVG_FILE..."

# Check if rsvg-convert is available
if ! command -v rsvg-convert &> /dev/null; then
    echo "Error: rsvg-convert not found. Install with: brew install librsvg"
    exit 1
fi

# Generate PNG files at various sizes
echo "Generating PNG files..."
rsvg-convert -w 32 -h 32 "$SVG_FILE" -o "$ICONS_DIR/32x32.png"
rsvg-convert -w 128 -h 128 "$SVG_FILE" -o "$ICONS_DIR/128x128.png"
rsvg-convert -w 256 -h 256 "$SVG_FILE" -o "$ICONS_DIR/128x128@2x.png"
rsvg-convert -w 512 -h 512 "$SVG_FILE" -o "$ICONS_DIR/icon.png"

# Generate iconset for macOS .icns file
echo "Generating macOS iconset..."
ICONSET_DIR="$ICONS_DIR/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"

rsvg-convert -w 16 -h 16 "$SVG_FILE" -o "$ICONSET_DIR/icon_16x16.png"
rsvg-convert -w 32 -h 32 "$SVG_FILE" -o "$ICONSET_DIR/icon_16x16@2x.png"
rsvg-convert -w 32 -h 32 "$SVG_FILE" -o "$ICONSET_DIR/icon_32x32.png"
rsvg-convert -w 64 -h 64 "$SVG_FILE" -o "$ICONSET_DIR/icon_32x32@2x.png"
rsvg-convert -w 128 -h 128 "$SVG_FILE" -o "$ICONSET_DIR/icon_128x128.png"
rsvg-convert -w 256 -h 256 "$SVG_FILE" -o "$ICONSET_DIR/icon_128x128@2x.png"
rsvg-convert -w 256 -h 256 "$SVG_FILE" -o "$ICONSET_DIR/icon_256x256.png"
rsvg-convert -w 512 -h 512 "$SVG_FILE" -o "$ICONSET_DIR/icon_256x256@2x.png"
rsvg-convert -w 512 -h 512 "$SVG_FILE" -o "$ICONSET_DIR/icon_512x512.png"
rsvg-convert -w 1024 -h 1024 "$SVG_FILE" -o "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to .icns
echo "Converting to .icns..."
iconutil -c icns "$ICONSET_DIR" -o "$ICONS_DIR/icon.icns"

# Clean up iconset directory
rm -rf "$ICONSET_DIR"

# Generate .ico for Windows (if ImageMagick is available)
if command -v convert &> /dev/null; then
    echo "Generating Windows .ico..."
    convert "$ICONS_DIR/32x32.png" "$ICONS_DIR/128x128.png" "$ICONS_DIR/icon.png" "$ICONS_DIR/icon.ico"
else
    echo "Warning: ImageMagick not found, skipping .ico generation"
    echo "Install with: brew install imagemagick"
fi

echo "Done! Icons generated in $ICONS_DIR"
ls -la "$ICONS_DIR"
