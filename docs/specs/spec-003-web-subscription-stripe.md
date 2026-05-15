# spec-003-web-subscription-stripe

## Goal

Add a Stripe test-mode web subscription flow for the shared dev environment before building the first product app.

## App key

Global billing foundation. The default app key is `platform`; future apps can pass their own `appKey`.

## MVP behavior

- Web users enter an email and start a Stripe Checkout subscription for `$0.90 USD / month`.
- Worker creates Checkout Sessions using Stripe test-mode API credentials stored as secrets.
- Stripe webhooks update D1 subscription state.
- Web UI can query billing status by email.
- Stripe success returns trigger an automatic subscription status refresh.
- Subscription status includes the current billing period end when Stripe provides it.
- Customer Portal endpoint is available for later account management.

## Expected future behavior

- Replace email-only identity with real app authentication.
- Support app-specific plans via `/api/{appKey}/billing/*`.
- Add production Stripe keys only after explicit prod readiness review.
- Add mobile entitlement reads without in-app purchase links until store policy is handled.

## Frontend changes

- Add a subscription panel to the existing Expo Web runtime screen.
- Use `EXPO_PUBLIC_API_BASE_URL` for the API base URL.
- Open Stripe-hosted Checkout in the system browser.
- Store the last checkout email locally on web so the return page can refresh status.
- Read `?billing=success` and `?billing=cancelled` return states from Expo Router params.

## Backend/API changes

- Add billing endpoints:
  - `GET /billing/config`
  - `GET /billing/subscription?email=...&appKey=...`
  - `POST /billing/checkout`
  - `POST /billing/portal`
  - `POST /billing/stripe/webhook`
- Verify Stripe webhook signatures before processing events.
- Store Stripe customer and subscription state in D1.
- Parse subscription period data from Stripe subscription items when needed.
- Backfill missing subscription period data by retrieving the Stripe subscription during status reads.

## Database changes

- Add Stripe customer, subscription, and webhook event tables.
- Every billing row includes `app_key`.

## Local validation

- Typecheck and lint.
- Apply local D1 migrations.
- Run Worker locally and verify billing config endpoint.
- Checkout creation requires `STRIPE_SECRET_KEY` in local `.dev.vars`.

## Dev validation

- Add Cloudflare Worker secrets:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- Apply remote dev D1 migrations.
- Deploy dev API and web.
- Use Stripe test card after webhook is configured.
- Until `dev.aiappsbox.com` serves Pages root, Stripe return URLs use `https://dev.xtbit-apps.pages.dev`.
- Confirm a sandbox payment creates D1 customer, subscription, and webhook event rows.
- Confirm the public subscription status endpoint returns `active` and `currentPeriodEnd`.

## Prod validation

No prod deployment in this spec.

## Rollback notes

- Remove Stripe secrets from Cloudflare if abandoning Stripe.
- Disable billing UI by removing the subscription panel or hiding it behind a feature flag.
- Billing tables can remain until data retention is decided.
