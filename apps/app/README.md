# @xtbit/app

Expo Router app for Web, Android, and iOS.

Run from the Linux repo copy:

```bash
cd /home/pgx123/private/xtbit/publisher-apps/xtbit-apps
pnpm dev:app
```

The app reads `EXPO_PUBLIC_API_URL` and defaults to `http://127.0.0.1:8787`.

## Web / Mobile UI split

Web and mobile can have completely different UI while sharing the same API client, hooks, session, types, and utilities.

- Web-specific pages use `*.web.tsx`.
- Web-specific components live under `components/web/`.
- Mobile/native pages use the default `.tsx` files.
- Do not change mobile pages just to improve Web layout.
- Current product UI work is Web-first; mobile UI will be planned separately later.
