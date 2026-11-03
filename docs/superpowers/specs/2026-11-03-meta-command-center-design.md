# Matt Command Center

Approved in chat November 3: add a command center inside the existing Cloudflare CRM for Matt's Facebook Business Page and Instagram, focusing on account connection, supported engagement reporting, content ideas and assistant tasks. No social publishing in this version.

Preserve existing Today/Contacts/Follow-ups/Campaigns and protected Access boundary. Reuse vanilla JS/CSS, Workers AI and D1; no new dependencies. Keep the current visual identity. New Command Center route contains Overview, Audience, Research, Reports and Tasks tabs. No invented metrics or fake connected states.

Audience: read-only Meta OAuth, configured on the server. If app credentials are absent, show exact administrator setup steps and Business Suite link. OAuth state is one-use, expiring, bound to authenticated identity and secure browser cookie; never expose or back up access tokens. Encrypt retained credentials using AES-GCM Worker secret. List Page choices after authorization; Matt explicitly chooses the Page. Linked professional Instagram discovered via Meta. Disconnect deletes local retained credentials. Never request publishing or messaging permission.

Metrics: explicit Refresh retrieves Facebook/Instagram supported public account and recent post engagement fields. Keep counts null when absent, never treat unsupported metrics as zero, label source/fetched time and partial failures. Reports summarize saved snapshots without pretending comments/likes are leads, sales or email consent. Retain bounded history for real comparisons only after two samples.

Research: vetted real-estate source links plus Matt-saved notes/links with dates. Saved research is supplied context, not live web research; AI must not invent current market evidence. AI tasks can prepare content ideas, social drafts and summarize available engagement; persisted queue/status/result, retries and failure states, bounded shared existing100/day quota. Explicit Run invokes task; jobs do not run merely by viewing. Results can be copied into Campaigns through normal review; no external writes.

New D1 tables only, no edits to existing contact rows. Backup schema2 exports nonsecret new records; private social credentials and OAuth sessions excluded. Local Python shows hosted-only capability explanation. Migration/restoration and auth tests required. Live Meta connection remains pending real app setup/review and Matt approval; no catalog Meta credentials currently available.


## Security implementation ruling
Use separate Facebook Page and Instagram professional logins. The legacy Page-linked Instagram permission depends on a grant that can also delete Page comments. That conflicts with the approved read-only scope. Facebook therefore requests only pages_show_list/pages_read_engagement; Instagram requests only instagram_business_basic. This preserves the approved safety boundary at the cost of two explicit account approvals. No broader permission is silently granted.
