# Group audience implementation plan

Scope: local audience selection and personalized drafts, no sending/deployment.
Preserve the reviewed type-filter/draft-editor changes and individual templates.

1. Extract the already-tested template definitions into one shared JSON source
   consumed by browser, Worker and Python; retain the same fill/recipient behavior.
2. Share eligibility/deduplication rules: current contacts, usable email, Subscribed,
   and address-level suppression if any saved record has Unsubscribed that email.
3. Add type/stage/search filters and persistent checkboxes across filter changes.
   Preview unique-address representatives and explain exclusions/shared addresses.
4. Save bounded groups (100 email addresses) atomically into existing campaign
   Draft records. Preserve stable contact/batch references. Use a fingerprinted
   batch key and conditional inserts so retry/concurrency cannot duplicate records.
5. Require explicit occasion/recipient review, recheck contact revisions and
   eligibility on the server, and preserve a frozen save request after uncertainty.
6. Test all-original individual behavior, group eligibility, suppression, duplicate
   addresses, idempotent retry, conflicts, rollback and desktop/mobile UI.

No new dependencies or schema migration. Existing campaigns remain the saved
draft model. Future delivery must recheck current permission/address; snapshots
and batch metadata never authorize sending. Individual property/event templates
remain available; bulk per-person property fields are outside this first version.
