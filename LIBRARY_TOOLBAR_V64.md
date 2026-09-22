# LibraryToolbar v64

Ported from the supplied `LibraryTab.kt` behavior while retaining Hanami's visual identity.

- Normal top bar: **Biblioteca**, Search, Filter and More.
- Search mode keeps `searchQuery` in Library state and filters as `onSearchQueryChange` fires.
- Filter opens the existing Library settings dialog and indicates active filters.
- More contains current-category refresh, global Library update and open-random-manga for the active category.
- Random now opens the selected manga detail instead of entering contextual selection.
- Top-bar action names are hidden visually; a 500 ms hold reveals a label for 2.4 seconds and consumes the action click.
- Escape/browser Back exits search mode before leaving Library.
