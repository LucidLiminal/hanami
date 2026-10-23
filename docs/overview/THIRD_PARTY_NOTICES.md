# Third-party notices

The Olympus adapter is a manual JavaScript reimplementation informed by the Apache-2.0 Keiyoushi extension source layout. Upstream: https://github.com/keiyoushi/extensions-source/tree/main/src/es/olympusscanlation

## Mihon reader page actions

The six-action browser sheet adapts the first four image actions from the
user-provided `mihon-main.zip`: `ReaderPageActionsDialog.kt` and the image
save/share/cover methods in `ReaderViewModel.kt`. The Android implementations
are replaced with browser Blob/File, Clipboard, Web Share, download and local
library APIs. Cover confirmation and the distinction between the selected
page's image and its URL are preserved.

- Upstream project: Mihon
- Source paths: `eu/kanade/presentation/reader/ReaderPageActionsDialog.kt` and
  `eu/kanade/tachiyomi/ui/reader/ReaderViewModel.kt`
- License: Apache License 2.0
- License copy: `docs/licenses/Mihon-APACHE-2.0.txt`

Keiyoushi and Mihon do not endorse or support Hanami. The provider is not affiliated with Hanami. Local visual assets came from the user's Hanami reference project.

## TSuki music player and external music services

The Reader Music modules are browser/serverless adaptations informed by TSuki's
music architecture and interaction model. Ported concepts and GPL-derived
implementation details include MediaTrack metadata, persistent queues, the
Shazam fingerprint payload generator and the external lyrics provider chain.

- Upstream project: TSuki (`f97e58ecdcd964da5da0c02d427ec471b1cc2361`)
- Upstream license: GNU General Public License v3.0
- License copy: `docs/licenses/TSuki-GPL-3.0.txt`

Hanami replaces Android Media3/ExoPlayer, NewPipe, AudioRecord and Android audio
effects with browser/serverless equivalents: HTMLAudioElement, getUserMedia,
IndexedDB and Vercel functions. The Shazam signature algorithm in
`public/music-recognition.js` is a JavaScript port of TSuki's GPL-3.0
`ShazamSignatureGenerator.kt`. InnerTube, Shazam, LRCLIB, Unison, Paxsenix and
BetterLyrics are third-party network services and are not affiliated with or
endorsed by Hanami or TSuki.

The InnerTube resolver uses only direct audio URLs present in the service
response. It deliberately does not implement signature deciphering, DRM
circumvention, protected-media downloading or advertisement bypass. External
service availability, terms and rate limits remain controlled by each
provider. Microphone capture starts only after explicit user interaction and
only the generated acoustic signature is sent to Hanami's same-origin API.
