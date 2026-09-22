# Same-source migration v71

The restriction requiring a destination different from the origin has been removed.

- `MigrationConfigScreen` enables Continue whenever at least one source is selected.
- The selected source may be the manga's current source.
- `MigrateSearchScreen` includes the original source in global-search groups.
- Batch migration also searches the source currently assigned to each manga.
- The only remaining validation is that at least one installed source is selected.
