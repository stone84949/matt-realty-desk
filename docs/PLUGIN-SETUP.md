# Curated Omarchy Plugin Setup

This runbook is for Josh or Matt's maintenance agent. Matt reviews the local
guide at `http://127.0.0.1:3010/plugin-guide.html`; he does not run these
commands.

Omarchy Quattro already includes its plugin manager under **Setup > Plugins**
and through `omarchy plugin`. Omaplug is an optional owner-facing manager, not a
prerequisite for the built-in system.

Third-party shell plugins run as unsandboxed code with Matt's user permissions.
The four repositories below were reviewed on 2026-09-28. If `main` no longer
matches the reviewed commit, stop and review the diff before installation.

| Plugin | Reviewed `main` revision |
|---|---|
| Omaplug | `9da73fc13fc2027be5b44915b4ab89440beb74ab` |
| Which Key | `fba0cdb472c90eb5a4e8bb5113030d087024a805` |
| Expose | `805adb947e634ff4d0c3924cbbe993beae9e3319` |
| Notification Center | `e4c4568daaf93751097f86a79f98b35c4c00da44` |

## Preflight

1. Confirm Omarchy is current and inspect installed plugins:

   ```bash
   omarchy plugin list --json
   ```

2. Compare each remote `main` SHA to the reviewed revision above with
   `git ls-remote <repository-url> refs/heads/main`. Do not install a changed
   revision until its diff has been reviewed.
3. Create a timestamped owner-only backup of:
   - `~/.config/omarchy/shell.json`
   - `~/.config/hypr/bindings.lua`
   - `~/.config/omarchy/plugins/`
4. Record the current bar layout and take a screenshot.
5. Keep an existing terminal open. Install and verify plugins one at a time so a
   broken shell can be recovered without guessing which change caused it.

## Approved Initial Installs

Run one command, complete its safety prompt, verify it, and only then continue
to the next command.

```bash
omarchy plugin add https://github.com/fross100/omaplug.git --enable
omarchy plugin add https://github.com/huacnlee/omarchy-which-key.git --enable
omarchy plugin add https://github.com/kristofferR/omarchy-expose.git --enable
omarchy plugin add https://github.com/jankeesvw/omarchy-notification-center.git --enable
```

Do not install OmaSettings, Better Bluetooth, Omarchy Tray, Decent Workspaces,
Omapager, Vimarchy, Omaland, or Omdrop as part of this initial pass.

## Verify After Each Install

1. Run `omarchy plugin list --json` and confirm the expected plugin id is
   enabled.
2. Run `omarchy plugin validate ~/.config/omarchy/plugins/<plugin-id>`.
3. Confirm the Omarchy bar and menu still render and ordinary shortcuts work.
4. Exercise the plugin's single expected behavior:
   - Omaplug opens its plugin list and shows update status.
   - Which Key appears after holding Super; enable it from its widget settings
     if necessary.
   - Expose opens from the top-left hot corner and closes with Escape.
   - Notification Center opens from the bell and retains a test notification.
5. Record the installed checkout revision with
   `git -C ~/.config/omarchy/plugins/<plugin-id> rev-parse HEAD`.
6. Check recent shell logs and stop if new errors repeat.

Do not enable automatic bulk updates. For future updates, run
`omarchy plugin update <plugin-id>`, review the diff shown by Omarchy, then
confirm only the reviewed update.

## Roll Back One Plugin

Use `omarchy plugin remove <plugin-id>` for the plugin just installed. If the
shell cannot render, use the terminal that remained open, restore the backed-up
`shell.json` and `bindings.lua`, then restart the Omarchy shell. Verify the bar,
menu, and standard shortcuts before attempting anything else.

## Source Review Notes

- Omaplug can write managed keyboard shortcuts and bar layout changes. Keep
  automatic updates off and remove its shortcuts before removing plugins.
- Which Key reads active keybindings and modifier state; it does not register a
  replacement keyboard shortcut.
- Expose has no network, privilege escalation, package installation, or service
  requirement. Do not bind it to `Super + A`, which opens Matt's assistant.
- Notification Center archives notification text and images locally for up to
  its configured retention period. Avoid displaying sensitive previews on a
  shared screen.
