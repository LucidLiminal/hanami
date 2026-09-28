# Reader comment position fix · v126

## Problem

After publishing, editing, or deleting an image comment, returning from the
comment editor recreated the reader from the progress snapshot captured when
the chapter was first opened. This could move the reader several pages
backwards even though the current position had already advanced.

## Cause

The comment editor is a child entry in `HanamiScreens`. When Back returned to
the reader entry, its runtime `restore` handler always called `open(o, true)`.
The `o.resume` value in that closure was the initial value, not the live
chapter, page, offset, or scroll position.

## Fix

The reader now associates its history handler with the exact live session it
opened. If that same reader instance is still visible beneath a child screen,
restoration is a no-op. A full reopen remains available when the instance no
longer exists, preserving reload and deep-restoration behavior.

## Regression coverage

- Static guard: `tests/reader-comment-position-v126.test.mjs`
- Mobile Chromium flow:
  `tests/reader-comment-position-mobile-v126.e2e.mjs`
- Verified at 390 × 844:
  - open a three-page chapter;
  - move to page 3;
  - create and publish an image comment;
  - return to the reader;
  - assert the page indicator and exact scroll position are unchanged.
