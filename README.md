# Google Calendar Backup for QNAP

Back up private Google Calendars automatically to a QNAP NAS. The app is designed for personal Google accounts that are not supported by enterprise Google Workspace backup products.

> **Status:** Early development preview (`0.1.4`). The Node.js service is functional and tested. QPKG packaging is being validated on QTS 5.x / x86_64 before the first binary release.

## Features

- Multiple private Google Calendars
- Separate, timestamped `.ics` snapshots
- Daily schedule and configurable retention
- QNAP folder browser for selecting the backup destination
- Custom Google Calendar Backup icon in the web UI and QTS App Center
- Manual **Back up now** action
- Atomic downloads and iCalendar validation
- Success and error entries in QNAP QuLog Center
- Local `backup.log`
- Password-protected management UI
- Private iCal URLs stored with file mode `0600`
- No Google password, OAuth token, or Google Workspace account required

## Screens

The web interface allows administrators to add calendars, browse and select the NAS target directory, choose the daily backup time, set retention, and inspect the latest run.

## Development

Requires Node.js 20 or newer.

```bash
npm test
npm start
```

Open `http://localhost:19884`. On first launch, create the administration password. For local development, target directories outside `/share` are allowed. QPKG mode requires the target to be below `/share`.

## Preparing a QDK project

QNAP's official [QDK](https://github.com/qnap-dev/QDK) builds QPKG installers. This repository contains the QDK configuration and service script for x86_64 QNAP systems such as the TS-673A.

```bash
NODE_BIN=/path/to/linux-x64/node ./scripts/prepare-qdk-project.sh
```

Copy `build/GoogleCalendarBackup` to the QDK build area on the NAS and run `qbuild`. The generated package is placed in the QDK project's `build` folder.

The first public QPKG release will be published after installation, upgrade, service restart, QTS desktop launch, and uninstall behavior have been verified on real QNAP hardware.

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

- Do not expose port `19884` to the internet.
- Prefer LAN or VPN access to the management UI.
- The UI never returns saved private iCal URLs to the browser; a blank URL field keeps the saved value.
- Backups contain calendar details and should be protected through QNAP shared-folder permissions.

## License

MIT
