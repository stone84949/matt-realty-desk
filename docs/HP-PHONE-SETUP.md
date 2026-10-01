# One-time HP connection

Keep Matt on the phone. This does not depend on Codex or Dropbox being signed in
on the HP. If Dropbox works only on his Mac, he can open Dropbox in the HP browser
and download the helper after signing in with the same account. Sending this
nonsecret helper as an attachment is also possible; no email has been sent.

## Josh prepares access first

Use the Tailscale admin console to prepare a restricted support network and invite
Matt as a Member using his own account. Do not give him your account or make him an
administrator. Before enrolling his HP, restrict network access so Matt cannot
reach unrelated home-lab devices. Add a tagged-device SSH rule for the HP allowing
only Josh's actual identity to access Matt's actual local username, preferably in
check mode. Also allow the corresponding network connection to port 22. Do not
replace the entire existing policy with an example or grant all members access.

The tag intentionally treats this dedicated CRM HP as an administrator-managed
support endpoint. Tags replace the device's Tailscale user identity; they are not
appropriate for Matt's personal Mac or a general personal laptop. Josh alone owns
the support tag. If the HP is used as a personal device instead, stop and use a
reviewed user-owned-device access policy rather than this tagged endpoint setup.

If using Josh's existing network, review and restrict its current rules before
sending the invitation. Tailscale SSH is not automatically authorized merely by
installing the client. Device sharing has additional SSH restrictions; this
walkthrough uses an invited member and an administrator-tagged HP instead.

## Matt's short steps

1. Accept Josh's invitation in his browser using his own account.
2. On the HP, download `Matt-HP-Connect.sh` into Downloads.
3. Open Terminal from the application launcher and paste:

   ```bash
   bash "$HOME/Downloads/Matt-HP-Connect.sh"
   ```

4. If asked, enter the HP login password locally. It will not show while typing.
   If installation asks whether to proceed, confirm the Tailscale package.
5. Open the login link shown by Tailscale. Use the invited account and select the
   network Josh identifies. Read Josh the final address and local username.

If the browser changed the filename (for example adding `(1)`), use the downloaded
file's actual name. If an installation or login step fails, stop and read the
error to Josh; do not reset accounts, remove files, or paste token files.

## Josh verifies

Apply the HP-only tag and exact user/network SSH rules. If the helper reported an
already-connected device, first confirm the correct network, then have Matt run
`sudo tailscale set --ssh`. Connect with `tailscale ssh username@address`, confirm
`whoami` and the intended host, and reconnect after a reboot. Test that access to
unrelated devices is denied. Network setup is pending until these checks pass.

Once connected: inspect runtime revision and database counts; take and verify a
pre-change backup; use the release guard; deploy the reviewed importer; confirm
existing demo data before separating it; import the private prepared file; verify
all added records and a copied backup restoration. Keep the CRM on loopback. Its
current HTTP server is not ready for direct network exposure.

This helper starts the Tailscale service at boot. Unattended maintenance still
depends on power, networking, device authorization and any encrypted-disk unlock.
Disable Tailscale SSH with `sudo tailscale set --ssh=false` when withdrawing
maintenance access. Stopping/disabling `tailscaled` also disconnects private apps.
No ongoing off-machine backup sync is configured by this helper.

Official references:

- https://tailscale.com/docs/install/linux
- https://tailscale.com/docs/features/sharing/how-to/invite-any-user
- https://tailscale.com/docs/features/tailscale-ssh
