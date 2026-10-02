# Reader page actions and music discovery · v136

Version: `5.10.0` · PWA cache: `hanami-crimson-knot-v136`.

## Reader gesture

A long press on a reader page opens a floating bottom sheet with these actions,
in this order:

1. **Poner como portada** — confirmation, then a compressed custom cover saved
   in the personal library. Add the manga to the library first. Metadata refresh
   cannot overwrite the custom cover.
2. **Copiar al portapapeles** — copies the image as PNG, not its link. The Clipboard
   request is started during the user gesture, with promise-valued image data for
   browsers such as Safari.
3. **Compartir** — shares the selected image as a File using Web Share.
4. **Guardar** — downloads the original selected image, retaining its format
   and a sanitized manga/chapter/page filename.
5. **Hacer un comentario** — opens the existing comment editor at the originally
   pressed image coordinates.
6. **Instanciar una pista de música** — opens the independent music selector at
   those same page coordinates.

The gesture retains the pressed figure's chapter and image, including pages
from neighboring preloaded chapters. Scrolling, pointer cancellation and
pinching cancel the hold. The opening release cannot accidentally select an
action or dismiss the sheet. The next intentional tap remains usable.

Back, Escape, the close button and the backdrop dismiss the sheet. The selector
and action sheet trap keyboard focus and suspend interaction with the reader
behind them. Closing comments or music preserves the live reader session.
Right-click, the context-menu key and Shift+F10 also expose page actions.

For PDF documents, save/share act on the PDF file. Image-only cover, clipboard
and comment actions are disabled rather than pretending to copy a PDF image.

## Independent music screen

`reader-music-services.js` exposes `openPicker()` / `closePicker()`.
The screen root is `.reader-music-services.reader-music-picker`; it does not
contain the full player, local-file importer, queue or recognition controls.
The existing full player and its search/lyrics services remain available.

The new selector includes:

- A URL field with an explicit **URLs only for now** warning. HTTPS SoundCloud
  track and short links use the existing API/oEmbed integration. Text searches
  and unsupported hosts are rejected before any API request.
- **Para ti / Escuchado recientemente**: up to 30 unique available tracks,
  ordered by confirmed listening. Imports alone do not create recommendations.
  Local audio is confirmed with the `playing` event; SoundCloud also uses
  actual progress, including its event-independent polling fallback.
- **Tendencias / Lo más sonado**: aggregates from other users' activity inside
  Hanami, not SoundCloud-wide rankings and not local-history substitutes.
- Horizontal artwork cards, with taller recent cards and compact trend cards.

Selecting a track stores a local page instance and starts playback. A music
marker at the original point permits play/pause. If playback is unavailable,
the instance remains saved and the UI reports the playback error.
Instances are personal/local; this release does not synchronize page music
markers between group members or auto-start them while scrolling.

## Community backend activation

Run `supabase/hanami-reader-music-v136.sql` in the existing project's SQL Editor.
This migration is atomic and safe to reapply. Existing social configuration
and authentication are reused; the feature never silently creates an account.

The migration creates:

- `reader_music_tracks`: canonical public SoundCloud URLs and bounded metadata.
- `reader_music_activity`: authenticated play/use events with UUID idempotency.
- `record_reader_music_activity`: derives the actor from `auth.uid()`, rate-limits
  writes and accepts no client-supplied reader context.
- `list_reader_music_trends`: aggregate-only output with a 30-day window and
  the current authenticated user's own events excluded.

Ranking score is **plays + 3 × page uses**; unique listeners and latest activity
break ties. The response includes play/use/listener counts but no user IDs or
individual listening histories. Raw tables have RLS enabled and no direct
anonymous/authenticated table privileges. Artwork must use SoundCloud's CDN.

No local audio files, manga/chapter/page identifiers, comments or personal
history are sent as community activity. Private page instances stay in the
browser. Incognito listening does not create history or community events.
Only events belonging to the current authenticated identity can be flushed.
Pending events retain their UUIDs for retry without duplicate counts.

Local state is stored under `hanami-reader-music-discovery-v1`; the previous
IndexedDB music library is preserved. Browser data deletion removes local
history and instances.

## Browser limits

Clipboard image writes require a secure context and a compatible browser.
Native file sharing requires `navigator.share` and `navigator.canShare`.
Unsupported actions show a useful error; they do not silently copy a URL or
report a successful share. Save remains the fallback.

SoundCloud playback still uses the official Widget at fixed full volume.
The removed volume, crossfade, equalizer and sleep controls are not restored.
External playback availability and autoplay permissions remain controlled by
the provider and browser.

## Verification

- `npm test`: 107 unit/contract regression cases, including v136.
- `npm run test:e2e:reader-actions`: mouse and touch holds, the six actions,
  clipboard PNG data, shared/downloaded files, cover confirmation/persistence,
  anchored comments, URL validation, recent history, page instances, community
  RPCs, empty/error/unconfigured states and preserved reader position.
- Existing mobile comment, reader-position, SoundCloud, music-player and
  runtime-console E2E cases.
- `npm run test:sql:music`: optional QA dependency `@electric-sql/pglite`.
  Executes the migration against PostgreSQL, including roles/RLS, actor
  spoofing rejection, safe reapply, event deduplication, rate limits, ranking
  and other-user filtering. `PGLITE_PATH` can select an installed module path.
- Visual inspection at 390 × 844 and 1280 × 900.

E2E tests use fixtures for provider and community responses; they do not write
to a production Supabase project. PostgreSQL QA is also local.