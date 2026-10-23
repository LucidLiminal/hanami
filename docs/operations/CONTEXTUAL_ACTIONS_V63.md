# Contextual actions v63

## Chapter detail
The bottom toolbar derives actions from the current selection. If every selected chapter is read, the read-state action becomes **Mark unread**; otherwise (unread or mixed), it becomes **Mark read**. If every selected chapter is bookmarked, the bookmark action becomes **Remove favorite**; otherwise it becomes **Mark favorite**. **All read up to here** marks the selected boundary and all older numbered chapters as read. Download applies only to selected chapters.

## Library
The fixed contextual actions are Assign categories, Mark read, Mark unread, Download, and More. Download offers next 1/5/10/25, unread and favorites. More opens Migration and Delete; Delete offers independent Library and downloaded-chapters checkboxes.

## Discoverable labels
Bottom action labels are visually hidden by default while remaining accessible through `aria-label` and `title`. Holding an action for 500 ms shows its name for 2.4 seconds and consumes the generated click, so the action is not executed.
