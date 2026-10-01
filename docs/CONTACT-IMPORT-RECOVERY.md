# Contact import and recovery

The application stays on loopback. Do not expose its current unauthenticated HTTP
server publicly or on the LAN. Remote maintenance uses a private, access-controlled
connection. Real contacts, exports, databases and backup snapshots stay outside Git.

## Import behavior

The importer skips only an identical active record across all imported fields.
Sharing an email or phone is not enough to discard a person. No import overwrites
existing contact data or establishes marketing consent. Imported consent is always
`Not asked`. Reimporting a record after its imported fields have changed can create
a second record; review counts before importing a modified file.

Every supplied field is validated before any records are written. An oversized
field rejects the entire batch and identifies its row and field without exposing
its value. Other invalid records are counted in the response. The CSV import file
must use the labels recognized by the browser parser, such as First Name, Last
Name, Email, Phone, Street Address, City, State, Postal Code, Source and Notes.

The current schema has one primary email and phone. The prepared workbook import
retains alternate values, labels, organizations and other useful fields in Notes.
This is an interim compatibility import, not implementation of the complete
multi-value contact design. Review the Notes when contacting a person.

## Before changing the runtime

1. Verify the deployed revision and release guard for the reviewed revision.
2. Take a SQLite backup using the backup action; copy the completed snapshot to a
   private backup location outside the machine. Never sync the running SQLite file.
3. Verify `PRAGMA integrity_check` and the contact/task/activity/campaign totals in
   the snapshot. Keep the pre-change snapshot without applying routine retention.
4. Inspect the actual existing database before separating demo contacts. Do not
   assume the runtime contains only the examples visible in source code.
5. Preview the prepared file and import once. Verify the expected added count,
   invalid/skipped totals, Notes preservation and unconfirmed consent.

## Restore

Install the matching application revision on the replacement machine, stop its
service, preserve any existing database and its WAL/SHM files together, then copy
a completed snapshot into the configured data directory as `realty.db`. Start the
application and verify contacts, notes, tasks, activities and campaigns. Do not
mix old WAL files with a restored database. A new machine's local-model and voice
features require their own setup; contact browsing does not depend on them.

The existing backup timer writes local snapshots and prunes routine snapshots
older than 30 days. Off-machine sync and daily/weekly retention are separate setup
steps and are not established merely by the presence of the timer files.
