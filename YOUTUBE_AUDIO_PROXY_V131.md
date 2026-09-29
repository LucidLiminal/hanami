# YouTube audio proxy · v131

> v132 adds session-aware Googlevideo retry logic; see
> `GOOGLEVIDEO_RETRY_V132.md`.

Hanami v131 fixes playback of resolved YouTube audio when `googlevideo.com`
does not grant browser CORS access.

## Root cause

InnerTube returned a valid signed `audio/mp4` URL, but the browser requested it
from the chapter origin and Googlevideo omitted `Access-Control-Allow-Origin`.
An `HTMLMediaElement` may sometimes play opaque remote media, but Web Audio's
equalizer cannot consume it, and setting `crossOrigin=anonymous` correctly
caused the request to fail.

## New playback path

1. `POST /api/music/youtube/resolve` still resolves and selects the audio format.
2. The signed Googlevideo URL remains only in the server cache.
3. The browser receives `/api/music/youtube/audio/{videoId}` instead of the
   external URL.
4. That same-origin endpoint resolves or reuses the current stream and relays
   the media response.
5. `Range`, `Content-Range`, `Content-Length`, `Accept-Ranges`, MIME type, ETag
   and Last-Modified are preserved, so seeking and metadata probing continue to
   work.
6. The response is streamed with `Readable.fromWeb`; it is not accumulated in
   server memory.

The proxy accepts only an 11-character validated YouTube video ID. It does not
accept arbitrary destination URLs. Remote URLs still come from InnerTube or the
administrator-configured resolver, remain HTTPS-only and are never returned to
the browser.

## Browser messages

- `beforeinstallprompt.preventDefault()` is an informational Chromium message
  produced by Hanami's deferred custom Install button.
- Lazy-image placeholder intervention is a browser optimization notice.
- The former Googlevideo CORS/403 request is the actual failure fixed here; the
  browser now requests Hanami's same-origin audio route instead.

## Validation

- `tests/youtube-audio-proxy-v131.test.mjs` verifies URL privacy, resolver-token
  isolation, byte ranges, response headers and route ordering.
- `tests/music-services-mobile-v129.e2e.mjs` now plays its fixture through the
  same-origin audio route and still validates synchronized lyrics and the
  10-band Web Audio equalizer.
