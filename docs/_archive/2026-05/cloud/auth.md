# Authentication plan

## Current local/dev behavior

Local and dev builds keep the lightweight email-only identity path. The web app stores the entered email in browser `localStorage` and sends it to the Worker API as the `email` field or query parameter. The API resolves that email through the shared `users` table and keeps user-owned rows isolated by `user_id`.

This mode is intentionally for development, previews, and early traffic testing only. It does not prove domain ownership, identity provider membership, MFA, or account recovery.

## Production direction

Production should use Cloudflare Access in front of the Pages app and Worker API. Cloudflare Access issues an application token after the user authenticates and sends it to the origin in the `Cf-Access-Jwt-Assertion` request header; browser sessions also use the `CF_Authorization` cookie. Cloudflare documents that origins should validate the JWT assertion instead of trusting a raw header value alone.

References:

- [Cloudflare Access application token](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/)
- [Validate Cloudflare Access JWTs](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/)
- [Cloudflare Access policies](https://developers.cloudflare.com/cloudflare-one/policies/access)
- [Generic OIDC identity provider](https://developers.cloudflare.com/cloudflare-one/identity/idp-integration/generic-oidc/)

## Identity mapping

The production resolver should map the verified Access JWT payload to the shared platform user:

- `email`: required primary identity claim, normalized with the existing `normalizeEmail` rules.
- `sub`: optional stable external subject, stored later if we add a dedicated external identity table.
- `groups` or custom OIDC claims: optional policy inputs for Access, not exposed to normal gameplay UI.

The application should continue storing app-owned data by `user_id` and `app_key`; the frontend should not send an editable email identity in production once Access validation is active.

## Environment boundary

Recommended future variables:

- `APP_ENV`: continues to decide local/dev/prod behavior.
- `CLOUDFLARE_ACCESS_TEAM_NAME`: used to fetch Access signing keys from the team certs endpoint.
- `CLOUDFLARE_ACCESS_AUD`: expected Access application audience.
- `AUTH_MODE`: `email_dev` for local/dev and `cloudflare_access` for production.

## Not implemented in this pass

This pass does not add OIDC login code, token validation, Access middleware, database identity migrations, or production auth enforcement. It only keeps local/dev email login working and documents the production boundary so the UI can present a clean signin surface now without pretending email-only auth is production-ready.
