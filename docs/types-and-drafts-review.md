# Contact types and reusable drafts — local review, October 13, 2026

State: LOCAL, independently reviewed. No push, merge, deployment or live contact
changes in this task. Production remains source4984f633.

Preview: http://127.0.0.1:5065/ on BEAST. It uses invented in-memory records and
an explicit synthetic AI answer. It is not a deployed service or live-model test.
Original project: C:\Workspace\Repos\matt-realty-desk.
Task checkout: C:\Workspace\Repos\matt-realty-desk-worktrees\types-drafts.
Branch: work/matt-types-drafts-20261013; base4984f63325262251ff884184b44e261cd8fa0d62.

## Result

- Contacts have an All relationship types filter alongside search, stage and
  current/deleted selection. Saved custom/imported types remain available;
  no records are reclassified. Stale search responses cannot replace newer results.
- Saved Draft records have Edit draft and Create a copy actions. Edits retain
  ID, original creation time and unchanged recipient metadata; copies receive a
  new ID and preserve the original. Copy labels survive maximum-length names.
- Draft edits require the saved revision. A concurrent change returns a clear
  conflict, preserves input and permits making a new copy rather than overwriting.
- Campaign Writer can polish an existing draft. Review changes opens editable
  fields and retains its identity/revision; nothing is stored until explicit Save.
- New generated follow-up/newsletter/social wording can be reviewed and saved as
  a draft. Social wording is labeled Social draft. Saving reviewed AI output updates
  the review target to the actual saved record, avoiding accidental duplicate saves.
- Save/generation controls lock while requests run; failed writes keep input.
  Saved data is distinguished from a failed view refresh.

Existing contact, campaign and assistant models/endpoints are reused. No migration,
new dependency, provider, sending capability or permission expansion. Cloud and
local Python API support the same type filter and guarded campaign PATCH.

## Verification

- 74 Node tests pass, including combined type filters, preserved draft identity,
  stale/omitted revisions, non-Draft protection, copy-name boundary and AI metadata.
- 15 Python tests pass, including type/draft parity against temporary invented data.
- Production Worker checkJs, changed JS syntax, git diff --check and cached
  Wrangler4.145.0 deploy --dry-run pass.
- Independent code reviewer APPROVE after required-revision, Social draft and
  copy-label fixes. No remaining actionable persistence/security/race finding.
- Browser: edit persisted without an extra row; copy preserved original;
  edited AI-polished text replaced only its chosen draft and retained latest revision;
  stale write conflicted without losing input; new copy rescued unsaved wording;
  social output persisted with Social draft channel.
- Desktop and390px mobile checked. Type filter includes synthetic Investor type;
  draft dialog fits even with a long saved-recipient label. No document overflow or
  console errors. Contacts table keeps its existing internal horizontal scrolling.

## Review checklist

1. Open Contacts. Combine Buyer/type, Active/stage and a name search; reset them.
2. Choose Campaigns → Edit draft. Change wording, save, refresh and reopen.
3. Create a copy. Change its name/body and verify the original stays unchanged.
4. Open Edit draft → Polish with Campaign Writer → Ask assistant.
5. Choose Review changes to saved draft, edit the wording and Save.
6. Generate a new social draft and check its channel in the review form.

## Changed files and remaining limits

Source: cloud/api.mjs; server.py; static/app.js; static/index.html;
static/hosted-assistant.js; static/styles.css.
Tests: cloud/tests/api.test.mjs; cloud/tests/ui.test.mjs;
tests/test_drafts_and_types.py. Report: this file.

Publication, canonical acceptance and deployment remain pending review/approval.
No live migration is required. For deployment, repeat private backup/restore and
preservation checks. Existing campaign PATCH callers must provide expected_updated_at
from the record they opened; the new UI does this. The HP runtime was not accessed.
AI requests still have the existing 2,000-character limit; longer saved drafts must
be shortened before polishing. No live model quality evaluation occurred.

The deployed quick-start guide should be updated with the review/save action when
this release goes live. Expanded activity-note AI context, cross-device preferences
and automatic private backups are the later priorities, outside this two-item task.
