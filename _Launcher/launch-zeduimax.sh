#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
LOG_FILE="/tmp/zeduimax-launcher.log"
SETTINGS_FILE="$APP_DIR/data/settings.json"
MATCH_PATTERN="$APP_DIR/node_modules/electron/dist/electron \\. --no-sandbox --remote-debugging-port=9223"

cd "$APP_DIR"

# Ensure one owned instance for launcher-driven starts.
pkill -f "$MATCH_PATTERN" >/dev/null 2>&1 || true

# Reset to a known-good visible position so hidden/off-screen bounds do not block launch.
if [[ -f "$SETTINGS_FILE" ]]; then
  APP_DIR="$APP_DIR" node <<'NODE'
const fs = require('fs');
const file = `${process.env.APP_DIR}/data/settings.json`;
try {
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  settings.windowBounds = { x: 120, y: 80, width: 1497, height: 1001 };
  fs.writeFileSync(file, JSON.stringify(settings, null, 2));
} catch {
  // Ignore parse/write issues and continue launch.
}
NODE
fi

# Launch in foreground; caller should launch this script in a detached Windows process.
# Diagnostics go to /tmp/zeduimax-launcher.log.
# Explorer-triggered WSL shells can miss WSLg vars; force sane defaults.
export DISPLAY="${DISPLAY:-:0}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/mnt/wslg/runtime-dir}"

echo "ZedUIMax launching. Log: $LOG_FILE"
exec "$APP_DIR/node_modules/electron/dist/electron" . --no-sandbox --remote-debugging-port=9223 --disable-gpu >>"$LOG_FILE" 2>&1
