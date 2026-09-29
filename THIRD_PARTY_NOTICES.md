# Third-party notices

The Olympus adapter is a manual JavaScript reimplementation informed by the Apache-2.0 Keiyoushi extension source layout. Upstream: https://github.com/keiyoushi/extensions-source/tree/main/src/es/olympusscanlation

Keiyoushi and Mihon do not endorse or support Hanami. The provider is not affiliated with Hanami. Local visual assets came from the user's Hanami reference project.

## TSuki music player and external music services

The Reader Music modules are browser/serverless adaptations informed by TSuki's
music architecture and interaction model. Ported concepts and GPL-derived
implementation details include MediaTrack metadata, persistent queues,
crossfade and sleep controls, the InnerTube request/response model, the Shazam
fingerprint payload generator, the external lyrics provider chain, and the
native equalizer effect model.

- Upstream project: TSuki (`f97e58ecdcd964da5da0c02d427ec471b1cc2361`)
- Upstream license: GNU General Public License v3.0
- License copy: `docs/licenses/TSuki-GPL-3.0.txt`

Hanami replaces Android Media3/ExoPlayer, NewPipe, AudioRecord and Android audio
effects with browser/serverless equivalents: HTMLAudioElement, Web Audio,
getUserMedia, IndexedDB and Vercel functions. The Shazam signature algorithm in
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
