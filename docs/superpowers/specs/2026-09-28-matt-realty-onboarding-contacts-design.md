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

The supplied vCard was inspected locally without printing or copying contact
values. It contains six vCard 3.0 contacts, six phone values across four
contacts, one Apple grouped/custom-labeled phone, and two embedded photos. It
contains no email or postal address properties.

The current importer recognizes all six names but would expose only three of the
six phone values. The grouped Apple number and additional values are not
preserved in structured fields. This is a data-loss defect and must be covered
by regression tests before the full address book is imported.

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

The guide stores its current step locally, resumes after interruption, supports
Back and Skip where safe, and is always available from **Help > Run setup
again**. It must not depend on a language model to advance or decide whether a
step passed. The assistant may narrate the deterministic screens when spoken
replies are enabled.

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
| Read/search CRM data | Perform and report |
| Create or update one CRM record | Perform, then summarize |
| Routine reversible local configuration | Perform, verify, then summarize |
| Ordinary package or approved app install | Perform, verify launch/health, then summarize |
| Email, text, social post, call, or other outbound contact | Draft, show recipient/content, require confirmation |
| Bulk contact import or bulk record change | Preview counts and effects, require one confirmation |
| Delete, overwrite, reset, or purge | Explain exact target and require confirmation |
| Credentials, authentication, firewall, remote access, or public exposure | Explain boundary and require confirmation |
| Purchase, subscription, legal, financial, or account-level action | Require confirmation |

The local CRM assistant follows the same policy. Confirmation must be one clear
decision for the consequential action, not a sequence of repetitive prompts.

## Contact Data Model

The existing `contacts` table remains the stable identity and summary record so
current data can migrate without a destructive rewrite. Its existing phone,
email, and address columns become compatibility caches for each preferred
value.

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
| `sort_order` | Original/imported order |
| timestamps | Audit and synchronization support |

A contact may contain any number of methods. Exactly one method of each kind may
be primary when values of that kind exist.

### Contact Addresses

Add `contact_addresses` with a label, street, secondary line, city, region,
postal code, country, primary flag, sort order, and timestamps. A contact may
have multiple complete home, work, mailing, or custom-labeled addresses.

### Additional Details

Add `contact_details` for useful repeatable or provider-specific values that do
not belong in methods or addresses. Supported structured keys include company,
department, job title, nickname, prefix, suffix, birthday, other dates, related
people, and custom fields. Values retain their original labels and order.

### Photos and Raw Source

Add a local contact asset/source store for:

- Embedded contact photo bytes plus MIME type.
- Original raw vCard text for lossless recovery and future reprocessing.
- Import timestamp, source filename, and source hash.

Raw sources are local-only, omitted from ordinary API responses, protected by
the same local data boundary as the CRM database, and included in local backups.
Technical fields such as `VERSION`, `PRODID`, `UID`, and `REV` stay preserved in
the raw card but remain hidden from Matt's normal UI.

### Migration

Database initialization adds the new tables idempotently. Existing non-empty
phone, email, and address columns are backfilled as primary structured values.
The migration records completion and can be rerun without duplicating data.
Existing APIs continue returning preferred summary values while new detail
payloads include the complete collections.

## vCard Import Architecture

Move vCard interpretation from browser-only JavaScript into a dedicated,
standard-library-only Python module so the same parser powers preview, commit,
tests, and future reprocessing. No new package dependency is required.

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
- Reject malformed or oversized input safely without partially committing it.

CSV remains supported. CSV values enter the same normalized contact model,
using available headings and a single primary value when the file exposes only
one column of a kind.

## Import Flow

1. The browser sends the selected local file to a preview endpoint over the
   loopback-only CRM connection.
2. The server validates size and format and parses the complete file without
   writing contacts.
3. The preview reports contact count; counts by phone, email, address, photo,
   and custom field; duplicates; invalid cards; warnings; and whether any field
   would be omitted.
4. Matt or the agent gives one confirmation for the bulk import.
5. The server imports the staged, hashed preview in one SQLite transaction.
6. Failure rolls back the entire import.
7. Success reports imported, merged, duplicate, invalid, and preserved-detail
   counts and creates a backup.

Preview tokens are random, short-lived, memory-only, and bound to the source
hash. A changed file requires a new preview.

## Duplicate and Merge Rules

Duplicate detection compares all normalized phone and email values, not only
the preferred ones. Automatic import may merge into an existing contact only
when a unique match exists. It adds new nonduplicate values without replacing
existing user-edited values. Ambiguous matches remain uncommitted and are
reported for review.

Repeated import of the same source is idempotent: it does not create duplicate
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

### Export

CSV export remains a portable summary and gains clearly named columns for
additional values where practical. A new vCard export preserves repeatable
values, labels, addresses, photos, Unicode, and additional fields. Export never
marks a contact as subscribed or sends anything.

## Privacy and Security

- The HTTP service remains bound to `127.0.0.1`.
- Real contact fixtures, imports, database files, backups, and photos stay under
  the local data directory and are ignored by Git.
- Import logs contain counts, hashes, and error categories, not contact values.
- Browser credentials and Yahoo sessions remain browser-owned.
- Remote access setup is separately gated because it changes a security
  boundary.
- Contact exports emailed to the same account are deleted from Inbox, Sent, and
  Downloads only after a verified CRM backup exists.

## Error Handling

- Unsupported files identify the expected `.vcf` or `.csv` formats.
- Partially malformed cards produce a preview warning and do not disappear
  silently.
- Decode failures retain the raw property and mark it for review.
- A failed transactional import leaves the database unchanged.
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

The supplied real test vCard is used only for a local verification pass after
synthetic regression tests are green. Assertions use aggregate counts and must
not emit its contact values.

## Rollout

1. Implement and verify schema migration and parsing on a guarded branch.
2. Run synthetic tests and the aggregate-only real vCard verification.
3. Review the complete diff and publish the branch for canonical review.
4. Promote only the reviewed revision.
5. Back up Matt's current local database.
6. Use the release guard before updating the HP checkout.
7. Run the six-contact test import and visually confirm all six phone values,
   labels, and photos.
8. Complete onboarding and Yahoo sign-in with Matt.
9. Import the full address book only after preview counts show no silent loss.
10. Verify backup and export before removing the emailed vCard copies.

## Non-Goals

- Sending email or text from the CRM.
- Replacing Yahoo Mail.
- Cloud-syncing the CRM database.
- Automatically executing arbitrary instructions pulled from GitHub.
- Building a general OpenClaw-style automation platform.
- Exposing the local CRM directly to the public internet.

