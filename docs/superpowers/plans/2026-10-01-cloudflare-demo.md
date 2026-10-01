# Cloudflare CRM Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide a private, recoverable demo CRM independent of Matt's HP.

**Architecture:** Reuse static UI; add a Worker API and D1 migration. Validate Access
JWTs before assets/API and enforce same-origin JSON writes. Keep local Python intact.

**Tech Stack:** Native JavaScript/Web Crypto, Cloudflare Workers/D1, Node test/sqlite.

**Spec:** `docs/superpowers/specs/2026-10-01-cloudflare-demo-design.md`

## Global Constraints

- Demo contacts only; no real PII in code/cloud/logs.
- No new application runtime dependencies or production authentication bypass.
- Preserve exact-import skipping, shared details and unconfirmed consent.
- Separate database; no AisleScore or HP mutations.
- Release only reviewed, canonically approved revision; concrete browser approval for Access changes.

## Review Focus

- Anonymous access through alternate static/preview routes must remain denied.
- Two simultaneous identical imports must not insert two records.
- Invalid batch rows and malformed request bodies must not partially mutate data.
- Editing shared contact details must not affect another contact.
- Snapshot restoration must retain linked reminders/activity and campaign drafts.

## Tasks

### 1. Hosted data API (worker owns cloud/api.mjs and cloud/tests/api.test.mjs)
- [x] Write failing behavior tests using native SQLite-backed D1 adapter.
- [x] Add schema migration, API parity, bounded imports and full snapshots.
- [x] Verify concurrent imports, recovery and invalid inputs.

### 2. Hosted UI (worker owns static/index.html and static/app.js)
- [x] Add hosted-runtime detection without breaking local Python behavior.
- [x] Explain disabled local AI/voice; correct hosting/import/backup descriptions.
- [x] Adapt backup action to a downloaded full snapshot.
- [x] Verify browser flows and JavaScript syntax.

### 3. Access and release (parent owns remaining cloud files/config/docs)
- [x] Write failing auth/CSRF tests; implement cryptographic JWT validation.
- [x] Configure ASSETS run_worker_first, D1 and disabled preview exposure.
- [x] Verify runtime build, synthetic hosted UI and full suite; independent review.
- [ ] Publish PR and shared handoff; owner approval/canonical promotion/release guard.
- [ ] Prepare Access application and demo deployment; verify live denied and allowed requests.

## Execution evidence

40 Node tests and 13 existing Python tests pass. TypeScript 5.9.3 checkJs diagnostics pass for production Worker modules; syntax and whitespace checks pass. Independent review found no remaining code/spec/security defect. Official local workerd/D1 runtime imported 1,249 synthetic records; reimport added none. Browser contact create/edit, linked reminder create/complete and campaign draft checks pass. Snapshot browser event verification remains in progress; API full snapshot and separate-database restore tests pass. No real contacts used.
