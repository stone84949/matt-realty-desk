#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != Linux ]] || ! command -v pacman >/dev/null; then
  printf '%s\n' 'This helper is for the Omarchy HP only. Stop here on a Mac or Windows computer.'
  exit 1
fi

printf '%s\n' 'Keep Josh on the phone.' \
  'First accept the private Tailscale invitation Josh prepared, using your own account.' \
  'This enables private maintenance access governed by that network access rules.' \
  'It does not change contacts, fix Codex, expose the CRM, or start public SSH.' \
  'Enter your HP password locally if sudo asks. Do not send anyone that password.'

if ! command -v tailscale >/dev/null; then
  sudo pacman -S --needed tailscale
fi
sudo systemctl enable --now tailscaled

state="$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin).get("BackendState", "Unknown"))')"
if [[ "$state" == Running ]]; then
  printf '%s\n' 'Tailscale is already connected. Ask Josh to verify the correct network and access rules.' \
    'Do not switch accounts or enable additional access until that is checked.'
else
  sudo tailscale up --ssh
  printf '%s\n' 'Open the displayed login link. Use the account that accepted the invitation.' \
    'If several networks are offered, choose the one Josh identifies.'
fi

printf '\n%s\n' 'Read these to Josh. They are an address and your local username, not passwords:'
tailscale ip -4
id -un
printf '\n%s\n' 'Network setup finished. Josh must test access before it is considered working.' \
  'For an already connected device, Josh may direct: sudo tailscale set --ssh' \
  'Leave the HP powered on and connected to Wi-Fi.'
