# Googlevideo retry hardening · v132

Some signed Googlevideo URLs can be tied to the network path and anonymous
InnerTube session that created them. v132 extends the v131 same-origin proxy
before it returns an audio failure.

## Retry path

1. Use IPv4-first DNS ordering for both InnerTube resolution and the media GET.
2. Retain anonymous `visitorData` and permitted visitor cookies obtained during
   the search/player exchange; they never leave the server.
3. Request media with a matched client profile (`User-Agent`, YouTube client
   headers, visitor ID), `Accept-Encoding: identity`, and the browser's single
   byte range.
4. On HTTP 403, try compatible web and Android request headers.
5. If all profiles reject the URL, force one fresh InnerTube resolution that
   prioritizes `WEB_REMIX`, then retry the media request.

The proxy still rejects multiple ranges, arbitrary target URLs and redirects.
It never exposes Googlevideo URLs, visitor IDs or cookies to the browser.

If YouTube rejects every fresh stream after these retries, configure the
optional `HANAMI_YOUTUBE_RESOLVER_URL` NewPipe/yt-dlp adapter described in
`READER_MUSIC_SERVICES_V129.md`. That is a provider-side limitation rather than
a browser CORS issue.

## Coverage

- `tests/music-services-v129.test.mjs` verifies visitor data, anonymous cookie
  propagation and Web Remix preference.
- `tests/youtube-audio-proxy-v131.test.mjs` verifies range validation, three
  header attempts, fresh resolution after 403, route streaming and URL privacy.
