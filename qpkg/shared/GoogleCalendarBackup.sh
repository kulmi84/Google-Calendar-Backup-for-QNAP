#!/bin/sh

CONF=/etc/config/qpkg.conf
QPKG_NAME=GoogleCalendarBackup
QPKG_ROOT="$(/sbin/getcfg "$QPKG_NAME" Install_Path -f "$CONF")"
PID_FILE="$QPKG_ROOT/google-calendar-backup.pid"
LOG_DIR="$QPKG_ROOT/log"

start_service()
{
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        exit 0
    fi

    mkdir -p "$QPKG_ROOT/config" "$LOG_DIR"
    chmod 700 "$QPKG_ROOT/config"

    export QNAP_QPKG="$QPKG_NAME"
    export GCB_DATA_DIR="$QPKG_ROOT/config"
    export GCB_QNAP_MODE=1
    export GCB_HOST=0.0.0.0
    export GCB_PORT=19884

    "$QPKG_ROOT/bin/node" "$QPKG_ROOT/app/src/server.js" >> "$LOG_DIR/service.log" 2>&1 &
    echo $! > "$PID_FILE"
}

stop_service()
{
    if [ -f "$PID_FILE" ]; then
        PID="$(cat "$PID_FILE")"
        kill "$PID" 2>/dev/null
        COUNT=0
        while kill -0 "$PID" 2>/dev/null && [ "$COUNT" -lt 20 ]; do
            sleep 1
            COUNT=$((COUNT + 1))
        done
        kill -9 "$PID" 2>/dev/null
        rm -f "$PID_FILE"
    fi
}

case "$1" in
    start) start_service ;;
    stop) stop_service ;;
    restart) stop_service; start_service ;;
    *) echo "Usage: $0 {start|stop|restart}"; exit 1 ;;
esac
