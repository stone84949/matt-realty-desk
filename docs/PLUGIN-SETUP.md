# Curated Omarchy Plugin Setup

This runbook is for Josh or Matt's maintenance agent. Matt reviews the local
guide at `http://127.0.0.1:3010/plugin-guide.html`; he does not run these
commands.

Omarchy Quattro already includes its plugin manager under **Setup > Plugins**
and through `omarchy plugin`. Omaplug is an optional owner-facing manager, not a
prerequisite for the built-in system.

Third-party shell plugins run as unsandboxed code with Matt's user permissions.
The canonical review catalog is `docs/plugins-reviewed.json`. The four initial
repositories below were reviewed on 2026-09-28. Installation clones each
repository **disabled**, checks out the reviewed commit, validates it, and only
then enables it. If the reviewed commit is unavailable, stop.

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
   `git ls-remote <repository-url> refs/heads/main`. A changed `main` does not
   alter the pinned install below; review the diff before updating the catalog.
3. Create a timestamped owner-only backup of:
   - `~/.config/omarchy/shell.json`
   - `~/.config/hypr/bindings.lua`
   - `~/.config/omarchy/plugins/`
4. Record the current bar layout and take a screenshot.
5. Keep an existing terminal open. Install and verify plugins one at a time so a
   broken shell can be recovered without guessing which change caused it.

## Approved Initial Installs

For each plugin, run the four commands in order. When `omarchy plugin add` asks
whether to enable the plugin, answer **No**. Cloning does not execute plugin
code; do not enable it until the detached checkout and validation succeed.

### Omaplug

```bash
omarchy plugin add https://github.com/fross100/omaplug.git
git -C ~/.config/omarchy/plugins/omaplug checkout --detach 9da73fc13fc2027be5b44915b4ab89440beb74ab
omarchy plugin validate ~/.config/omarchy/plugins/omaplug
omarchy plugin enable omaplug
```

### Which Key

```bash
omarchy plugin add https://github.com/huacnlee/omarchy-which-key.git
git -C ~/.config/omarchy/plugins/huacnlee.which-key checkout --detach fba0cdb472c90eb5a4e8bb5113030d087024a805
omarchy plugin validate ~/.config/omarchy/plugins/huacnlee.which-key
omarchy plugin enable huacnlee.which-key
```

### Expose

```bash
omarchy plugin add https://github.com/kristofferR/omarchy-expose.git
git -C ~/.config/omarchy/plugins/expose.window-overview checkout --detach 805adb947e634ff4d0c3924cbbe993beae9e3319
omarchy plugin validate ~/.config/omarchy/plugins/expose.window-overview
omarchy plugin enable expose.window-overview
```

### Notification Center

```bash
omarchy plugin add https://github.com/jankeesvw/omarchy-notification-center.git
git -C ~/.config/omarchy/plugins/jankeesvw.notification-center checkout --detach e4c4568daaf93751097f86a79f98b35c4c00da44
omarchy plugin validate ~/.config/omarchy/plugins/jankeesvw.notification-center
omarchy plugin enable jankeesvw.notification-center
```

Do not install OmaSettings, Better Bluetooth, Omarchy Tray, Decent Workspaces,
Omapager, Vimarchy, Omaland, or Omdrop as part of this initial pass.

## Verify After Each Install

1. Run `omarchy plugin list --json` and confirm the expected plugin id is
   enabled.
2. Confirm the installed checkout equals the catalog's reviewed SHA, then run
   `omarchy plugin validate ~/.config/omarchy/plugins/<plugin-id>`.
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

Automatic update checks may be on or off. Do not apply an individual or bulk
update until every included diff has been reviewed. Before an update, record the
current SHA and copy that plugin checkout into the timestamped backup. After
review, run `omarchy plugin update <plugin-id>`, validate the new checkout,
verify shell health, and update `docs/plugins-reviewed.json` only after the new
revision is approved.

## Roll Back One Plugin

Use `omarchy plugin remove <plugin-id>` for the plugin just installed. If the
shell cannot render, use the terminal that remained open, restore the backed-up
`shell.json` and `bindings.lua`, then restart the Omarchy shell. Verify the bar,
menu, and standard shortcuts before attempting anything else.

To roll back an update, disable the plugin, restore its prior checkout or detach
the checkout at the previously recorded SHA, validate that exact revision,
re-enable it, and repeat the shell-health check. Do not move the reviewed SHA in
the catalog until the replacement revision has passed review.

## Source Review Notes

- Omaplug can write managed keyboard shortcuts and bar layout changes. Automatic
  checks are optional, but bulk updates require review of every included diff;
  remove Omaplug-managed shortcuts before removing plugins.
- Which Key reads active keybindings and modifier state; it does not register a
  replacement keyboard shortcut.
- Expose has no network, privilege escalation, package installation, or service
  requirement. Do not bind it to `Super + A`, which opens Matt's assistant.
- Notification Center archives notification text and images locally for up to
  its configured retention period. Avoid displaying sensitive previews on a
  shared screen.
