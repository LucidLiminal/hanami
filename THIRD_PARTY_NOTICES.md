# Third-party notices

The Olympus adapter is a manual JavaScript reimplementation informed by the Apache-2.0 Keiyoushi extension source layout. Upstream: https://github.com/keiyoushi/extensions-source/tree/main/src/es/olympusscanlation

Keiyoushi and Mihon do not endorse or support Hanami. The provider is not affiliated with Hanami. Local visual assets came from the user's Hanami reference project.

## TSuki music player

The Reader Music module is a browser adaptation informed by TSuki's music
architecture and interaction model: MediaTrack metadata, local audio library,
editable queue, persistent player preferences, compact/full player controls,
crossfade and sleep timer.

- Upstream project: TSuki (`f97e58ecdcd964da5da0c02d427ec471b1cc2361`)
- Upstream license: GNU General Public License v3.0
- License copy: `docs/licenses/TSuki-GPL-3.0.txt`

Android-only Media3/ExoPlayer, InnerTube/NewPipe streaming, lyrics providers,
Shazam recognition, equalizer effects, widgets and Together networking were
not copied because those implementations depend on native Android APIs or
external services. Hanami uses an original browser implementation built on
HTMLAudioElement, IndexedDB and the Media Session API. It supports user-owned
local audio and direct HTTP(S) audio URLs; it does not bypass advertisements or
extract protected streaming media.
