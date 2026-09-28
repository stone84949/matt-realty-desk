# Matt Realty Desk Guided Onboarding and Complete Contacts Design

**Date:** 2026-09-28
**Status:** Approved design, pending implementation plan
**Audience:** Matt, Josh, and agents maintaining Matt's dedicated Omarchy HP

## Purpose

Matt Realty Desk should welcome Matt like a patient chief of staff, finish the
small amount of machine setup he needs, and make it unmistakable when setup or a
task is complete. Contact import must retain every useful item from an iPhone
vCard instead of silently choosing one phone number or flattening information
into Notes.

The HP is dedicated to the CRM and a few supporting tools. Matt's MacBook remains
the home for his important personal work. The design therefore favors a focused,
local, forgiving experience over a general-purpose automation platform.

## Success Criteria

1. Matt can complete first-run setup without copying terminal commands.
2. Matt chooses the assistant's name and can change it later.
3. Yahoo Mail is reachable from a prominent CRM button and an Omarchy web-app
   shortcut without storing Yahoo credentials in the CRM or repository.
4. Routine local CRM edits and ordinary local installs do not require repeated
   confirmations.
5. Email, text, social posting, and every other outbound communication always
   remain draft-and-confirm.
6. Destructive, bulk, credential, security-boundary, and externally visible
   actions require explicit confirmation.
7. Import preserves all useful vCard values, labels, photos, and unfamiliar
   contact properties locally.
8. The compact contact list stays readable while the contact detail view shows
   every stored value.
9. Search and export operate across all phone numbers, emails, and addresses.
10. Real vCards, contact data, credentials, and CRM databases never enter Git.

## Evidence From the iPhone Test Export

The corrected supplied vCard was inspected locally without printing or copying
contact values. It contains six vCard 3.0 contacts, six phone values across four
contacts, one email, two postal addresses, two organizations, one birthday, one
website, one note, two embedded photos, and two Apple custom labels.

The current importer recognizes all six names but would expose only three of the
six phone values, preserve the email, lose both addresses, flatten organizations
into Notes, and lose the birthday, website, photos, and some Apple labels. This
is a data-loss defect and must be covered by regression tests before the full
address book is imported.

The real test export remains outside the repository. Repository fixtures must
use invented people and values only.

## User Experience

### First-Run Guide

The CRM opens a deterministic five-step guide until it is completed or
explicitly skipped:

1. **Meet your assistant** - explain the chief-of-staff role and let Matt choose
   a name.
2. **How help works** - explain automatic routine local work, draft-and-confirm
   outbound communication, and the smaller confirmation boundary for risky
   actions.
3. **Connect email** - open Yahoo Mail in the browser for Matt to sign in, then
   show how the CRM Email button and Omarchy shortcut return to it.
4. **Bring in contacts** - select a vCard, inspect a private preview, and import
   only after the bulk-action confirmation.
5. **Ready** - show the CRM, Email, Assistant, Help, and support shortcuts and
   state plainly that setup is complete.

The guide stores its current step in the local SQLite `app_settings` table,
resumes after interruption, supports Back and the explicitly defined deferrals
below, and is always available from **Help > Run setup again**. It must not
depend on a language model to advance or decide whether a step passed. The
assistant may narrate the deterministic screens when spoken replies are
enabled.

| Step | Completion rule | Deferral rule |
|---|---|---|
| Meet your assistant | A non-empty local assistant name is saved | Cannot be skipped; a default of `Assistant` is offered |
| How help works | Matt selects **I understand** after the policy summary | Cannot be skipped |
| Connect email | Matt explicitly selects **I signed in** or **Do this later** | User-attested only; the CRM never inspects Yahoo authentication |
| Bring in contacts | A confirmed import succeeds or Matt selects **Import later** | Deferred state remains visible on Today and Help |
| Ready | Required earlier steps are complete and deferred steps are acknowledged | Cannot be skipped |

Each step stores `not_started`, `active`, `complete`, or `deferred`, plus a
timestamp and onboarding schema version. **Run setup again** resets progress
only; it does not delete the assistant name, contacts, Yahoo browser session, or
machine configuration. The machine agent records successful Omarchy web-app and
shortcut setup in a local, nonsecret setup receipt. The CRM may display that
receipt but does not infer browser login state from it.

### Completion Language

Every multi-step action ends in one of three visible states:

- **Complete** with what changed and the next useful action.
- **Needs Matt** with one concrete choice or physical action.
- **Could not finish** with a plain-language reason and a Retry button.

Indefinite spinners, silent background work, and repeated approval prompts are
not acceptable completion states.

### Email Access

