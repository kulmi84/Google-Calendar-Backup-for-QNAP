# Changelog

Changes are listed by application version. GitHub releases through 0.1.15 are marked as prereleases.

## Unreleased

- Dokumentation um die aktuelle Oberfläche für Sicherung, Testwarnung und Fehlerhistorie ergänzt.
- README für eine bessere Auffindbarkeit über deutsche und englische Suchbegriffe wie „Google Kalender Backup“ und „Google Calendar Backup“ optimiert.
- Dokumentation der Testwarnung ergänzt: gekennzeichneter Benachrichtigungstest zur Prüfung der über QNAP konfigurierten QuLog-/E-Mail-/Push-Zustellung.
- Persistente Fehlerhistorie dokumentiert: Die letzten 100 Fehler und Warnungen bleiben auch nach einem App-Neustart erhalten.

## 1.0.3 — 2026-10-04

- Add a manual test-warning button using the existing QTS proxy, QuLog warning severity and watchdog message prefix.
- Await the QNAP log tool's exit status and report failures without claiming email/push delivery. Retain clearly marked test warnings in private error history without changing backup/watchdog state.
- Preserve all backup behavior, loopback-only binding, icons and light UI; allow action buttons to wrap on small screens.

## 1.0.2 — 2026-10-04

- Validate complete ICS envelopes, VERSION:2.0 and balanced components before atomic promotion; reject empty, oversized, HTML and truncated responses.
- Check target permissions, a real temporary write and at least 60 MiB available space before downloading. Continue through all calendars when one fails, including failures creating/logging in the target folder.
- Persist the latest 100 backup, maintenance and watchdog errors privately outside the target folder; show the history after restarts.
- Share full-content per-calendar monitoring between the independent watchdog and GUI; show backup date/age and target free space. Reject colliding sanitized filenames.
- Keep UI style, icons, loopback-only binding, schedule and no catch-up behavior unchanged.

## 1.0.1 — 2026-10-04

- Add an independent hourly QTS cron watchdog with per-calendar 26-hour ICS freshness checks, daily warning deduplication and recovery messages in QuLog.
- Preserve existing cron tasks and remove only the marked watchdog task on QPKG uninstall.
- Preserve loopback-only service binding, UI and icon; add automated watchdog coverage and QPKG payload verification.

## 1.0.0 Stable — 2026-10-03

Public publication explicitly approved by the user.

- Promote the user-confirmed, successfully tested QNAP version 0.1.16 to the first stable version.
- Set application and QPKG metadata consistently to 1.0.0.
- Update README, release procedure and version-specific release notes for stable status.
- Publish the reviewed stable release with its existing QPKG and SHA-256 assets; keep 0.x releases marked as prereleases.
- Verify version consistency before packaging and check the embedded package version.
- Retain application behavior, bundled runtime, complete license notices and MIT application license from 0.1.16.

## 0.1.16 — release candidate prepared 2026-10-03

Not publicly released. Application backup behavior is unchanged from 0.1.15.

- Added explicit features, QTS 5.1.0 minimum, manual installation steps and backup limitations.
- Corrected security documentation to match QTS login and the current configuration path.
- Documented screenshot age and third-party licensing.
- Required the runtime's complete Node.js LICENSE during package preparation and included it in the QPKG.
- Prepared draft release notes and SHA-256 assets for future versioned builds; publication requires a separate release decision.

## 0.1.15 — 2026-10-02

- Display the last backup date and time with two-digit day, month, hour, minute and second.
- Added a regression test for date formatting.
- Added a QTS interface screenshot and German installation and usage documentation.
- Preserve an existing release installer when the build runs again for the same version.

[Changes since 0.1.14](https://github.com/kulmi84/Google-Calendar-Backup-for-QNAP/compare/v0.1.14...v0.1.15)

## 0.1.14 — 2026-09-27

Published an installable x86_64 QPKG built and verified with QDK. The original release notes contain no detailed change list; this entry does not infer undocumented changes.

## 0.1.8 — 2026-09-27

According to the original release notes:

- Made QNAP folder selection work through the QTS proxy using POST requests.
- Detect and replace a stale Node process after an update by checking the package version.
- Accept trailing slashes in API routes.

Earlier preview releases: 0.1.1, 0.1.2, 0.1.3, 0.1.5 and 0.1.7. See [GitHub releases](https://github.com/kulmi84/Google-Calendar-Backup-for-QNAP/releases) for their original notes and assets. Missing release numbers do not imply an available installer.
