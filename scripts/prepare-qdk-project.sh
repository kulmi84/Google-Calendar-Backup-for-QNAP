#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
NODE_BIN="${NODE_BIN:-}"
OUT="$ROOT/build/GoogleCalendarBackup"

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
    echo "Set NODE_BIN to a Linux x86_64 Node.js executable (version 20 or newer)." >&2
    exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT/shared/app/src" "$OUT/shared/app/public" "$OUT/x86_64/bin" "$OUT/icons"
cp "$ROOT/qpkg/qpkg.cfg" "$OUT/qpkg.cfg"
printf "%s\n" "# Package-specific hooks intentionally empty." > "$OUT/package_routines"
cp "$ROOT/qpkg/shared/GoogleCalendarBackup.sh" "$OUT/shared/GoogleCalendarBackup.sh"
cp "$ROOT/src/"*.js "$OUT/shared/app/src/"
cp "$ROOT/public/"* "$OUT/shared/app/public/"
base64 -d "$ROOT/qpkg/icons/GoogleCalendarBackup.png.b64" > "$OUT/icons/GoogleCalendarBackup.png"
base64 -d "$ROOT/qpkg/icons/GoogleCalendarBackup_80.png.b64" > "$OUT/icons/GoogleCalendarBackup_80.png"
base64 -d "$ROOT/qpkg/icons/GoogleCalendarBackup_gray.png.b64" > "$OUT/icons/GoogleCalendarBackup_gray.png"
cp "$ROOT/package.json" "$ROOT/LICENSE" "$OUT/shared/app/"
cp "$NODE_BIN" "$OUT/x86_64/bin/node"
chmod 755 "$OUT/shared/GoogleCalendarBackup.sh" "$OUT/x86_64/bin/node"

echo "QDK project prepared at: $OUT"
echo "Copy it into the QDK build directory on a QNAP NAS and run qbuild."