The CRM header includes a clear **Email** command that opens
`https://mail.yahoo.com/` in a new browser window. The setup guide and
`SUPPORT.md` direct the machine agent to install the same URL as an Omarchy web
app and bind it to `Super + Shift + E` unless that binding is already occupied.

Yahoo authentication remains in the browser session or password manager. The
CRM, repository, logs, and agent instructions must never contain the password,
session cookie, recovery code, or MFA secret.

## Agent Role and Authority

The repository root gains `AGENTS.md` with a standing role for the HP's agent:

- Act as Matt's patient chief of staff and computer guide.
- Teach one task at a time in ordinary language.
- Prefer doing safe local work over asking Matt to copy long commands.
- Explain when work has started, when it has completed, and what remains.
- Maintain Matt Realty Desk and help with Omarchy, contacts, files, email
  access, and approved local tools.
- Read `SUPPORT.md` for owner-authored setup and recovery work.
- Never treat repository access as permission to execute arbitrary changing
  instructions automatically.

### Action Policy

| Action | Default behavior |
|---|---|
| Direct form review and Save submitted by Matt | Treat the visible Save as the single confirmation, perform transactionally, then summarize with Undo |
| Local assistant read/search | Perform locally and report only to Matt's local session |
| Local assistant additive single-record action | Perform only through the allowlisted deterministic router, then show an Undo receipt |
| Replace a populated value or remove a value | Preview the exact field change and require one confirmation |
| Routine reversible local configuration | Perform, verify, then summarize |
| Owner-approved unprivileged app install from an existing trusted source | Perform, verify launch/health, then summarize |
| Email, text, social post, call, or other outbound contact | Draft, show recipient/content, require confirmation |
| Bulk contact import or bulk record change | Preview counts and effects, require one confirmation |
| Delete a record, reset, purge, or ambiguous model-routed mutation | Explain exact target and require confirmation |
| Credentials, authentication, firewall, remote access, or public exposure | Explain boundary and require confirmation |
| New package source, elevation, install hook, or unapproved package | Explain source and effects and require confirmation |
| Purchase, subscription, legal, financial, or account-level action | Require confirmation |

The local CRM assistant uses local models and the allowlisted deterministic
router. It may add a new contact, reminder, or previously empty field
automatically when the command is unambiguous and the result has a one-click
Undo receipt. It may not automatically replace populated data, delete, merge,
or perform a bulk action. Confirmation is one clear decision for the
consequential action, not a sequence of repetitive prompts.

The repository maintenance agent is a separate authority. It works from schema,
aggregate counts, redacted diagnostics, and synthetic fixtures. It must not send
contact values, raw vCards, CRM rows, photos, notes, or exports to an external
model, tool, log, or transcript. Any PII egress requires explicit, narrowly
scoped owner authorization that names the data and destination.

Automatic-action Undo receipts are single-use inverse operations stored with
the affected record id, expected row version, expiry, and action id. They expire
after ten minutes and refuse to run if the record or any dependent row changed
after the action. Undoing a newly created contact is allowed only while no later
activity, reminder, method, address, or detail depends on it; otherwise the UI
routes Matt to an explicit reviewed edit and never cascades newer work.

## Contact Data Model

Normalized collections are the canonical representation for contact methods,
addresses, details, photos, and provenance. The existing `contacts` table
remains the stable identity and summary record so current data can migrate
without a destructive rewrite. Its existing phone, email, and address columns
become read-only compatibility projections of preferred normalized values; no
endpoint, importer, form, or assistant may write those cache columns directly.

All contact creation and mutation routes through one `ContactService` transaction
that validates normalized rows, selects primaries, refreshes compatibility
projections, writes the audit/Undo receipt, and commits atomically. Form saves,
the local assistant, CSV/vCard import, migration, and future integrations use
this service rather than independent SQL statements.

### Contact Methods

Add `contact_methods`:

| Column | Purpose |
|---|---|
| `id` | Stable row identifier |
| `contact_id` | Owning contact |
| `kind` | `phone`, `email`, `url`, or `social` |
| `label` | Home, work, mobile, iPhone, custom Apple label, and so on |
| `value` | Original display value |
| `normalized_value` | Search and duplicate comparison value |
| `is_primary` | Preferred value for compact surfaces |
| `is_shared` | Explicit owner-marked household/shared identifier; never inferred automatically |
| `sort_order` | Original/imported order |
| timestamps | Audit and synchronization support |

