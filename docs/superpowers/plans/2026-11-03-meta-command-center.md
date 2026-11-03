# Matt Command Center Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development; steps use checkbox syntax.

Goal: attach a useful Facebook/Instagram command center to Matt's existing CRM.
Architecture: modular authenticated Worker APIs, additive D1 migration, existing static UI shell and quota-limited AI calls.
Tech stack: vanilla JS/CSS, Cloudflare Workers/D1/Workers AI, Web Crypto; no dependencies.
Spec: ../specs/2026-11-03-meta-command-center-design.md

Global constraints: preserve existing contacts and workflows; no social publishing or messaging; no credentials in API responses/logs/backups. Actual Meta activation requires server app configuration and Matt's consent.

Review focus: expired/replayed OAuth; wrong account selection; missing vs zero metrics; AI retry/concurrency; restoration of new nonsecret records.

- [ ] Meta API task: write security/metrics failing tests, implement social module/migration, run focused checks.
- [ ] Command workspace API task: write persistence/job idempotency tests, implement research/jobs/reports endpoints, use existing AI quota.
- [ ] UI task: accessible responsive Command Center entry/tabs, real empty/setup/error states, account choices, research notes, task run/results, snapshots/reports. Reuse theme and shell.
- [ ] Integration: worker identity/routing, new migration preview fixture, backward-compatible backup, auth/typecheck/test suites; independent exact-candidate review.
- [ ] Browser synthetic desktop/mobile verification; publish reviewed source and dated setup/deployment limits. Use guarded deployment only after actual release acceptance; keep Meta setup pending until configured.
