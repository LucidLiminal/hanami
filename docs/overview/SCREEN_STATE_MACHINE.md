# Hanami screen history state machine

Hanami now keeps a bounded, session-persistent screen graph synchronized with the browser history. Each route records its type, payload, parent, closed state and runtime restore/suspend handlers.

Managed states:
- root destinations and Explore tabs;
- source browser;
- Explore manga detail;
- Library manga detail;
- reader overlay.

Back, browser Back, Escape and the reader arrow all use one transition path. A pop suspends only the current screen and restores exactly the destination entry. Legacy pop listeners are isolated so they cannot close both Reader and detail in one transition. Closed entries are skipped until the nearest valid parent/root is found. Forward navigation can restore a suspended screen during the same session.
