# MigrateSearchScreen v68

The single-item continuation of `MigrationConfigScreen` now follows the supplied Mihon wrapper:

- `GlobalSearchToolbar` equivalent with editable search query, submit action, per-source progress and result visibility toggle.
- Source filtering remains hidden, as specified by `hideSourceFilter = true`.
- `GlobalSearchContent` equivalent groups results by selected destination source and excludes the source currently owning the manga.
- Source headings open that source; tapping a result opens migration confirmation; holding a result opens its source detail.
- Empty and failed sources remain visible unless “only show sources with results” is active.
- The screen uses a replace transition from configuration. Multi-item selection continues separately to the batch `MigrationList` flow.