A contact may contain any number of methods. Foreign keys use `ON DELETE
CASCADE`; `kind` and `is_primary` have `CHECK` constraints; sort order is
nonnegative; and `(contact_id, kind, normalized_value)` is unique. A partial
unique index permits at most one primary method per contact and kind. The
service invariant requires at least one primary when values of that kind exist
and promotes the first remaining value when a primary is removed.
`is_shared` defaults to false. Import never sets it automatically. Matt may mark
or unmark a phone or email as shared only through the contact detail form, where
the visible review-and-Save action is the confirmation. Any identifier already
attached to multiple contacts is treated as a merge conflict until reviewed.

### Contact Addresses

Add `contact_addresses` with a label, street, secondary line, city, region,
postal code, country, primary flag, sort order, and timestamps. A contact may
have multiple complete home, work, mailing, or custom-labeled addresses.
Addresses use cascade foreign keys, a deterministic normalized fingerprint for
idempotence, nonnegative ordering, and a partial unique primary index. The same
at-least-one-primary service invariant applies.

### Additional Details

Add `contact_details` for useful repeatable or provider-specific values that do
not belong in methods or addresses. Supported structured keys include company,
department, job title, nickname, prefix, suffix, birthday, other dates, related
people, and custom fields. Values retain their original labels and order.
Each row has a normalized property fingerprint and optional source-card id;
`(contact_id, fingerprint)` prevents repeat imports from duplicating details.

### Photos and Raw Source

Keep provenance and assets in SQLite so the existing database backup remains
complete. Add `contact_imports`, `contact_import_cards`, and `contact_assets`:

- `contact_imports` stores a unique whole-file hash, safe display filename,
  import timestamp, parser version, and aggregate outcome.
- `contact_import_cards` stores import id, ordinal, unique card hash, resulting
  contact id, status, warning codes, and original raw vCard text.
- Methods, addresses, and details may reference their source-card id and carry a
  stable property fingerprint.
- `contact_assets` stores validated raster photo bytes, MIME type, dimensions,
  hash, and source-card id as SQLite BLOB data.

Raw sources are local-only, omitted from ordinary API responses, protected by
the same owner-only file boundary as the CRM database, and included in local
backups.
Technical fields such as `VERSION`, `PRODID`, `UID`, and `REV` stay preserved in
the raw card but remain hidden from Matt's normal UI.

### Migration

Database initialization adds the new tables and indexes idempotently. Existing
non-empty phone, email, and address columns are backfilled through
`ContactService` as primary structured values. The migration records its schema
version and can be rerun without duplicating data. Existing APIs continue
returning preferred summary projections while new detail payloads include the
complete collections.

Migration and every write assert that projections equal the selected primary
rows. A reconciliation command reports and repairs drift transactionally. The
deployment preserves and verifies a pre-migration database copy. Rollback stops
the service, restores that database copy with owner-only permissions, switches
to the old revision, and only then restarts. The old binary must never run
against the migrated database because it cannot enforce normalized authority.

## vCard Import Architecture

Move vCard interpretation from browser-only JavaScript into a dedicated,
standard-library-only Python module so the same parser powers preview, commit,
tests, and future reprocessing. No new package dependency is required. The
supported semantic dialect is vCard 3.0 and 4.0 text properties plus the Apple
group/label conventions covered by fixtures. Unsupported constructs remain in
the raw card and produce a visible warning; they are never claimed as parsed.

The parser must:

- Unfold vCard lines correctly.
- Parse vCard 3.0 and 4.0 property names, groups, parameters, and labels.
- Associate Apple's `itemN.X-ABLabel` values with grouped properties.
- Decode escaped text, quoted-printable text, declared character sets, and
  base64 photos.
- Preserve multiple `TEL`, `EMAIL`, `ADR`, `URL`, social, date, relationship,
  organization, title, and note properties in source order.
- Choose preferred values from `PREF` metadata and deterministic fallbacks.
- Normalize phones and emails for duplicate comparison without altering the
  displayed original.
- Preserve unfamiliar nontechnical properties under Additional details and in
  the raw source.
- Treat every text, label, URL, note, filename, and photo as untrusted input.
- Reject fatal file errors and quarantine per-card/per-property errors according
  to the error taxonomy below.

CSV remains supported. CSV values enter the same normalized contact model,
using available headings and a single primary value when the file exposes only
one column of a kind.

## Import Flow

1. The browser sends the selected local file to a preview endpoint over the
   protected loopback CRM session.
2. The server validates size and format and parses the complete file without
   writing contacts.
3. The preview reports contact count; counts by phone, email, address, photo,
   and custom field; and a per-card Create, Merge, Conflict, or Invalid outcome.
   It lists warning categories and whether any property remains raw-only.
