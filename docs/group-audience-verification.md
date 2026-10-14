# Group campaign drafts — local review candidate

Verified October 13, 2026. Preview: http://127.0.0.1:5066/

Matt can choose multiple contacts, filter by relationship type/stage/search, add matching eligible contacts, review personalized previews, and save a group of Draft records. Shared email addresses produce one draft with a visible representative. Contact records are never merged or edited by this flow. Archived, invalid/missing email, missing first name, and unconfirmed permission are excluded. Any saved unsubscribe record suppresses the shared address, including mixed-case values.

Up to 100 unique addresses / 500 selected contact records. Nine common-message templates support groups; property and appointment templates remain individual. Nothing sends. Sending would need a separate delivery integration and fresh permission checks.

Simplifications: shared existing template definitions in message-templates.json; reuse existing campaigns table and backup format; no migrations or dependencies. Group metadata preserves batch/contact identity; copies detach that metadata. Frozen retry receipts prevent duplicate groups after uncertain responses.

Changed files: static/app.js, static/styles.css, static/desk-personalization.js, static/hosted-assistant.js, static/desk-templates.js; new static/desk-templates.mjs, static/message-templates.json, static/campaign-audience.mjs, static/group-templates.mjs; cloud/api.mjs, new cloud/group-drafts.mjs; server.py; cloud/tests/local-preview.mjs, profile.test.mjs, templates.test.mjs, new audience.test.mjs and group-drafts.test.mjs; tests/test_drafts_and_types.py; plan and this report. Includes previously verified local type-filter/draft-editor commit 20f811e.

Validation: 81 Node tests; 16 Python tests; Worker checkJs/type check; Wrangler dry-run; git diff --check; independent review approved. Synthetic browser fixtures verified type/stage selection, personalized previews, shared-address dedupe, double-click save, response-loss receipt recovery, detached copies, locked group metadata during AI review/save, and Keep editing/Discard close behavior. Prior mobile check retained. Production data was not used as a fixture or modified.

Remaining limits: local candidate only; not pushed, merged or deployed. Pending retry recovery is tied to this browser tab's session storage. Corrupt pending references block another group until Campaigns is reviewed. Eligibility snapshots do not authorize future sending. Live Cloudflare source remains 4984f63325262251ff884184b44e261cd8fa0d62.
