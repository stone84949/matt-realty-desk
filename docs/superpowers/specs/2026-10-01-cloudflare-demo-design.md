# Cloudflare CRM demo design

## Purpose and authorization

Josh approved a separate Cloudflare-hosted demo of the existing Matt Realty Desk
on October 1, 2026. Matt should use a private browser bookmark on his Mac without
depending on the HP, Codex authentication, or local AI. The HP deployment remains
untouched. Reuse the existing UI and relational data model, not the larger Twenty
fork. The session's standing autonomy instruction authorizes execution of the
agreed demo scope without additional routine design permission prompts.

## Scope

Port contacts, exact-record import skipping, summaries, reminders, activity,
draft campaigns and exports to a JavaScript Worker with D1. No new application
runtime dependencies. Keep the Python local runtime available. Local AI and voice
are explicitly unavailable in the demo; explain this without breaking core work.
The demo contains invented records only. Real contacts and private exports never
enter Git, logs, browser diagnostics, or this deployment.

## Boundaries

All static assets and API routes require a validated Cloudflare Access JWT and
an exact configured email allowlist. Validate signature, issuer, audience, expiry
and not-before; fail closed for missing config, identity or unavailable keys.
No trust in the plain email header. No production auth bypass. Route all assets
through the Worker before the ASSETS binding. Preview URLs use the same checks.
Writes require JSON and a matching Origin plus non-cross-site fetch metadata.
Reject unknown routes/methods and cap bodies/import counts. Avoid recording PII.
Access policy changes are a concrete final browser approval step after the demo
is built and reviewable. Matt's email is requested; do not guess it.

## Data and recovery

Dedicated D1 database; do not share AisleScore tables or alter its application.
Use batch transactions and conditional inserts to retain shared emails/phones
while skipping identical imported fields. Validate all rows before writing.
Do not mark imports opted in. Keep imported secondary data in Notes as in the
approved compatibility importer; complete multi-value fields are future work.
Offer an authenticated full JSON snapshot download containing contacts, tasks,
activities and campaigns. Verify snapshot restore into a separate database with
counts, content and foreign-key checks. CSV is a contact export, not a full backup.
Document D1 Time Travel and private off-provider snapshot storage; do not claim
automatic backup schedules exist before their installation and live verification.

## Acceptance

Denied anonymous/wrong-identity requests cannot read assets, API, exports or
snapshots. Forged tokens, wrong audience/issuer and expired tokens are denied.
Cross-origin writes are rejected. Core UI operations work on desktop/mobile;
unavailable local features are explained. Synthetic import parity and concurrent
duplicate behavior pass. Full recovery works. Publish/review the code and promote
the exact revision before release guard and cloud deployment. Verify live login,
denied anonymous access and core API behavior before calling hosting complete.
