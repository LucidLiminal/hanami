# Reader Music · v128

> Historical baseline. External search, InnerTube resolution, recognition,
> lyrics and audio effects were added in v129; see
> `READER_MUSIC_SERVICES_V129.md`.

Hanami now includes a browser-native music player inside the chapter Reader.
Its architecture and interaction model are informed by the GPL-3.0 TSuki
project, adapted from Android/Media3 to Web APIs.

## Reader integration

- New **Música** destination in the Reader bottom bar.
- Compact player remains available while reading.
- Full bottom sheet for library, queue, playback and preferences.
- Playback survives page and chapter changes.
- Media Session metadata and system play/pause/previous/next/seek actions.

## Music library

- Imports MP3, M4A, AAC, WAV, OGG, Opus and FLAC selected by the user.
- Reads basic ID3 title, artist and album metadata when available.
- Falls back to `Artist - Title.ext` file-name parsing.
- Persists local audio blobs in IndexedDB for offline playback.
- Accepts direct HTTP(S) audio/stream URLs.
- Imports M3U and M3U8 playlists containing direct audio URLs.
- Search by title, artist or album.
- Per-track play-next and delete actions.
- 250 MB safety limit per local file with clear import errors.

## Player and queue

- Play/pause, previous, next and seek.
- Persistent volume.
- Editable queue with move up/down and remove.
- Queue shuffle and clear actions.
- Shuffle playback with recent-track avoidance.
- Repeat off, repeat all and repeat one.
- Equal-power dual-`HTMLAudioElement` crossfade from 0.5 to 12 seconds.
- Sleep timer for 15, 30 or 60 minutes, or at end of track.
- Queue, current track, position and preferences survive reloads.
- Autoplay is intentionally not resumed after a full reload; one user tap is
  required by browser media policies.

## Offline and PWA behavior

- `reader-music.js` is precached by the Hanami service worker.
- User-selected local audio is stored in the site's IndexedDB quota.
- Playback can continue with the Reader sheet closed and exposes OS controls
  where the browser supports Media Session.

## Scope and legal notes

The native TSuki implementations for YouTube/InnerTube extraction, NewPipe,
lyrics providers, Shazam recognition, Android equalizer effects, widgets and
Together sessions were not copied. They depend on native APIs or external
services and are not required for selecting music during manga reading.
Hanami does not bypass advertisements, DRM or protected streaming services.

See `THIRD_PARTY_NOTICES.md` and
`docs/licenses/TSuki-GPL-3.0.txt`.

## Regression coverage

- `tests/reader-music-v128.test.mjs`
- `tests/reader-music-mobile-v128.e2e.mjs`

The mobile Chromium test imports three real WAV tracks at 390 × 844, verifies
playback and queue navigation, exercises shuffle/repeat/crossfade/sleep timer,
rebuilds the Reader shell for another chapter, reloads the application, and
confirms that the library, queue, current track and preferences persist.
