# Unified overlay dismissal v62

Dialogs, menus, sheets and popups now participate in a transient overlay stack. Opening one adds a same-screen browser-history entry. Pressing Android/iOS browser Back consumes that entry and closes only the active overlay, without navigating away from the underlying Hanami screen.

The same topmost-first behavior applies to Escape and pointer presses outside the active surface. Native dialog close buttons and programmatic closes synchronize their transient history entry automatically.

Managed surfaces include the global dialog, extension menu, manga detail menus/settings, Reader sheets/transitions, Notes menu and Tracking menus.
