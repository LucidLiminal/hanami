# Library visual-state fixes v66

## Unread badge
An untouched Library item now reports every known chapter as unread. Legacy or newly added items whose chapter count is still unknown are hydrated once from their source in the background; the chapter list, total, zero read count and per-chapter unread metadata are persisted before re-rendering.

## Column slider
The mobile `!important` column override was removed. Slider input now updates the existing grid's inline `grid-template-columns` property and output label in place, rather than re-rendering and replacing the slider during the pointer gesture. Values persist from 0 (Auto) through 10.
