# Reader slider seek — Mihon-style web port

Mihon's webtoon reader is backed by a RecyclerView/LayoutManager: selecting a page addresses an adapter position and lets the layout manager place/recycle that item, rather than animating through every intervening pixel.

Hanami's browser equivalent now:
- treats slider movement as an atomic seek transaction;
- suppresses scroll/chapter detection while seeking;
- uses stable virtual page shells for unloaded images;
- materializes the target page plus immediate neighbors;
- positions the target directly with an anchor, never with a long smooth scroll;
- corrects the anchor after image dimensions become available;
- previews slider labels during drag and commits once released;
- preserves the current chapter throughout the transaction.
