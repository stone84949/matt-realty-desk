# Matt's assistants, setup and message library

Local candidate, October 13, 2026. Production target remains the private
Cloudflare Worker. No source push, merge, database migration, deployment,
ChatGPT account connection or new provider was performed.

## Personality and roles

The executable shared identity and instructions live in
`cloud/assistant-roles.mjs`, alongside profile validation. This is the app's
versioned personality configuration; Markdown files are not automatically
read by the inference model. All roles know they are helping Matt and must use
supplied facts, acknowledge gaps and keep messages as drafts for his review.

| Helper | Tasks | Next move |
| --- | --- | --- |
| Realty Desk | General questions, client summaries, day planning | Review facts and choose a saved contact or reminder |
| Campaign Writer | Newsletters, social copy, template polishing | Check details and recipient permission, then save for review |
| Follow-up Coach | A selected person's check-in | Review wording and schedule the next follow-up explicitly |

The same existing Llama 3.3 70B binding supplies inference. No three-model
deployment or additional provider cost is necessary. Responses include a
separate deterministic next-move field even when model text omits coaching.
Instructions also ask for context-appropriate next moves within advice.
The 100-attempt application cap and existing security protections remain.

## Optional onboarding

Make this desk yours opens a short setup for preferred name, writing tone,
optional brokerage/service area and sign-off. Not now closes it. Help offers
Edit preferences later. Fields are plain, bounded text; they grant no authority.

Preferences persist in this browser only. Matt can repeat setup on another
browser/device. They are sent with AI requests to the existing Cloudflare
provider. No new settings database/migration was added. Three-role setup is
hosted-only; the legacy local HP AI is unchanged. Non-AI templates work locally.

## Reusable templates

16 templates cover new leads, buyer and seller check-ins, quiet leads,
appointments, property visits/sharing, new-home and sale congratulations,
settling in, home anniversaries, referrals, feedback, holidays, New Year and
useful updates. Definitions live in `static/desk-templates.js`.

Known first names and owner signatures fill automatically. Property addresses,
anniversaries, appointment dates and other occasion facts are supplied manually;
a stored address does not establish a sale, purchase or anniversary. Unfilled
values remain visible as labeled blanks. Matt must confirm the occasion and
details before saving or requesting polishing. Saved email permission is shown;
confirmation does not convert Not asked or Unsubscribed into marketing consent.

Preview uses a readable letter layout. Saved messages remain plain-text campaign
drafts in the existing schema; the visual preview is not an outbound HTML-email
renderer. Any assistant can open the library with its selected person; optional
polishing routes to Campaign Writer. Nothing sends, posts or schedules itself.

## Verification and review

Synthetic preview: http://127.0.0.1:5064/ on BEAST. Restart from this checkout:

```powershell
$env:PREVIEW_PORT='5064'
$env:PREVIEW_ASSISTANT='1'
node cloud/tests/local-preview.mjs
```

The database and AI answer are synthetic fixtures. No real contacts were used.
Earlier Phase 1 and the follow-up padding fix are included in this task branch.
The original source and prior Phase 1 worktree were preserved.

Review: open setup; save a tone/signature; refresh; select each assistant; choose
a template and person; confirm missing event facts stay blank; complete the
fields and review; save; refresh Campaigns; try optional polishing. Repeat at
390px width. Change an edited template/contact and choose Keep this message.

Actual checks: 68 passing Node regression tests, 14 passing Python tests, Worker checkJs, changed
JavaScript syntax, git diff --check and Wrangler 4.145.0 deploy --dry-run.
Browser checks confirmed preference/draft persistence, role routing, separate
next moves, missing-field/occasion gating, edited-input retention after a failed
save and template change, and desktop/mobile layout. Mobile dialog overflow was
found and repaired. Model answers were synthetic; live quality and account
allowance were not tested. HP runtime was not accessed.

Independent code review: APPROVE after the in-flight polishing and recipient identity fixes.
Saved draft metadata retains the full saved name, stable contact reference and
permission-at-drafting snapshot. This snapshot never authorizes sending.

No migrations or new dependencies. Cross-device preference sync, broader
activity-history AI context, HTML email export/delivery, ChatGPT OAuth and live
model evaluation remain separate work. Publication/canonical acceptance/release
guard and deployment verification remain pending the user's separate approval.

Changed source: cloud/assistant.mjs, cloud/assistant-roles.mjs,
static/hosted-assistant.js, static/desk-personalization.js,
static/desk-templates.js, static/index.html and static/styles.css.
Tests: cloud/tests/assistant.test.mjs, roles.test.mjs, templates.test.mjs and
profile.test.mjs. This document is the local handoff report.
