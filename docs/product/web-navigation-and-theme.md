# Web Navigation and Theme

> Status: active as of 2026-06-11. Scope: web desktop first. Mobile/native UI is not redesigned by this document.

## Reference

Toolify's May 2026 ranking lists PolyBuzz at about 57.8M monthly visits and categorizes it as an AI character / AI companion product. Its web IA leads with character discovery and adjacent actions such as Discover, Create Character, Subscribe, and Coins, rather than sending users into a secondary scene/workspace first.

- Toolify ranking: https://www.toolify.ai/Best-trending-AI-Tools
- PolyBuzz character page/navigation reference: https://www.polybuzz.ai/character/profile/all-for-one-89Tuc

## Product Decision

- `/` is the canonical web Discover home.
- `/companions` is a legacy compatibility route that renders the same Discover experience; it should not be treated as a separate product entry.
- Product-facing navigation says `Discover`, not `Companions`.
- Login success defaults to Discover. If a protected page supplied `redirect`, login returns to that original target.
- The web visual baseline is dark, character-first discovery. The old warm dashboard shell is retired as the primary web experience.

## Navigation

The web topbar uses one shared structure:

- Brand: `AI Apps Box`, links to `/`.
- Primary nav: `Discover`, `Scenes`, `Create`, `Memories`.
- Account area: credits/billing when signed in, plus sign-in or account menu.
- Admin remains in the account menu for admins; it is not a primary product navigation item.

Route behavior:

- `/`: public and signed-in Discover.
- `/companions`: compatibility alias for Discover.
- `/auth/login`: public Discover surface with sign-in controls.
- Protected web pages redirect to `/auth/login?redirect=<current path>`.
- Auth success consumes the pending redirect first, then falls back to `/`.

## Theme

Web uses a dark product shell:

- Deep canvas and translucent dark surfaces.
- Rose/ember CTAs and accents.
- Character portrait grids and immersive chat stay visually continuous.
- Utility, billing, admin, and settings pages use dark tool surfaces instead of returning to the old warm dashboard.

Implementation rule:

- Web-only theme overrides live in the web stylesheet and `components/web/*`.
- Do not remap shared mobile/native UI just to satisfy web styling.
- New web pages should use `WebAppShell` and web UI primitives unless they intentionally need an immersive shell.

## Mobile Boundary

Mobile/native tabs and screens keep their existing design until a separate mobile design pass is planned. Shared API clients, hooks, session, and types remain shared across platforms.

## Local Testing

Local testing uses the local stack by default:

- Web dev server: `http://localhost:8081`
- Static web preview: `http://127.0.0.1:19006`
- API: `http://127.0.0.1:8787`
- Data: local D1 through Wrangler

Use `pnpm run:local` for normal local development. It starts the local API and web app together after applying local D1 migrations.

Use `pnpm preview:web:local` when testing the exported static web bundle. This still expects the local API at `http://127.0.0.1:8787`; if the API is not running, Discover should show the explicit local API unavailable state.

Do not make the local frontend depend on the deployed dev API by default. The dev API is for deployment/integration verification or special debugging only.
