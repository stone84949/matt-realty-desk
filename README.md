# Matt Realty Desk

A private, local-first relationship desk for a realtor. It keeps contacts, follow-ups,
campaign drafts, and notes in a single SQLite database. It never sends email.

The default Mission Control theme uses a dark command-center layout with teal,
violet, gold, and rose status signals. Coastal Blue, Charcoal, Plum, and Forest
remain available under Help → Appearance.

- App: `http://127.0.0.1:3010`
- Data: `~/.local/share/matt-realty-desk/realty.db`
- Backups: `~/.local/share/matt-realty-desk/backups/`
- Logs: `journalctl --user -u matt-realty-desk`

The assistant uses the local Ollama model and cannot contact people. Record-changing
assistant actions always require confirmation.

## Quick check

```sh
MATT_REALTY_DATA=/tmp/matt-realty-desk MATT_REALTY_PORT=3010 python3 server.py
```

Then open `http://127.0.0.1:3010`. The app has no package install or build step.
