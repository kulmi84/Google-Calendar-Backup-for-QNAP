## Google Calendar Backup 0.1.16 — proposed release notes

Preparation only: this version has not been selected, built or published. Before using these notes, remove this paragraph and record the actual verification results.

### Changes

- Preserve the working backup application behavior from 0.1.15.
- Include the bundled Node.js runtime's complete license and third-party notices; fail packaging when the runtime license is missing.
- Clarify features, QTS requirements, manual installation, scheduling and restore limitations.
- Correct security documentation to match the QTS login and current configuration path.
- Supply SHA-256 checksums and detailed release notes.

### Installation

Requires QTS 5.1.0+ on x86_64. Download **GoogleCalendarBackup_0.1.16_x86_64.qpkg** from this release's assets.

Open **QNAP App Center → Manuell installieren / Install Manually**, select the QPKG and confirm. Launch the app from QTS, configure the calendars and target folder, and test **Jetzt sichern**. Source ZIP/TAR archives are not installers.

Upgrades retain configuration under `/etc/config/GoogleCalendarBackup`. The SHA-256 asset allows verification of the downloaded QPKG.

### Verification to record before publication

- Linux application tests and QDK package/license checks.
- NAS model, exact QTS version, fresh install and upgrade source version.
- Manual/scheduled backup, retention, restart and snapshot import results.
- Final choice of prerelease or stable status.

Known limitations: ARM/QuTS hero unverified; missed scheduled runs are not caught up; folder selection cannot filter by the signed-in QTS user's individual share permissions. Protect the backup folder.

