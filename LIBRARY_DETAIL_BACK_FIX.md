# Library detail back correction

The detail callback used `managedBack() || history.back()`. Because the managed transition intentionally returns no value, JavaScript also executed the fallback, causing two consecutive history steps: Library detail → Library → Explore.

Back callbacks now choose exactly one branch with an explicit conditional. Closing a Library detail performs one transition and restores the Library root.
