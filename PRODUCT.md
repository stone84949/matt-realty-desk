# Matt Realty Desk

## Platform
Private web application on Cloudflare Workers, D1 and Workers AI, protected by Cloudflare Access. Existing local Python runtime remains a separate runtime.

## Users and purpose
Matt is a real-estate agent who uses this CRM regularly for contacts, follow-ups and campaign drafts. Josh coordinates development. Preserve existing contacts, account facts and workflows.

## Approved extension
November 3, 2026: Josh requested a Command Center attached to the CRM, inspired by his Mission Control command center. Matt uses Facebook with a Business Page and Instagram. Josh approved account connection, available engagement reports, content ideas and assistant tasks; social publishing is separate. No other networks or platform accounts inferred.

## Stack and constraints
Extend existing vanilla JS/CSS, Cloudflare Workers/D1 and shared capped writing assistants. No new dependencies. Keep the existing CRM identity. External social data requires Meta app configuration and Matt account approval. No fake metrics or always-running-agent claims. No outbound publishing or messaging, no conversion of social followers into opted-in contacts. Secrets never enter client responses, logs or portable backups.

## Success
Matt can discover the Command Center within the CRM, understand setup status, select his authorized Page, explicitly fetch supported social measurements, save source notes, and run focused writing/report tasks with durable results.

## Connection choice
Separate Facebook Page and Instagram professional approvals keep OAuth scopes narrow. Instagram need not be linked to the Page. Meta app configuration and account consent remain pending; no access has been granted by this code change alone.
