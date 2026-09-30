# SoundCloud Widget · v135

Hanami v135 replaces extractors and public relay instances with SoundCloud's
documented web integration.

## v135.1 loader correction

The classic `https://w.soundcloud.com/player/api.js` script is loaded without a
`crossorigin` attribute. SoundCloud does not return an
`Access-Control-Allow-Origin` header for this classic script, so forcing a CORS
request prevents the browser from executing it. Failed or timed-out script
elements are now removed, allowing the next playback attempt to start cleanly.
The iframe is also attached to the document before `SC.Widget` is initialized.

## v135.2 unavailable-stream handling

The iframe now grants both `autoplay` and `encrypted-media`, matching
SoundCloud's oEmbed output for licensed tracks. Some tracks are still advertised
as embeddable while the transcoding selected by the official Widget returns
`404`. Because `SC.Widget` does not expose transcoding selection and may only
emit `PLAY` followed by `PAUSE`, Hanami watches for playback attempts that
produce no progress. After eight seconds it reports a useful error and keeps
the public SoundCloud link available so the reader can open the original or
choose a different upload.

## Playback

The browser loads `https://w.soundcloud.com/player/api.js` and creates one
persistent `SC.Widget` iframe. Hanami maps Widget events and methods to its
existing player:

- `PLAY`, `PAUSE`, `PLAY_PROGRESS`, `FINISH` and `ERROR`;
- play, pause, seek and volume;
- queue navigation, sleep timer, lyrics and Media Session;
- persistence of the SoundCloud permalink and public metadata.

The audio is requested by the SoundCloud iframe. It is not resolved,
downloaded, cached or relayed by Hanami or Vercel.

## Search and pasted links

Pasted `soundcloud.com` track URLs use the public oEmbed endpoint and need no
credentials.

Text search uses the current public API with OAuth Client Credentials. Configure
both variables in local development and Vercel:

```text
HANAMI_SOUNDCLOUD_CLIENT_ID
HANAMI_SOUNDCLOUD_CLIENT_SECRET
```

The secret stays server-side. The backend reuses the access token, refreshes it
when needed and returns only public track metadata and permalinks. It filters
out blocked, non-streamable and non-embeddable tracks.

## Intentional limits

- SoundCloud playback does not pass through Web Audio because it lives in a
  cross-origin iframe. Equalizer and crossfade remain available for local and
  direct audio only.
- Hanami stores no SoundCloud audio and offers no offline playback.
- A track can disappear or become unavailable when its uploader changes access
  or embedding settings.
- Every result and the current SoundCloud track link back to their original
  permalink.

## Regression coverage

- `tests/soundcloud-widget-v135.test.mjs`
- `tests/soundcloud-widget-v135.e2e.mjs`