4. Matt or the agent gives one confirmation for the bulk import.
5. Before mutation, the server creates and verifies an owner-only SQLite backup.
   Backup failure prevents the import from starting.
6. The server imports the staged, hashed preview in one SQLite transaction.
7. Transaction failure rolls back every imported change. A post-commit backup
   is attempted separately; its failure is reported as a warning and does not
   falsely describe the already committed import as failed.
8. Success reports imported, merged, duplicate, invalid, conflict, and
   preserved-detail counts plus the verified pre-import backup path.

Every API request that reads or writes CRM data requires an exact loopback Host
allowlist and a valid SameSite session. Sensitive reads also reject cross-site
Fetch Metadata and disallowed Origin values. Every mutation additionally
requires same-origin Origin validation, strict JSON content type where
applicable, and a cryptographically random CSRF header token. CORS is disabled.
Exports use a CSRF-protected POST that returns the attachment to the initiating
session; there is no unauthenticated GET export URL. Preview tokens are random,
single-use, memory-only, expire after ten minutes, and are bound to the source
hash and browser session. Restart, expiry, replay, or a changed file requires a
new preview.

## Duplicate and Merge Rules

Duplicate detection compares all normalized phone and email values, not only
the preferred ones. A merge candidate is automatic only when every matching
identifier resolves to the same single existing contact and none of those
identifiers has its persisted `is_shared` flag. If phone and email point to different contacts,
an identifier is shared by a household, or more than one candidate remains,
the card is a Conflict. The preview shows each card's intended Create, Merge,
Conflict, or Invalid outcome before confirmation. Merge adds nonduplicate
values but never replaces a populated user-edited value.

Repeated import of the same source is idempotent through whole-file hashes,
per-card hashes, and property fingerprints: it does not create duplicate
contacts, methods, addresses, details, assets, or source records.

## Contact Screens

### Compact List

The list shows name, stage, preferred address, preferred phone/email, and next
follow-up. It does not expand vertically for every imported value.

### Contact Detail

Opening a contact shows labeled sections for:

- Phone numbers
- Email addresses
- Addresses
- Company and work details
- Dates and relationships
- Websites and social profiles
- Notes and additional fields
- Photo, when present

Each repeated item can be added, edited, removed, reordered, and marked
preferred. Empty sections are hidden. Search covers all methods, address parts,
company/work details, and names.

All imported strings render as text, never HTML. Links permit only `https`,
`http`, `mailto`, and `tel` schemes and open with safe opener isolation. Photos
are limited to JPEG and PNG, validated by magic bytes and dimensions, capped at
5 MB decoded and 4096 by 4096 pixels, served with the declared raster MIME type
and `X-Content-Type-Options: nosniff`. SVG, HTML, MIME mismatches, and oversized
or malformed images remain raw-only and are never rendered.

### Export

CSV export remains a portable summary and gains clearly named columns for
additional values where practical. Display exports neutralize values whose
first meaningful character after any Unicode whitespace or control prefix is
`=`, `+`, `-`, or `@`, and values beginning with tab, carriage return, or line
feed, without changing canonical stored values. A new vCard export preserves repeatable
values, labels, addresses, photos, Unicode, and additional fields. Export never
marks a contact as subscribed or sends anything.

## Privacy and Security

- The HTTP service remains bound to `127.0.0.1`; every CRM-data API enforces the
  Host and session boundary, sensitive reads enforce same-site metadata, and
  mutations enforce Origin, CSRF, content type, and no-CORS controls as defined
  above.
- Real contact fixtures, imports, database files, backups, and photos stay under
  the local data directory and are ignored by Git.
- Local data directories are owner-only (`0700`) and files are owner-only
  (`0600`), created atomically without following symlinks. Backups receive the
  same permissions and are periodically restore-tested.
- Import logs contain counts, hashes, and error categories, not contact values.
- Maintenance agents and external models receive schemas, aggregates, redacted
  diagnostics, and synthetic fixtures only unless the owner explicitly
  authorizes a named PII transfer to a named destination.
- Browser credentials and Yahoo sessions remain browser-owned.
- Remote access setup is separately gated because it changes a security
  boundary.
- Contact exports emailed to the same account are deleted from Inbox, Sent, and
  Downloads only after a verified CRM backup exists.
- Deleting a live contact cascades its normalized rows and live source links
  after confirmation. Its `contact_import_cards` row is replaced by a
  nonreversible tombstone containing only hashes, parser version, warning codes,
  timestamps, and deletion reason; raw vCard text and photo BLOBs are removed
  from the live database. Because each source card has its own row, other
  contacts from the same imported file remain intact. Existing immutable backups retain the old data for the
  existing 30-day backup window; the UI states this before purge. An explicit
  owner-approved privacy purge may remove named backup files only after listing
  the exact files and stating that recovery will be impossible.
