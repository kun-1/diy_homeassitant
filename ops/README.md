# Mac mini services

The three launch agents in `launchd/` keep the Office Companion stack alive after login or reboot:

- `com.guozai.office-backend`: API and SQLite on port 3100
- `com.guozai.eink-renderer`: BYOS/E-ink rendering on port 3000
- `com.guozai.pwa`: production PWA preview on port 4175

Install them into `/Users/rita/Library/LaunchAgents`, then use `launchctl bootstrap gui/$(id -u)`.
Logs are written under `/Users/rita/Library/Logs/guozai`.
