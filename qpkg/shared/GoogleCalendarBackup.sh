#!/bin/sh

CONF=/etc/config/qpkg.conf
QPKG_NAME=GoogleCalendarBackup
QPKG_ROOT="$(/sbin/getcfg "$QPKG_NAME" Install_Path -f "$CONF")"
PID_FILE="$QPKG_ROOT/google-calendar-backup.pid"
LOG_DIR="$QPKG_ROOT/log"
SERVICE_LOG="$LOG_DIR/service.log"

watchdog_cron()
{
    # Edit only our tagged job; leave all other NAS schedules unchanged.
    CRON_FILE=/etc/config/crontab
    CRON_JOB='15 * * * * /etc/init.d/GoogleCalendarBackup.sh watchdog # GoogleCalendarBackup-Watchdog'
    [ -r "$CRON_FILE" ] || return 1
    if [ "$1" = register ] && grep -Fqx "$CRON_JOB" "$CRON_FILE"; then
        return 0
    fi
    CRON_TEMP="$(mktemp /etc/config/gcb-watchdog-cron.XXXXXX)" || return 1
    awk '!/ # GoogleCalendarBackup-Watchdog$/' "$CRON_FILE" > "$CRON_TEMP" || { rm -f "$CRON_TEMP"; return 1; }
    if [ "$1" = register ]; then
        printf '%s\n' "$CRON_JOB" >> "$CRON_TEMP"
    fi
    chmod 644 "$CRON_TEMP"
    mv "$CRON_TEMP" "$CRON_FILE" || { rm -f "$CRON_TEMP"; return 1; }
    crontab "$CRON_FILE"
}

run_watchdog()
{
    find_runtime
    if [ -z "$NODE_BIN" ] || [ -z "$APP_ROOT" ]; then
        /sbin/log_tool -t2 -uSystem -p127.0.0.1 -mlocalhost -a '[Google Calendar Backup] Watchdog: App-Laufzeit fehlt; Sicherungen können nicht geprüft werden.'
        return 1
    fi
    GCB_DATA_DIR=/etc/config/GoogleCalendarBackup "$NODE_BIN" "$APP_ROOT/src/watchdog.js"
}

find_runtime()
{
    NODE_BIN=""
    APP_ROOT=""

    for CANDIDATE in \
        "$QPKG_ROOT/bin/node" \
        "$QPKG_ROOT/x86_64/bin/node" \
        "$QPKG_ROOT/node/bin/node"
    do
        if [ -x "$CANDIDATE" ]; then
            NODE_BIN="$CANDIDATE"
            break
        fi
    done

    for CANDIDATE in \
        "$QPKG_ROOT/app" \
        "$QPKG_ROOT/shared/app"
    do
        if [ -f "$CANDIDATE/src/server.js" ]; then
            APP_ROOT="$CANDIDATE"
            break
        fi
    done
}

health_check()
{
    "$NODE_BIN" -e "let b='';const e=process.argv[1];const h=require('http').get('http://127.0.0.1:19884/health',r=>{r.on('data',c=>b+=c);r.on('end',()=>{try{const j=JSON.parse(b);process.exit(r.statusCode===200&&j.ok===true&&j.version===e?0:1)}catch{process.exit(1)}})});h.on('error',()=>process.exit(1));h.setTimeout(1000,()=>{h.destroy();process.exit(1)})" "$EXPECTED_VERSION" >/dev/null 2>&1
}

stop_stale_processes()
{
    for PROC in /proc/[0-9]*; do
        [ -r "$PROC/cmdline" ] || continue
        CMDLINE="$(tr '\000' ' ' < "$PROC/cmdline" 2>/dev/null)"
        case "$CMDLINE" in
            *GoogleCalendarBackup*/src/server.js*)
                PID="${PROC##*/}"
                kill "$PID" 2>/dev/null
                ;;
        esac
    done
    sleep 1
}

