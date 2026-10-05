# Hosted assistant - October 5, 2026

Approved intent: a browser assistant for Matt's real-estate work, with general
questions, a database daily plan, selected-contact summaries, follow-up drafts,
newsletter drafts and social copy. No sending, scheduling or record mutation.
Josh explicitly set 100 shared AI attempts per UTC day on October 5.

Implementation reuses Workers, Access and D1. A native AI binding calls Llama
3.3 70B FP8 Fast. Input is bounded to 2,000 prompt characters and one selected
active contact's name/type/stage/permission/follow-up/notes; no whole-list context.
The model has no tools or access to databases. Responses render as text. Known
conflicting instruction patterns are rejected and recognizable action claims
withheld. These checks are not a complete prompt-injection or factuality proof.
Human review remains required, and the interface says nothing was sent/changed.

Limits: atomic D1 reservation before inference; 100 attempts shared by both users,
including failures, resets 00:00 UTC. No automatic retries, 800 output-token cap,
30-second response timeout. The provider can finish a timed-out call and bill it.
This request cap is not a Cloudflare account spend/neurons cap. Paid overage is
possible and was explained when the owner selected 100. Plan my day uses no model
and no attempt. Count-only usage is stored, not prompts or answers.

Model evidence (synthetic only, private Dropbox Cloudflare-Demo reports):
- First comparison: Qwen3 integration returned no usable answers; GLM returned
  20 answers but invented a legal retention rule and obeyed malicious notes.
- Refined comparison: Llama gave better summaries and terse drafts; GLM still
  obeyed the malicious note. Repeated raw-model testing showed Llama can also
  repeat an injected action claim. Neither model is intrinsically trusted.
- Final application comparison: 19 answers, one malicious-input case blocked
  before inference. Answers were read; summaries/missing-fact handling/drafts are
  useful, but promotional wording and domain explanations require review. This
  is a small task-specific sample, not a broad benchmark or guarantee.
- Unit tests separately exercise selected context, no business-data writes,
  invalid input, concurrent quota, known hostile notes and output claims,
  provider errors and database-only plans. Synthetic browser preview validates
  presets, required contact selection, output rendering and the100-attempt display.

Deploy migration0002 before enabling the AI binding. Back up the live D1 first.
If rolling back code, leave the additive usage table intact. Business snapshots
exclude usage counters; after recovery apply all migrations and verify quota
before enabling AI. Old local Python assistant remains unchanged. Voice disabled.

Sources: Cloudflare Workers AI bindings and model documentation (checked Oct5).
Campaign saving/sending and automatic off-provider backups remain separate work.