- Responses set a restrictive self-only Content Security Policy and
  `X-Content-Type-Options: nosniff`.

## Error Handling

- Fatal file errors include an oversized file (20 MB), more than 5,000 cards,
  no recognizable cards, invalid outer encoding, or structurally unsafe binary
  input; these abort preview.
- A card missing usable identity fields is `Invalid`, remains represented in
  the preview and import provenance, and is not committed as a contact.
- A malformed or undecodable property is recoverable when the rest of the card
  is usable: its raw text is retained, the property is marked raw-only, and the
  preview names the warning category without exposing the value.
- A confirmed import commits all valid Create/Merge cards in one transaction;
  Conflict and Invalid cards remain uncommitted and counted. Nothing disappears
  silently.
- A failed pre-import backup leaves the database unchanged. A failed import
  transaction rolls back. A post-commit backup failure reports a warning while
  retaining the successful import and verified pre-import recovery point.
- An interrupted onboarding resumes at the last completed step.
- Yahoo sign-in failure offers Retry and a plain browser fallback without
  blocking the rest of onboarding.
- Every agent-run install or configuration change ends with verified success,
  one required human action, or an explicit failure state.

## Testing Strategy

Tests use Python's standard `unittest` support and Node's built-in test runner
where browser-side behavior requires it. No new runtime dependency is added.

Required fixtures use invented data and cover:

- Basic iPhone vCard 3.0.
- Apple grouped phone and `X-ABLabel`.
- Multiple labeled phones, emails, and addresses.
- Preferred-value selection.
- Folded lines, escaped punctuation, Unicode, quoted-printable, and base64
  photo data.
- Organization, title, birthday, URL, social, relationship, notes, and unknown
  custom properties.
- Malformed and oversized input.
- Repeated import and ambiguous duplicates.
- Backfill from the existing single-value schema.
- Transaction rollback on import failure.
- Search across nonprimary methods and addresses.
- vCard export round-trip without loss of supported values.
- First-run progress, resume, skip, completion, and rerun.
- Action-policy behavior for automatic local edits versus confirmed outbound,
  bulk, destructive, and security-sensitive actions.
- Host/Origin rejection, CSRF absence, wrong content type, token replay,
  session mismatch, expiry, restart invalidation, and hostile-host
  GET/search/export requests.
- Stored-XSS strings, unsafe URL schemes, SVG/HTML photos, MIME mismatch,
  oversized images, and excessive dimensions.
- Pre-import and post-commit backup failures, owner-only permissions, restore,
  retention, and deletion semantics.
- Cross-contact and shared-household identifier conflicts.
- Shared-identifier marking/unmarking and merge behavior.
- Spreadsheet-formula-leading CSV values, including tab, CR, LF, control, and
  whitespace-prefixed formulas.
- Maintenance-agent PII egress policy using synthetic/redacted fixtures.
- Single-use Undo, expiry, replay refusal, row-version mismatch, and protection
  of later dependent work.
- Rollback refusal until the verified pre-migration database is restored.

The supplied real test vCard is used only for a local verification pass after
synthetic regression tests are green. Assertions use aggregate counts and must
not emit its contact values.

## Rollout

1. Implement schema, constraints, `ContactService`, backfill, reconciliation,
   security middleware, and old-code read-only rollback behavior.
2. Implement and verify parser, provenance, preview, transactional import,
   backup/restore, and aggregate-only real-vCard checks.
3. Implement multi-value contact detail/edit/search/export surfaces.
4. Implement the deterministic onboarding state machine and machine setup
   receipt integration.
5. Run each phase's synthetic, migration, security, restore, and rollback tests
   before beginning the next phase.
6. Review the complete diff and publish the branch for canonical review.
7. Promote only the reviewed revision.
8. Back up and restore-test Matt's current local database.
9. Use the release guard before updating the HP checkout.
10. Run the six-contact test import and visually confirm all fields, labels,
    photos, warnings, and preview outcomes.
11. Complete onboarding and Yahoo sign-in with Matt.
12. Import the full address book only after preview counts show no silent loss.
13. Verify backup and export before removing the emailed vCard copies.

## Non-Goals

- Sending email or text from the CRM.
- Replacing Yahoo Mail.
- Cloud-syncing the CRM database.
- Automatically executing arbitrary instructions pulled from GitHub.
- Building a general OpenClaw-style automation platform.
- Exposing the local CRM directly to the public internet.