start_service()
{
    ENABLED="$(/sbin/getcfg "$QPKG_NAME" Enable -u -d FALSE -f "$CONF")"
    if [ "$ENABLED" != "TRUE" ]; then
        echo "$QPKG_NAME is disabled."
        exit 1
    fi

    mkdir -p /etc/config/GoogleCalendarBackup "$LOG_DIR"
    watchdog_cron register || { echo 'Watchdog-Cronjob konnte nicht eingerichtet werden.' >> "$SERVICE_LOG"; return 1; }
    run_watchdog >> "$SERVICE_LOG" 2>&1
    chmod 700 /etc/config/GoogleCalendarBackup
    umask 077

    find_runtime
    if [ -z "$QPKG_ROOT" ] || [ -z "$NODE_BIN" ] || [ -z "$APP_ROOT" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') Laufzeit nicht gefunden (QPKG_ROOT=$QPKG_ROOT, NODE_BIN=$NODE_BIN, APP_ROOT=$APP_ROOT)" >> "$SERVICE_LOG"
        exit 1
    fi
    NODE_VERSION="$("$NODE_BIN" --version 2>&1)"
    NODE_STATUS=$?
    if [ "$NODE_STATUS" -ne 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') Node-Start fehlgeschlagen (Status $NODE_STATUS, $NODE_BIN): $NODE_VERSION" >> "$SERVICE_LOG"
        exit 1
    fi
    EXPECTED_VERSION="$("$NODE_BIN" -p "require('$APP_ROOT/package.json').version" 2>&1)"
    VERSION_STATUS=$?
    if [ "$VERSION_STATUS" -ne 0 ] || [ -z "$EXPECTED_VERSION" ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') Paketversion konnte nicht gelesen werden (Status $VERSION_STATUS): $EXPECTED_VERSION" >> "$SERVICE_LOG"
        exit 1
    fi

    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        if health_check; then
            exit 0
        fi
        echo "$(date '+%Y-%m-%d %H:%M:%S') Alter Dienst erkannt; Neustart fuer Version $EXPECTED_VERSION" >> "$SERVICE_LOG"
        stop_service
    fi
    # Auch einen verwaisten Prozess ohne PID-Datei sicher ersetzen.
    stop_stale_processes

    export QNAP_QPKG="$QPKG_NAME"
    export GCB_DATA_DIR=/etc/config/GoogleCalendarBackup
    export GCB_QNAP_MODE=1
    # Nur lokal lauschen: Zugriff erfolgt ausschließlich über den authentifizierten QTS-Proxy.
    export GCB_HOST=127.0.0.1
    export GCB_PORT=19884
    export GCB_PROXY_PATH=/GoogleCalendarBackup
    export PATH="$(dirname "$NODE_BIN"):$PATH"

    echo "$(date '+%Y-%m-%d %H:%M:%S') Starte Google Calendar Backup $EXPECTED_VERSION ($NODE_VERSION, Node=$NODE_BIN, App=$APP_ROOT)" >> "$SERVICE_LOG"
    "$NODE_BIN" "$APP_ROOT/src/server.js" >> "$SERVICE_LOG" 2>&1 &
    echo $! > "$PID_FILE"

    COUNT=0
    while [ "$COUNT" -lt 10 ]; do
        if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') Start fehlgeschlagen: Prozess wurde beendet" >> "$SERVICE_LOG"
            rm -f "$PID_FILE"
            exit 1
        fi
        if health_check; then
            echo "$(date '+%Y-%m-%d %H:%M:%S') Dienst läuft mit PID $(cat "$PID_FILE") auf 127.0.0.1:19884" >> "$SERVICE_LOG"
            return 0
        fi
        sleep 1
        COUNT=$((COUNT + 1))
    done

    echo "$(date '+%Y-%m-%d %H:%M:%S') Start fehlgeschlagen: Health-Check auf 127.0.0.1:19884 ohne Antwort" >> "$SERVICE_LOG"
    stop_service
    exit 1
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
    watchdog) run_watchdog; exit $? ;;
    remove) watchdog_cron remove; exit $? ;;
    *) echo "Usage: $0 {start|stop|restart|watchdog|remove}"; exit 1 ;;
esac

exit 0
