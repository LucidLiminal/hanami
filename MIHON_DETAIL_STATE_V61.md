# Mihon detail state v61

## Chapter metadata contract

Hanami now keeps the browser equivalent of Mihon's chapter reading state per chapter URL:

- `read`: completed/read state.
- `bookmark`: chapter bookmark.
- `lastPageRead`: zero-based last page position.
- `pageCount`: known reader page count.
- `lastReadAt`: latest reading timestamp.

`readingProgress` remains the precise Hanami resume cursor (`chapterUrl`, `pageIndex`, `pageOffset`, completion and timestamp). The detail CTA is **Empezar** until at least one chapter is read or has `lastPageRead > 0`, then becomes **Reanudar**.

The default chapter presentation is numeric descending, the contextual top bar updates its live count, and selected chapter labels retain sufficient contrast.
