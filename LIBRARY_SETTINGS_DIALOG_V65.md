# LibrarySettingsDialog v65

Ported from the supplied Kotlin component as a responsive, tabbed web dialog.

- **Filter**: tri-state Downloaded, Unread, Started, Bookmarked and Completed controls; connected tracking services appear dynamically and each receives its own tri-state filter.
- **Sort**: all Mihon Library sort modes, active direction toggling, optional tracker score, and Random refresh behavior.
- **Display**: compact/comfortable/cover-only/list chips, 0–10 column slider with Auto at zero, overlay indicators, Continue button, category tabs and item counts.
- Preference changes apply immediately and persist in browser storage; there is no generic Apply form.
- The shared overlay stack preserves outside-click, Escape and mobile Back dismissal.
