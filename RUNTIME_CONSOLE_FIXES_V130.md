# Runtime and console fixes · v130

Hanami v130 resolves the actionable messages reported while opening a chapter
and using the v129 music search.

## Music API 404

The music UI is static, but search, stream resolution, recognition and lyrics
are server endpoints. Running only the `public/` directory therefore makes the
interface load while `/api/music/*` returns 404.

Use the included runtime:

```bash
npm run dev
curl http://127.0.0.1:4173/api/music/capabilities
```

The second command must return JSON with `soundcloud`, `recognition` and
`lyrics`. Vercel uses the `/api/:path*` rewrite in `vercel.json`. The client
now turns an API 404 into an explicit instruction instead of a generic search
failure.

## Browser console

- Added the modern `mobile-web-app-capable=yes` metadata while preserving the
  Apple-specific metadata.
- Added a real multi-size `favicon.ico`, an explicit icon link, correct local
  MIME type and PWA precaching.
- Removed `requestFullscreen()` from the Reader render/open path. Fullscreen is
  requested only while handling the user's General → Fullscreen toggle (or an
  explicit orientation choice), satisfying browser user-activation rules.
- The `beforeinstallprompt` informational message is expected: Hanami calls
  `preventDefault()` to retain the event for its visible **Install** button, and
  `prompt()` is called only after that button is pressed. This is the required
  deferred-install flow rather than an application failure.

## Regression coverage

`tests/runtime-console-v130.test.mjs` verifies the real API handler,
server routing contract, metadata, ICO header, service-worker cache, static-host
diagnostic and the absence of automatic fullscreen requests.

With `npm run dev` active, `npm run test:e2e:runtime` opens Chromium at
390×844 and verifies that Reader performs zero automatic fullscreen requests,
the explicit toggle performs one, and the favicon and music capability route
both return HTTP 200 without console errors.
