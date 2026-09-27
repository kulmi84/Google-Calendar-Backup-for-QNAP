# Google Calendar Backup for QNAP

Back up private Google Calendars automatically to a QNAP NAS. The app is designed for personal Google accounts that are not supported by enterprise Google Workspace backup products.

> **Status:** Test release (`0.1.8`) for QTS 5.x on x86_64. The web interface is available only through the authenticated QTS proxy; the internal service is bound to localhost.

## Features

- Multiple private Google Calendars
- Separate, timestamped `.ics` snapshots
- Daily schedule and configurable retention
- Built-in browser for selecting QNAP shared folders and subfolders
- Manual **Back up now** action
- Atomic downloads and iCalendar validation
- Success and error entries in QNAP QuLog Center
- Local `backup.log`
- Management UI protected by the existing QTS login
- Private iCal URLs stored with file mode `0600`
- Automatic import of the existing `Marcin`, `Familie`, and `Doris` URL files from the earlier shell-script setup
- No Google password, OAuth token, or Google Workspace account required

## Screens

The web interface allows administrators to add calendars, select the NAS target directory, choose the daily backup time, set retention, and inspect the latest run.

## Development

Requires Node.js 20 or newer.

```bash
npm test
npm start
```

Open `http://localhost:19884`. For local development, target directories outside `/share` are allowed. QPKG mode requires the target to be below `/share`.

## Preparing a QDK project

QNAP's official [QDK](https://github.com/qnap-dev/QDK) builds QPKG installers. This repository contains the QDK configuration and service script for x86_64 QNAP systems such as the TS-673A.

```bash
NODE_BIN=/path/to/linux-x64/node ./scripts/prepare-qdk-project.sh
```

Copy `build/GoogleCalendarBackup` to the QDK build area on the NAS and run `qbuild --build-arch x86_64`. The generated package is placed in the QDK project's `build` folder.

The packaged Node.js runtime should be a `linux-x64-glibc-217` build. That target is intended for QNAP QTS 4.x/5.x systems with an older glibc. The release package includes Node.js attribution and license information.

Configuration is kept in `/etc/config/GoogleCalendarBackup` so upgrades do not overwrite it. Calendar backups are never removed by uninstalling the app.

After the QPKG has completed a successful backup, remove the previous cron entry for `google_calendar_backup.sh`; otherwise both jobs will create snapshots each day.

## Obtaining a private iCal address

In Google Calendar on a desktop browser:

1. Open **Settings**.
2. Select a calendar under **Settings for my calendars**.
3. Open **Integrate calendar**.
4. Copy **Secret address in iCal format**.

Treat this URL like a password. Anyone with the URL can read the calendar.

## Backup format

Each run creates one file per calendar:

```text
Marcin_2026-09-26_03-15-00.ics
Familie_2026-09-26_03-15-00.ics
Doris_2026-09-26_03-15-00.ics
```

Snapshots can be imported through Google Calendar's **Import & export** page.

## Security notes

- The internal service listens only on `127.0.0.1:19884` and is routed through the authenticated QTS web proxy. It is not reachable directly from the LAN.
- Prefer LAN or VPN access to the management UI.
- The UI never returns saved private iCal URLs to the browser; a blank URL field keeps the saved value.
- Backups contain calendar details and should be protected through QNAP shared-folder permissions.

## License

MIT
