# Facebook and Instagram setup (hosted CRM only)

Facebook and Instagram connect separately with narrow read scopes. This release never publishes posts, messages, or deletes comments. No provider credentials were available during implementation; live authorization, app review and Matt's consent remain pending.

## Facebook Page connection

1. Configure Facebook Login for your Meta developer app. Allow the exact redirect `https://YOUR-CRM/api/social/callback`. Keep the CRM behind its existing Cloudflare Access policy.
2. Set Worker secrets `META_APP_ID`, `META_APP_SECRET` and configure `META_REDIRECT_URI` with that exact HTTPS callback.
3. Requested scopes are exactly `pages_show_list,pages_read_engagement`. No Instagram scope or `pages_read_user_content` is requested. The latter has comment deletion capability and is excluded from this read-only integration.
4. In Command Center → Audience choose Connect Facebook, authorize, then explicitly select an offered Page. Authorizing alone does not select an account. Selecting another Page replaces Facebook credentials only, preserving separately connected Instagram and historical snapshots.

The server exchanges the initial user token for a long-lived user token, discovers Pages with only `id,name,access_token`, and stores only the selected encrypted Page credential. Page tasks and granted permissions determine available data. Only the first 100 available Pages are offered; a missing Page may require access corrections.

## Separate professional Instagram connection

1. Configure Instagram API with Instagram Login for an eligible professional account. It does not need a linked Facebook Page. Register `https://YOUR-CRM/api/social/instagram/callback` as the exact redirect URI.
2. Set Worker secrets `IG_APP_ID`, `IG_APP_SECRET` and configure `IG_REDIRECT_URI` with that exact HTTPS callback. These are Instagram app credentials, distinct from the Facebook app configuration.
3. The requested scope is exactly `instagram_business_basic`. There are no content publishing, messaging or comment-management scopes.
4. Choose Connect Instagram and explicitly consent in Instagram Login. The consenting professional account is saved directly after validating its profile; there is no Facebook Page choice in this flow. Connecting Instagram replaces Instagram credentials only and preserves Facebook.

The server sends a multipart authorization-code exchange to `api.instagram.com/oauth/access_token`, exchanges the resulting short-lived token at `graph.instagram.com/access_token`, then validates `user_id,username` at the versioned `me` endpoint. Only the selected account's long-lived token is retained encrypted. This release does not silently refresh expiring tokens. Reconnect when expired or revoked; account-security changes or permission changes can also invalidate tokens.

## Shared server configuration

`SOCIAL_TOKEN_KEY` is base64 encoding of 32 cryptographically random bytes, used for AES-GCM encryption. Keep it in Worker secrets; do not commit, export, log or paste secrets into chat. Key rotation requires reconnecting accounts. `META_GRAPH_VERSION` defaults to `v25.0` for both versioned graph hosts; set a supported version explicitly after validating the app. Malformed version strings fail closed.

Apply `cloud/migrations/0003-social.sql` before enabling routes. Use normal reviewed publication and release guards. Meta may require business verification, app review and advanced access for use outside app roles; verify requirements in the actual developer app dashboard. Choose Refresh to capture a sample; visiting the workspace does not fetch provider metrics.

Use [Meta Business Suite](https://business.facebook.com/) for direct management. Setup references: [Facebook Login](https://developers.facebook.com/docs/facebook-login/), [Facebook long-lived access tokens](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived), [Instagram Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/).

## Storage and API contract

`social_accounts` holds selected identifiers and encrypted tokens. `social_oauth` holds identity/browser-bound ten-minute states and encrypted Facebook choices. Neither table belongs in portable backups. OAuth states are claimed once before external requests, then retained as a cancellation fence until a guarded atomic final save. Disconnect cannot be undone by an in-flight callback or Page selection. Expired sessions are removed on the next connect. Disconnect deletes local credentials and sessions while retaining nonsecret snapshots; users may separately revoke the grant in the provider account settings.

All routes require verified Access identity. POST routes also require the same-origin Origin header. Separate Secure HttpOnly SameSite=Lax host-only cookies bind Facebook and Instagram browser sessions. Provider failures return generic errors. Requests use fixed provider hosts, reject redirects and apply time/body limits. No raw tokens or provider errors reach API output. No credentials are included in backups.

- `GET /api/social/status`: `{configured,missing,instagram_configured,instagram_missing,connected,accounts,snapshots}`. `configured` means Facebook readiness; `instagram_configured` means independent Instagram readiness. `connected` means at least one saved account. Accounts omit credentials. Snapshot records contain `{id,account_id,platform,captured_at,data}`.
- `POST /connect`: Facebook `{url}` and browser cookie. Navigate to URL.
- `GET /callback`: Facebook redirect to `/?view=command&tab=audience`, with `social_error=connection_failed` on failure.
- `GET /choices`: `{pages:[{id,name,instagram:null}]}` for current Facebook identity/browser; an empty list when no authorization is pending or configuration is absent. Instagram is connected separately.
- `POST /select` with `{page_id}`: `{connected:true,accounts}` for selected Facebook only. Unauthorized choices are rejected; independently authorized Instagram remains saved.
- `POST /instagram/connect`: Instagram `{url}` and independent browser cookie.
- `GET /instagram/callback`: saves the consenting Instagram account and redirects to Audience, with the same generic failure flag if unavailable.
- `POST /refresh`: `{snapshots,partial}` for all saved accounts. It works with Instagram alone even when Facebook is unconfigured. An unconfigured saved account produces a partial sample with unavailable metrics. Data is `{account:{id,name,followers_count,media_count},posts:[{id,message,permalink_url,created_time,likes,comments,shares}],posts_available,errors:[]}`. Facebook likes count LIKE reactions. Missing counts stay null. No unsupported reach is invented. `posts_available` is true only after a valid media/posts array maps successfully, including an empty successful array. False means unknown, never zero. At most 25 recent posts and 30 snapshots per account are retained; historical accounts retain their samples.
- `POST /disconnect`: `{connected:false}`; removes local credentials and all pending authorizations for both providers, clears both cookies, retains historical snapshots. This does not revoke provider grants.

Verification: `node --test cloud/tests/social.test.mjs cloud/tests/command-integration.test.mjs`. Tests mock providers and cover exact narrow scopes, exchange order/parameters, both Instagram token response shapes, identity/browser binding and replay/expiry, encryption/output exclusion, independent provider preservation, Instagram-only refresh, missing counts versus zero, malformed posts, partial errors, disconnect races and portable backup boundaries. No real account was authorized.
