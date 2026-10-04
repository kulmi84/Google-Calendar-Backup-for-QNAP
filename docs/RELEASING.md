# Release preparation

## 1.0.3 — requested 2026-10-04

The user explicitly requested idea 3, test warning/test notification, as version 1.0.3 (superseding the earlier tentative 1.0.4 idea). Under the standing commit/push/build/release authorization, publish this version after successful tests and QDK payload verification. Add the notification module to required payload checks. The real QTS QuLog/email/push path remains for the user to verify after installation; do not claim confirmed delivery. Keep security/network access and existing application behavior unchanged.

## 1.0.2 — requested 2026-10-04

The user requested the ideas selected as 1, 3, 4, 5, 6, 8 and 9 for 1.0.2 under the standing commit/push/build/release authorization. The workflow publishes only this explicitly requested version after tests and QDK payload checks, alongside the previously approved 1.0.1 exception. Other future versions remain drafts. NAS compatibility of these new behaviors is not yet verified; preserve that limitation in release notes. Do not change binding, icons or overall UI styling, and do not add catch-up backups.

## 1.0.1 Watchdog — requested 2026-10-04

The user requested implementing the watchdog idea as 1.0.1 under the existing commit/push/build/release instruction. The build workflow publishes this specific version only after successful application tests, QDK packaging and payload verification. Other future versions continue to use the draft procedure. Existing release assets are never replaced. The independent hourly cron/QuLog integration is not yet verified on the user's NAS; release notes must retain that limitation. No network binding, UI or icon changes are authorized.

## 1.0.0 Stable — publication approved 2026-10-03

Base commit: `d5a59671c688148696c60be51eb88490b6237b3a` (0.1.16).
The user explicitly confirmed that 0.1.16 was installed and works successfully on the QNAP. This is the basis for preparing 1.0.0 Stable. No application logic or bundled runtime changes are introduced.

The previously recorded environment is QTS 5.2.10.3577 with AMD Ryzen Embedded V1500B; the exact NAS model and individual fresh-install, scheduled-backup, retention and restore test results have not been separately recorded. Do not describe those checks as completed.

## Build and approval procedure

1. Keep `package.json` and `qpkg/qpkg.cfg` at 1.0.0 and use `docs/releases/1.0.0.md` for the release body.
2. Commit preparation to main. GitHub Actions runs Linux application tests, verifies the runtime checksum, builds with QDK 2.5.3 and verifies the QPKG payload, embedded version and license files.
3. The main-branch workflow creates a **draft stable release** for 1.0.0 with QPKG and SHA-256 assets. Versions starting with 0. remain draft prereleases. Existing releases and installers are preserved. Pull requests, manual runs and tag-only pushes build artifacts without creating releases.
4. Review the successful workflow results, `GoogleCalendarBackup_1.0.0_x86_64.qpkg`, its checksum, embedded version, release notes and documented limitations.
5. Show the finished draft to the user. **Do not publish until the user explicitly approves public publication.** Draft status and stable status are separate: 1.0.0 must have draft=true and prerelease=false.
6. After approval, publish the reviewed draft. Do not replace its installer with a different build.

## Installation and verification

Install through QTS App Center → Install Manually. Upgrades retain configuration under `/etc/config/GoogleCalendarBackup`. Check calendars and target folder, run **Jetzt sichern**, and inspect the generated ICS files.

For broader compatibility verification, record the exact NAS model, QTS version and upgrade source; check fresh installation, scheduled backup, retention, restart, error reporting and importing a snapshot into a separate test calendar. ARM and QuTS hero remain unverified.

The application remains MIT-licensed. Package verification requires `app/LICENSE`, `app/NODEJS-LICENSE` and `app/THIRD_PARTY_NOTICES.md`. The historical 0.1.15 installer lacks the separate Node.js license; 0.1.16 includes it.

The current screenshot dates from 2026-09-27 and predates the date-formatting update. Keep its age documented; do not fabricate a NAS screenshot.

## Publication approval — 2026-10-03

The user explicitly approved public publication of the reviewed 1.0.0 draft. Test run 37145583618 and Build QPKG run 37145583617 succeeded for commit `30af54afaa0f93bf2411b11c5b4aa0367735307f`. Publish release ID 402645573 with its original assets. Installer SHA-256: `3ba77c2e9003d933f411e0a61327395bb76a37b82524d1bb6f4411d3008c08cf`. The dedicated publication workflow checks this identity before setting draft=false and prerelease=false. No installer replacement is authorized by this publication step.
