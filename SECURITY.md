# Security

Do not publish private iCal URLs, configuration files or screenshots containing URLs. Calendar backups and logs can contain personal data.

The QPKG service binds to `127.0.0.1:19884`. The management interface is routed through the QTS proxy and uses the existing QTS login; there is no separate application password. Use HTTPS for QTS access. Do not expose the internal service port.

Private iCal URLs are stored in `/etc/config/GoogleCalendarBackup/config.json` with file mode `0600` and are not returned to the browser. Backup files and `backup.log` use mode `0644`; protect their shared folder through QNAP permissions.

The service does not receive the signed-in QTS user's identity and cannot filter folders by that user's individual share permissions. Restrict app access in QTS to trusted users.

Report vulnerabilities privately using [GitHub private vulnerability reporting](https://github.com/kulmi84/Google-Calendar-Backup-for-QNAP/security/advisories/new) if enabled. If that option is unavailable, contact the maintainer through a private contact channel before sharing details; do not post vulnerability details or secrets in a public issue. No response-time guarantee is provided.

