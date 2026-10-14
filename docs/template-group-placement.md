# Template group choice — October 14, 2026

Local preview: http://127.0.0.1:5067/

Changed static/desk-personalization.js: group button sits directly below the one-contact picker; nearby wording explains type/stage groups and personalized drafts. Existing Campaigns group shortcut remains.
Changed static/group-templates.mjs: opening a supported template retains its occasion. Unsupported property/appointment templates explain the limitation and preserve the individual composer instead of silently falling back to a holiday.

Reuses existing audience flow, filters, selection and saves; no dependencies, schema changes or contact mutations introduced.

Validation: 26 relevant template/profile/audience/UI tests passed; both modified scripts passed syntax checks; diff check passed. Browser verified adjacent placement, selected new-lead occasion retained, Buyer filter selecting two synthetic recipients together, and new-home limitation preserving the original composer with an explanation.

Not published or deployed. Current Cloudflare app and contacts untouched. Property-specific group personalization and actual sending remain separate future work.
