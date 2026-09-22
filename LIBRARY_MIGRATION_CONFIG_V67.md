# Library MigrationConfigScreen v67

The Library bottom-action migration path is now separate from Browse > Migrate.

1. The selected Library IDs are captured before selection mode is cleared.
2. A dedicated `MigrationConfigScreen` is pushed onto Hanami's screen stack.
3. Installed web sources are partitioned into **Selected** and **Available** groups.
4. The app bar supports Select all, Select none, Select enabled and Select pinned.
5. Selected source order is persistent and can be rearranged with drag and drop.
6. Continue replaces configuration with a dedicated single-title search or batch migration flow; it never opens Browse's source migration tab.
7. Successful migration preserves Library metadata, records the old source, moves notes and writes migration history.
