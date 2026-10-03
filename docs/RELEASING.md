# Release preparation

## Audit — 2026-10-03

- Public repository, main commit: `9814f71f9633e1c8983ffc26db5f876f3c4f1f43`.
- README, package.json and qpkg/qpkg.cfg agree on 0.1.15; QTS minimum is 5.1.0, architecture x86_64.
- Eight published releases were found; all are prereleases. Latest: v0.1.15, published 2026-10-02.
- Existing asset: `GoogleCalendarBackup_0.1.15_x86_64.qpkg`, 49,535,745 bytes.
- Downloaded asset SHA-256 matches GitHub's recorded digest:
  `161229ed7e759c88eaec20244f119e9a0498d47535db4d87312224d285a7a526`.
- Inspected payload includes application version 0.1.15, runtime, UI and application MIT license. Separate Node.js license is absent.
- GitHub Test and Build QPKG workflows succeeded for the audited commit.
- Local Windows tests: 12 passed; two folder tests cannot create symlinks due to Windows permissions, including a retry outside the sandbox. This is not a complete local test pass.
- One screenshot exists, dated 2026-09-27. It exposes no private iCal URLs, but shows personal calendar names and the old date formatting.

## Release candidate 0.1.16

The user approved continuing with **0.1.16**. package.json, qpkg/qpkg.cfg and README now identify the release candidate. The working application behavior is retained; packaging/license and documentation corrections are included. The existing 0.1.15 installer is preserved. A GitHub release draft is the next deliverable; public publication and stable status remain pending NAS verification.

Before choosing stable release status, verify which version is actually running on the NAS and complete the checks below on the newly built package. User-reported stability is useful evidence but does not identify an installed version by itself.

The user confirmed the running version is **0.1.15** on **QTS 5.2.10.3577**, with an **AMD Ryzen Embedded V1500B** CPU. The exact NAS model has not been separately confirmed. This establishes the source environment for upgrade testing; it does not yet verify 0.1.16. The supplied firmware screenshot contains a serial number and is not included in public documentation.

## Release procedure

1. Review and merge preparation changes.
2. Version metadata and the candidate changelog are prepared for 0.1.16. Use `docs/releases/0.1.16.md` for the release body and record final verification before publication.
3. Run the application tests on Linux and the QDK build. Package verification must find both `app/LICENSE` and `app/NODEJS-LICENSE`.
4. The main-branch workflow prepares a **draft prerelease** for a new version with the QPKG, SHA-256 file and version-specific notes. Existing releases are preserved. A tag-only push builds an artifact but does not create a release.
5. On QTS 5.1+ x86_64, test fresh installation via **App Center → Manuell installieren**, QTS launch, saving multiple calendars, folder selection, manual and scheduled backup, failure reporting and retention. Test upgrade from the installed stable build, configuration preservation and service restart.
6. Import a snapshot into a separate test calendar and check expected events. Protect the backup folder and verify app access with the intended QTS account.
7. Replace or supplement the screenshot with a current capture using neutral calendar names and hidden URLs. Do not fabricate a NAS installation screenshot.
8. Check asset name, embedded version, license files, checksum, release notes and documented limitations. Decide explicitly whether to retain prerelease status or publish as a stable release.

## Existing 0.1.15 notes

[release-0.1.15.md](releases/0.1.15.md) is a prepared replacement for the currently minimal release body. It describes the existing installer and its known missing license file without presenting it as a new corrected build.

