# SoundCloud Widget · v135

Hanami v135 replaces extractors and public relay instances with SoundCloud's
documented web integration.

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