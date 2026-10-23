# Migration destination fix v70

- Source IDs are compared canonically as strings, avoiding JSON number/string mismatches.
- Installed, disabled, pinned and saved migration-source sets use tolerant membership checks.
- For a single manga, stale or empty saved selections fall back to every installed and enabled destination except the origin.
- `MigrationConfigScreen` disables Continue when the selection contains no actual destination.
- A stale restored `MigrateSearchScreen` now explains that another web source must be installed and offers a direct Extensiones action instead of the misleading “No hay fuentes de destino seleccionadas”.
