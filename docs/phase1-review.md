# Phase 1 local review — October 13, 2026

State: LOCAL, reviewed and ready for publication/deployment approval. Nothing
has been pushed, merged, deployed or applied to production. Live contacts and
Cloudflare Access settings were not accessed or modified during this task.

Preview: http://127.0.0.1:5063/ on BEAST. This is the existing loopback-only
synthetic test harness; its database is in memory and its AI answer is an
explicit synthetic fixture. It is not a production deployment or proof of
current provider model quality. Restart with PowerShell:

```powershell
$env:PREVIEW_PORT='5063'
$env:PREVIEW_ASSISTANT='1'
node cloud/tests/local-preview.mjs
```

Original project: C:\Workspace\Repos\matt-realty-desk.
Task checkout: C:\Workspace\Repos\matt-realty-desk-worktrees\phase1-today.
Branch: work/matt-phase1-20261013. Approved base: 822fea6d0945dcbd7ccbf3a74ea339ac04043e43.

## Changes and simplifications

- Today shows separately due-today, overdue, next-seven-days, and undated items
  from saved reminders and saved contact follow-up dates. No six-item truncation.
- Recent contacts mean recently updated saved contacts; no invented activity.
  Saved campaign drafts link to review; campaign views now show saved draft text.
- Contact actions provide notes, history, scheduling, direct follow-up completion,
  and explicit phone/email shortcuts only when those details exist.
- Quick scheduling retains the selected person and supplies Today, Tomorrow,
  In one week and Choose a date. Existing models/endpoints are reused.
- Hosted draft assistance preselects the person and reminder reason; generation
  still requires a separate click. Existing bounded assistant and quota remain.
- Saved writes are distinguished from failed refreshes. Unsaved contact edits
  and note drafts are protected when moving to scheduling or drafting.
- Existing identity/palette retained; comfortable action targets and mobile layout.

Changed files:

- cloud/api.mjs — expose the existing configured desk timezone in summary.
- static/today.js — date-only arithmetic and saved-record grouping.
- static/app.js — Today, contact actions, scheduling and error handling.
- static/hosted-assistant.js — existing follow-up preset/context shortcut.
- static/index.html — Today sections, date script and unsaved-edits dialog.
- static/styles.css — action sizing, wrapping and readable draft text.
- cloud/tests/today.test.mjs — calendar/grouping regressions.
- cloud/tests/ui.test.mjs — startup, saved-write and dirty-edit regressions.
- docs/phase1-review.md — this local review report.

## Actual verification

- node --test cloud/tests/*.test.mjs: 59 passed, zero failed.
- python -m unittest discover -s tests: 14 passed. Existing Python resource
  warnings remain; they did not fail tests. Node SQLite emits an experimental warning.
- Existing cached TypeScript checkJs on all four production Worker modules: passed.
- node --check on the changed JavaScript files: passed. No dedicated frontend
  typecheck or lint configuration exists; syntax and git diff --check passed.
- Cached Wrangler 4.145.0 deploy --dry-run with the checked-in placeholder config:
  passed; no deployment. No new dependency installation.
- Independent code reviewer: APPROVE after fixes and regression checks.
- Chrome synthetic preview at 1440px and 390px: inspected visually, no document
  horizontal overflow; contact dialog fits mobile viewport.
- Browser-created contact/reminder/note persisted after page refresh. Both reminder
  and direct contact-date completion persisted; contact history updates correctly.
- Archived contact reminder excluded. Selected person retained during scheduling.
- AI preselection and synthetic answer passed. Injected AI failure preserved input.
- New York UTC-midnight, DST, month/year and leap-day tests passed. Hosted dates use
  TIME_ZONE, default America/New_York; local desktop dates use the browser zone,
  preserving local usage. HP/browser/server timezone alignment has not been verified
  on Matt's computer; the local server was left unchanged.

## Manual preview checklist

1. Open Today; distinguish overdue, today and upcoming items.
2. Open a contact; add a note, view history and refresh the page.
3. Schedule a follow-up for Tomorrow; confirm its person and saved date.
4. Complete a reminder and a contact follow-up; verify the lists update.
5. Edit a contact field, then Schedule; choose Keep editing to retain the change.
6. Open Help me draft; verify the selected contact, review the request, then generate.
7. Open Campaigns and read a saved draft. Nothing is sent.
8. Repeat the main actions at narrow mobile width.

## Remaining risks and deferred work

No migrations or configuration changes required. No new dependencies, provider,
CRM framework, sending capability, public preview or auth bypass introduced.

Live sign-in, live model behavior, production data compatibility at actual scale,
and Matt's HP were not exercised. Existing automated import/export, separate
snapshot restoration and authorization tests pass, but no production restore ran.
The UI renders the existing full active-contact/task responses; unusually large
datasets may need separately scoped pagination. Contact dates and tasks are distinct
saved actions and can both appear for a person; completing one does not erase the other.

The current hosted assistant uses contact.notes, not the activity-note history.
Expanding AI context to activity notes is a Phase 2 backend dependency; this task
deliberately reuses only the existing supported context. Campaign editing/provider
delivery and off-provider backup automation remain outside Phase 1.

Ready for Josh's approval of publication and deployment preparation. Canonical
Vault/Mission Control acceptance, source publication, project-home publication and
release guard remain pending because the assignment requires stopping before push,
merge or deployment. Existing root HTML pointers and unrelated original edits are preserved.
