# Hosted CRM demo

The first hosted release contains invented records only. The HP runtime remains
available. Application runtime code has no package dependencies; deployment uses
the official Wrangler CLI, tested with version 4.145.0.

## Tests and preview

```powershell
node --test cloud/tests/*.test.mjs
node cloud/tests/local-preview.mjs
```

The preview is a loopback-only Node/SQLite test harness at port 5052. It emulates
the Access edge with a freshly signed synthetic identity and signing-key response.
It is never part of the deployed Worker dependency graph. It is not a remotely
usable deployment or proof of a real Cloudflare login. The actual worker.mjs has
no authentication bypass and denies requests while configuration is incomplete.

## Release setup

1. Publish/review the branch and promote its exact revision in the Vault. Run
   project-work guard --release from a clean checkout at the approved revision.
2. Authenticate Wrangler using account/user read and Workers/D1 edit scopes. On
   Windows use --use-keyring so OAuth credentials stay in the OS credential store.
   Any browser authorization or Access permission change needs the owner's action.
3. Create a dedicated D1 database named matt-realty-desk-demo in the verified
   account. Never select the AisleScore database. Apply migrations, then demo.sql
   once. Verify counts: two contacts, one task, one activity and one draft.
4. Copy wrangler.jsonc to the ignored wrangler.deploy.json and set the account ID,
   actual D1 ID, ACCESS_ISSUER (the team https://...cloudflareaccess.com URL), the
   Access application's ACCESS_AUDIENCE, and ALLOWED_EMAILS (exact owner and Matt
   addresses). Never commit this account-specific file or credentials. Empty
   values fail closed. ASSETS run_worker_first must remain true.
5. Create an Access application covering the entire Worker and API, restricted
   to those exact email addresses. Configure an available sign-in method suitable
   for Matt. No Everyone, Bypass, public preview, or account-wide Protect All
   Workers changes. Other applications must remain unchanged.
6. Deploy with Wrangler using the ignored configuration. Verify anonymous assets,
   API, CSV and snapshot routes are denied; validate the allowed browser login;
   create/edit an invented contact and reminder; save a draft; download a full
   snapshot and restore it into a separate database. Do not call hosting complete
   until these live checks pass. Record the URL and deployed revision afterward.

```powershell
npm exec --yes --package=wrangler@4.145.0 -- wrangler d1 create matt-realty-desk-demo
npm exec --yes --package=wrangler@4.145.0 -- wrangler d1 migrations apply matt-realty-desk-demo --remote --config cloud/wrangler.deploy.json
npm exec --yes --package=wrangler@4.145.0 -- wrangler d1 execute matt-realty-desk-demo --remote --file cloud/demo.sql --config cloud/wrangler.deploy.json
npm exec --yes --package=wrangler@4.145.0 -- wrangler deploy --config cloud/wrangler.deploy.json
```

## Recovery and limitations

The authenticated Back up action downloads schema-versioned JSON including all
contacts (including archived), reminders (including completed), activity and
campaign drafts. Preserve that file privately outside the hosting account.
CSV exports cover contacts only. D1 Time Travel adds provider-side point-in-time
recovery, but does not replace off-provider copies. No automatic daily/weekly
export or Dropbox sync is installed by this release.

For recovery, create a separate empty D1 database with the same migration, insert
the snapshot's contacts, tasks, activities and campaigns in that order using
allowlisted schema columns and parameterized statements, then verify every row,
table count and foreign-key check before switching the binding. The tests exercise
this restore against a separate SQLite database. Restore never overwrites the
active database. Do not put snapshots or SQL containing contacts into Git.

Imports are transactional JSON chunks bounded by record count and encoded bytes.
Identical imported fields are skipped; shared details remain separate; modified
reimports may create additional records. Secondary contact values stay in Notes
in this compatibility release. Imported consent remains Not asked. Embedded NUL
and oversized fields are rejected before writes to avoid truncation.

Local AI and voice remain unavailable in the hosted runtime. The hosted writing
assistant uses the native Cloudflare AI binding after migration0002. Campaigns remain drafts; no email, text or social post is sent. Preview URLs
are disabled and requests to any enabled route still pass the Worker JWT gate.
JWKS fetches share an in-flight request and use a 30-second refresh cooldown;
signing-key rotation can cause a short fail-closed delay during that interval.

## Hosted writing assistant

The reviewed assistant design is in `docs/hosted-assistant.md`. Apply migration
0002 before enabling the AI binding. It stores daily attempt counts only; core
business snapshot format remains unchanged. Recovery must apply all migrations
before enabling the assistant. The100-attempt shared daily cap is separate from
Cloudflare's account usage allowance. No model tool can send or modify records.

`PREVIEW_PORT=5055 PREVIEW_ASSISTANT=1 node cloud/tests/local-preview.mjs` enables
an explicitly synthetic local answer fixture for UI testing only. It is not proof
of model quality. The optional evaluation scripts send invented task cases through
a loopback Wrangler probe; keep its account-specific `.local.json` untracked.
