# Third-party notices

The application is licensed under the MIT license; see [LICENSE](LICENSE).

QPKG builds bundle Node.js v22.23.3 for Linux x86_64 with glibc 2.17 compatibility, obtained from [Node.js unofficial builds](https://unofficial-builds.nodejs.org/download/release/v22.23.3/). The build workflow verifies the download against the published SHA-256 list. This is an unofficial compatibility build.

Node.js and its bundled components retain their respective licenses. The complete LICENSE shipped with the selected runtime must be included in the QPKG as `app/NODEJS-LICENSE`. Package preparation fails when that file is unavailable. For a custom runtime, set `NODE_LICENSE` to that runtime's complete LICENSE; do not substitute the application's MIT license.

QDK 2.5.3 is a build tool from [qnap-dev/QDK](https://github.com/qnap-dev/QDK); it is not bundled as an application runtime.

The published 0.1.15 QPKG contains the application's MIT license but lacks the separate Node.js license file. The next release must include it. Existing published installers should not be silently replaced.

This independent community project is not affiliated with or endorsed by Google or QNAP.

