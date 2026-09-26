# Security

Please do not publish private iCal URLs, configuration files, screenshots containing URLs, or QPKG data directories.

Report vulnerabilities privately through GitHub's security advisory feature. Do not open a public issue for a vulnerability.

The application stores private iCal URLs in `config/config.json` with mode `0600`. The management password is stored as a salted scrypt hash. The web interface currently uses HTTP on the NAS LAN; do not expose port `19884` directly to the internet.
