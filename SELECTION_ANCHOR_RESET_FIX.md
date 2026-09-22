# Contextual selection anchor reset

Both Library and chapter selection retained their range-selection anchor after the selected set became empty. A later long press therefore interpreted the new gesture as a range extending from a stale item.

The selection invariant is now explicit: when selection count reaches zero, the range anchor and related transient state are reset. This applies to individual deselection, toolbar close, inversion, category actions, deletion, popstate cleanup and chapter selection.
