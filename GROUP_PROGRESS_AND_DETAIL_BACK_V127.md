# Group progress and Mihon Details Back fix · v127

## 1. Group reading progress

### Problem

Shared works stored reader progress, but the group-specific Mihon Details flow
did not consume that record. Its primary action always behaved as a fresh
start, reopening page 1 of chapter 1.

### Fix

- Expose the current member's group progress through `ownProgress`.
- Persist both `pageIndex` and `pageOffset`.
- Feed group progress into Mihon Details so its primary action changes from
  **Empezar** to **Reanudar**.
- Resolve the saved chapter with the same `chapterToContinue` logic used by
  Library.
- Pass the saved page and offset into Reader.
- After a completed chapter, continue with the next chapter instead of
  reopening the completed one.
- Make Mihon Details honor externally supplied progress even when the work is
  not part of the personal library.

## 2. `data-md-back` leaving stale UI

### Problem

The screen history could already move to the previous URL while a pending
details request finished later and mounted `.mihon-detail` over the restored
screen.

### Fix

Library, Explore, and group detail loaders now retain the screen ID that
started the request. Before mounting their asynchronous result, they verify
that the same screen is still current. Late responses are discarded after
Back navigation.

## Regression coverage

- `tests/group-progress-resume-v127.test.mjs`
- `tests/group-progress-resume-mobile-v127.e2e.mjs`

The mobile test at 390 × 844 verifies:

1. page 3 of chapter 1 is persisted for the current group member;
2. reopening the work resumes page 3 of chapter 1;
3. completing chapter 1 continues with chapter 2;
4. `data-md-back` returns from Mihon Details to the group shelf;
5. a delayed details response cannot make Mihon Details reappear after Back.
