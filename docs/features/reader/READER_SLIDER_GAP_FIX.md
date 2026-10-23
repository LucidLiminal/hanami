# Slider anchor blank-gap correction

The gap was caused by retaining a virtual `min-height` on the loaded target figure. Because the figure is a centered grid container, an image shorter than that placeholder was vertically centered and left empty space before the image.

The fix keeps `min-height` only while an image is genuinely pending. Once decoded, the target removes both the inline `min-height` and loading marker, then recalculates the same direct viewport anchor. Loaded figures are not frozen again on later seeks, and continuous-reader figures align content to the start as a transient-layout safeguard.
