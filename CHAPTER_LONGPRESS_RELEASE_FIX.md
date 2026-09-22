# Chapter long-press release correction

Touch and mouse browsers emit a normal click immediately after a completed long press. The long press selected the chapter, then that synthetic click entered the ordinary selection toggle and removed it.

A successful chapter long press now arms a short-lived, chapter-specific click suppression token. Only the immediate click for that same chapter is consumed. The token clears after use or expires after 700 ms, so later intentional taps continue to work. The selection anchor reset from v59 remains intact.
