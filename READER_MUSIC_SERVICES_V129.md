# External music services · v129

Hanami v129 adds a search-first music workflow to the chapter reader. Readers
can find a song in a YouTube Music-style search, press **Reproducir**, and keep
reading; no URL entry is required.

## User flow

1. Open a chapter and press **Música**.
2. In **Buscar**, enter a song, artist or album.
3. Hanami queries its same-origin `/api/music/youtube/search` endpoint, which
   calls the public InnerTube search surface and returns normalized song rows.
4. Press **Reproducir**. `/api/music/youtube/resolve` requests player metadata,
   selects a browser-compatible direct audio format, stores the track and starts
   playback.
5. If the temporary stream expires, Reader Music resolves it again before the
   next playback automatically.

The manual URL control remains collapsed under **Fuente manual (opcional)** for
radio streams and advanced use; it is not part of the normal flow.

## Ports

### YouTube Music / InnerTube

- song search through the `WEB_REMIX` client context;
- normalized title, artist, album, artwork and duration;
- player resolution through Android and Web Remix client contexts;
- direct audio-format selection and bounded server cache;
- persistent `youtube-<videoId>` records with automatic URL renewal.

Only a direct HTTPS `url` returned in `streamingData.adaptiveFormats` is used.
`signatureCipher` is detected but never deciphered. Hanami does not bypass DRM,
protected streams, advertisements or account restrictions.

YouTube sometimes challenges anonymous datacenter traffic. A deployment can
configure `HANAMI_YOUTUBE_RESOLVER_URL` with its own HTTPS NewPipe/yt-dlp
adapter; Hanami sends `POST { "videoId": "..." }` and accepts a normalized
`stream`, a top-level audio `url`, or a Piped-style `audioStreams` array. Set
`HANAMI_YOUTUBE_RESOLVER_TOKEN` to add a bearer token. The endpoint and every
returned media URL are validated, and the token is never exposed to the
browser. Without this optional adapter, Hanami fails transparently when
YouTube presents its anti-bot confirmation rather than attempting a bypass.

### Shazam-compatible recognition

- explicit microphone permission;
- mono capture and resampling to 16 kHz PCM16;
- 2048-point FFT, Hann window, four frequency bands and Shazam signature payload;
- bounded same-origin request to the Shazam discovery endpoint;
- normalized match card that can be searched or played in one tap.

The endpoint is unofficial and may rate-limit or change. Raw microphone audio is
not uploaded by Hanami; the browser produces and sends the compact acoustic
signature.

### External lyrics

The serverless provider chain tries LRCLIB first and then Unison, Paxsenix and
BetterLyrics. Requests have fixed hosts, timeouts, response-size limits and a
bounded cache. Synchronized LRC is preferred over plain text. The reader parses
multiple timestamps, highlights the active line and follows playback. Recent
lyrics are cached locally for reuse.

### Audio effects

Android's Equalizer, BassBoost, Virtualizer and LoudnessEnhancer are represented
with a Web Audio graph attached to both crossfade audio elements:

- ten peaking bands from 31 Hz to 16 kHz;
- 105 Hz low-shelf bass boost;
- stereo cross-mix widening;
- output gain and dry/wet bypass;
- Flat, Bass, Vocal, Rock and Night presets;
- persistent custom settings.

Remote media needs CORS permission once attached to Web Audio. Local files and
resolved YouTube audio are configured for this path.

## API routes

- `GET /api/music/capabilities`
- `GET /api/music/youtube/search?q=...`
- `POST /api/music/youtube/resolve` with `{ "videoId": "..." }`
- `POST /api/music/recognize` with a validated Shazam signature
- `GET /api/music/lyrics?title=...&artist=...&duration=...&videoId=...`

All routes validate lengths and identifiers, use fixed external origins, cap
response sizes and apply timeouts. No user cookies, YouTube credentials or
private network URLs are accepted.

## Files

- `api/music-services.mjs`
- `public/music-recognition.js`
- `public/music-equalizer.js`
- `public/reader-music-services.js`
- `public/reader-music.js`
- `tests/music-services-v129.test.mjs`
- `tests/music-services-mobile-v129.e2e.mjs`

See `THIRD_PARTY_NOTICES.md` and `docs/licenses/TSuki-GPL-3.0.txt` for upstream
attribution and GPL-3.0 terms.
